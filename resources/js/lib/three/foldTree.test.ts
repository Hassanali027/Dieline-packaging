import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/mailer.json';
import type { DielineResult, Panel } from '../../types/design';
import { bounds, pt, rect } from '../dieline/geometry';
import { autoBuildFoldTreeFromBase, findBasePanel, updatePanelFoldAngle } from './foldMapping';
import { buildFoldTree, panelMatrices, toWorld } from './foldTree';

const result = fixture.result as DielineResult;
const L = 220;
const W = 160;
const D = 70;

function foldedPoints(id: string, progress: number) {
    const panel = result.panels.find((p) => p.id === id)!;
    const m = panelMatrices(buildFoldTree(result.panels), progress).get(id)!;
    return panel.polygon.map((p) => toWorld(p).applyMatrix4(m));
}

describe('fold tree', () => {
    const base = bounds([result.panels.find((p) => p.id === 'base')!.polygon]);

    it('builds one root (the base) with every panel reachable', () => {
        const roots = buildFoldTree(result.panels);
        expect(roots.map((r) => r.panel.id)).toEqual(['base']);
        const count = (n: (typeof roots)[number]): number => 1 + n.children.reduce((s, c) => s + count(c), 0);
        expect(count(roots[0])).toBe(result.panels.length);
    });

    it('keeps everything flat at progress 0', () => {
        for (const panel of result.panels) {
            for (const p of foldedPoints(panel.id, 0)) {
                expect(Math.abs(p.y)).toBeLessThan(1e-6);
            }
        }
    });

    it('stands the walls up at progress 1', () => {
        for (const p of foldedPoints('back', 1)) {
            expect(p.z).toBeCloseTo(base.minY, 3);
            expect(p.y).toBeGreaterThanOrEqual(-1e-6);
            expect(p.y).toBeLessThanOrEqual(D + 1e-6);
        }
        for (const p of foldedPoints('front', 1)) expect(p.z).toBeCloseTo(base.maxY, 3);
        for (const p of foldedPoints('side-left', 1)) expect(p.x).toBeCloseTo(-base.minX, 3);
        for (const p of foldedPoints('side-right', 1)) expect(p.x).toBeCloseTo(-base.maxX, 3);
    });

    it('closes the lid over the base', () => {
        for (const p of foldedPoints('lid', 1)) {
            expect(p.y).toBeCloseTo(D, 3);
            // world X is the mirrored dieline X
            expect(-p.x).toBeGreaterThanOrEqual(base.minX - 1e-6);
            expect(-p.x).toBeLessThanOrEqual(base.minX + L + 1e-6);
            expect(p.z).toBeGreaterThanOrEqual(base.minY - 1e-6);
            expect(p.z).toBeLessThanOrEqual(base.minY + W + 1e-6);
        }
    });

    it('rolls the double walls inside the box', () => {
        for (const p of foldedPoints('side-left-inner', 1)) {
            expect(p.x).toBeCloseTo(-base.minX, 3);
            expect(p.y).toBeGreaterThan(-1e-6);
        }
    });

    it('auto-builds a fold tree from a chosen base panel for uploaded dielines', () => {
        const flatPanels: Panel[] = [
            { id: 'p-base', name: 'Base', polygon: rect(0, 0, 100, 80), foldAngle: 0, side: 'outside' },
            { id: 'p-top', name: 'Top Flap', polygon: rect(0, -40, 100, 40), foldAngle: 0, side: 'outside' },
            { id: 'p-lid', name: 'Lid', polygon: [pt(0, -120), pt(100, -120), pt(100, -40), pt(0, -40)], foldAngle: 0, side: 'outside' },
        ];

        const mapped = autoBuildFoldTreeFromBase(flatPanels, 'p-base', 90);
        expect(mapped.find((p) => p.id === 'p-base')?.parentId).toBeUndefined();
        expect(mapped.find((p) => p.id === 'p-top')?.parentId).toBe('p-base');
        expect(mapped.find((p) => p.id === 'p-lid')?.parentId).toBe('p-top');
        expect(mapped.find((p) => p.id === 'p-lid')?.foldAngle).toBe(90);

        const adjusted = updatePanelFoldAngle(mapped, 'p-lid', 135);
        expect(adjusted.find((p) => p.id === 'p-lid')?.foldAngle).toBe(135);
    });
});

describe('fold mapping base panel', () => {
    const panels: Panel[] = [
        { id: 'loose', name: 'Loose label', polygon: rect(300, 300, 20, 20), foldAngle: 0, side: 'outside' },
        { id: 'side', name: 'Side', polygon: rect(0, -40, 100, 40), foldAngle: 0, side: 'outside' },
        { id: 'floor', name: 'Floor', polygon: rect(0, 0, 100, 80), foldAngle: 0, side: 'outside' },
    ];

    it('is null before anything is mapped', () => {
        expect(findBasePanel(panels)).toBeNull();
    });

    it('is the chosen floor, not an unlinked panel that comes first', () => {
        const mapped = autoBuildFoldTreeFromBase(panels, 'floor');
        expect(mapped.find((p) => p.id === 'loose')?.parentId).toBeUndefined();
        expect(findBasePanel(mapped)?.id).toBe('floor');
    });
});
