import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/mailer.json';
import type { DielineResult } from '../../types/design';
import { bounds } from '../dieline/geometry';
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
});
