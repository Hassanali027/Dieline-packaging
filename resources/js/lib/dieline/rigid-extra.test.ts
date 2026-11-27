import { describe, expect, it } from 'vitest';
import type { BoxParams } from '../../types/design';
import { area, extractPart, generateDieline, union } from './index';

const sample = (style: BoxParams['style']): BoxParams => ({
    style,
    length: 200,
    width: 150,
    depth: 60,
    thickness: 2,
    unit: 'mm',
    construction: 'rigid',
    rigid: { boardThickness: 2, turnIn: 18, lidDepth: 30, lidClearance: 1.5, shoulderHeight: 18 },
});

function expectValidStructure(result: ReturnType<typeof generateDieline>) {
    const ids = new Set(result.panels.map((panel) => panel.id));
    expect(ids.size).toBe(result.panels.length);
    for (const panel of result.panels) {
        if (panel.parentId) {
            expect(ids.has(panel.parentId), panel.id).toBe(true);
            expect(panel.hinge, panel.id).toBeDefined();
            expect(Math.hypot(panel.hinge!.b.x - panel.hinge!.a.x, panel.hinge!.b.y - panel.hinge!.a.y)).toBeGreaterThan(0);
        }
    }
    for (const piece of result.chipboard ?? []) {
        expect(piece.width).toBeGreaterThan(0);
        expect(piece.height).toBeGreaterThan(0);
        expect(piece.quantity).toBeGreaterThan(0);
    }
}

describe('rigid Sprint 3 structures', () => {
    it('builds the drawer tray, liner, and closed four-wall sleeve as separate printable parts', () => {
        const result = generateDieline(sample('rigid-drawer'));
        expectValidStructure(result);
        expect(result.parts).toEqual(['drawer', 'liner', 'sleeve']);
        expect(result.panels.filter((panel) => panel.part === 'drawer').length).toBeGreaterThanOrEqual(13);
        expect(result.panels.filter((panel) => panel.part === 'sleeve').map((panel) => panel.id)).toEqual(
            expect.arrayContaining(['sleeve-bottom', 'sleeve-side-a', 'sleeve-top', 'sleeve-side-b', 'sleeve-glue']),
        );
        expect(result.chipboard?.some((piece) => piece.part === 'drawer')).toBe(true);
        expect(result.chipboard?.some((piece) => piece.part === 'sleeve')).toBe(true);
    });

    it('builds a four-wall shoulder neck between a wrapped base and lid', () => {
        const result = generateDieline(sample('rigid-shoulder'));
        expectValidStructure(result);
        expect(result.parts).toEqual(['base', 'liner', 'sleeve', 'lid']);
        expect(result.panels.filter((panel) => panel.part === 'sleeve' && panel.id.startsWith('sleeve-')).length).toBe(5);
        expect(result.panels.find((panel) => panel.id === 'sleeve-side-b')?.parentId).toBe('sleeve-back');
        expect(result.chipboard?.filter((piece) => piece.part === 'sleeve')).toHaveLength(2);
    });

    it('builds a tray plus one connected back-spine-front book cover', () => {
        const result = generateDieline(sample('rigid-book'));
        expectValidStructure(result);
        expect(result.parts).toEqual(['base', 'liner', 'lid']);
        expect(result.panels.find((panel) => panel.id === 'lid-spine')?.parentId).toBe('lid-back');
        expect(result.panels.find((panel) => panel.id === 'lid-front')?.parentId).toBe('lid-spine');
        expect(result.panels.find((panel) => panel.id === 'lid-front')?.hinge).toBeDefined();
        // Back, spine and front boards.
        expect(result.chipboard?.filter((piece) => piece.part === 'lid').map((piece) => piece.name)).toEqual([
            'Book back board',
            'Book spine board',
            'Book front board',
        ]);
        // The spine wrap turns in at both ends like the covers.
        expect(
            result.panels.filter((panel) => panel.parentId === 'lid-spine' && panel.id.startsWith('lid-turnin-')).map((panel) => panel.id),
        ).toEqual(['lid-turnin-spine-top', 'lid-turnin-spine-bottom']);
    });
});

describe('rigid Sprint 3 sheets', () => {
    it.each(['rigid-drawer', 'rigid-shoulder', 'rigid-book'] as const)('%s: no panels overlap on any printed sheet', (style) => {
        const result = generateDieline(sample(style));
        for (const part of result.parts ?? []) {
            const panels = extractPart(result, part).panels;
            const total = panels.reduce((s, p) => s + area(p.polygon), 0);
            const merged = union(panels.map((p) => p.polygon)).reduce((s, poly) => s + area(poly), 0);
            expect(merged, `${style} / ${part}`).toBeCloseTo(total, 0);
        }
    });
});
