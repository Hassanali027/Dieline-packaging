import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasObject } from '../types/design';
import { cloneWithNewIds, useEditorStore } from './useEditorStore';

const obj = (id: string, extra: Partial<CanvasObject> = {}): CanvasObject => ({
    id,
    type: 'shape',
    side: 'outside',
    props: { shape: 'rect', left: 10, top: 20, width: 5, height: 5 },
    ...extra,
});

const ids = () => useEditorStore.getState().design.outside.map((o) => o.id);
const store = () => useEditorStore.getState();

beforeEach(() => {
    const base = store().design;
    store().loadDesign(
        { ...base, outside: [obj('a'), obj('b'), obj('c'), obj('d')], inside: [], faceColors: {} },
        { id: null, name: '', baseline: null },
    );
});

describe('editor store objects', () => {
    it('reorders the z-order', () => {
        store().moveObjects('outside', ['b'], 'forward');
        expect(ids()).toEqual(['a', 'c', 'b', 'd']);
        store().moveObjects('outside', ['b'], 'front');
        expect(ids()).toEqual(['a', 'c', 'd', 'b']);
        store().moveObjects('outside', ['d', 'b'], 'back');
        expect(ids()).toEqual(['d', 'b', 'a', 'c']);
        store().moveObjects('outside', ['a', 'c'], 'backward');
        expect(ids()).toEqual(['d', 'a', 'c', 'b']);
    });

    it('replaces objects at the top-most one (grouping) and selects the result', () => {
        const group = obj('g', { type: 'group', props: { children: [obj('b'), obj('c')] } });
        store().replaceObjects('outside', ['b', 'c'], [group]);
        expect(ids()).toEqual(['a', 'g', 'd']);
        expect(store().selectedObjectIds).toEqual(['g']);

        // ungroup puts the children back where the group was
        store().replaceObjects('outside', ['g'], [obj('b'), obj('c')]);
        expect(ids()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('duplicates and pastes with fresh ids (also inside groups) and an offset', () => {
        store().replaceObjects('outside', ['c', 'd'], [obj('g', { type: 'group', props: { left: 50, top: 50, children: [obj('c'), obj('d')] } })]);
        store().duplicateObjects('outside', ['g']);
        const copy = store().design.outside.at(-1)!;
        expect(copy.id).not.toBe('g');
        expect(copy.props.left).toBe(55);
        const childIds = (copy.props.children as CanvasObject[]).map((c) => c.id);
        expect(childIds).not.toContain('c');
        expect(new Set(childIds).size).toBe(2);

        store().copyObjects('outside', ['a']);
        store().pasteObjects('outside');
        store().pasteObjects('outside');
        const pasted = store().design.outside.slice(-2);
        expect(pasted.map((o) => o.props.left)).toEqual([15, 20]);
        expect(store().selectedObjectIds).toEqual([pasted[1].id]);
    });

    it('patches props and lock state as one undo step', () => {
        const temporal = useEditorStore.temporal.getState();
        store().updateObjects('outside', [
            { id: 'a', props: { left: 99 } },
            { id: 'b', locked: true },
        ]);
        expect(store().design.outside[0].props).toMatchObject({ left: 99, top: 20 });
        expect(store().design.outside[1].locked).toBe(true);
        expect(useEditorStore.temporal.getState().pastStates).toHaveLength(1);
        useEditorStore.temporal.getState().undo();
        expect(store().design.outside[0].props.left).toBe(10);
        expect(temporal).toBeDefined();
    });

    it('does not record undo steps for UI-only changes', () => {
        store().setActiveTab('text');
        store().setSelectedObjectIds(['a']);
        store().setFoldProgress(0.3);
        expect(useEditorStore.temporal.getState().pastStates).toHaveLength(0);
    });

    it('cloneWithNewIds leaves the original alone', () => {
        const original = obj('x', { type: 'group', props: { children: [obj('y')] } });
        const copy = cloneWithNewIds(original);
        expect(original.id).toBe('x');
        expect((original.props.children as CanvasObject[])[0].id).toBe('y');
        expect(copy.id).not.toBe('x');
    });
});
