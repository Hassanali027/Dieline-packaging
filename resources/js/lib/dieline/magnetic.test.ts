import { describe, expect, it } from 'vitest';
import type { BoxParams } from '../../types/design';
import { buildAssembly } from '../three/assembly';
import { foldedBounds } from '../three/foldTree';
import { area, extractPart, generateDieline, magneticSizes, union } from './index';

/** Same as the seeded "Rigid Magnetic Box" product. */
const params: BoxParams = {
    style: 'rigid-magnetic',
    length: 220,
    width: 160,
    depth: 70,
    thickness: 2,
    unit: 'mm',
    construction: 'rigid',
    rigid: { boardThickness: 2, turnIn: 18, magnet: true },
};

const result = generateDieline(params);
const sizes = magneticSizes(params);

describe('rigid magnetic box', () => {
    it('prints a cover, a base and a liner', () => {
        expect(result.parts).toEqual(['lid', 'base', 'liner']);
        const cover = extractPart(result, 'lid');
        expect(cover.panels.map((p) => p.id)).toEqual(
            expect.arrayContaining(['lid-top', 'lid-back', 'lid-front', 'lid-turnin-back', 'lid-turnin-front', 'lid-turnin-top-left']),
        );
    });

    it('sizes the cover around the base', () => {
        expect(sizes.base).toEqual({ length: 224, width: 164, height: 72 });
        // Back board = base height + top board; top spans base + back + flap boards.
        expect(sizes.cover.back).toBeCloseTo(74, 6);
        expect(sizes.cover.top).toBeCloseTo(164 + 4 + 0.4 + 1.5, 6);
        // Front flap defaults to 60% of the base height.
        expect(sizes.cover.flap).toBeCloseTo(72 * 0.6, 6);
        expect(magneticSizes({ ...params, rigid: { ...params.rigid!, lidDepth: 30 } }).cover.flap).toBe(30);
    });

    it('lists the chipboard blanks, including the three cover boards', () => {
        const cover = result.chipboard!.filter((c) => c.part === 'lid').map((c) => c.name);
        expect(cover).toEqual(['Cover back board', 'Cover top board', 'Cover front flap board']);
        expect(result.chipboard!.find((c) => c.name === 'Cover top board')).toMatchObject({ width: 225.9, height: 169.9 });
    });

    it('has no overlapping panels on the printed sheets', () => {
        for (const part of result.parts!) {
            const panels = extractPart(result, part).panels;
            const total = panels.reduce((s, p) => s + area(p.polygon), 0);
            const merged = union(panels.map((p) => p.polygon)).reduce((sum, poly) => sum + area(poly), 0);
            expect(merged).toBeCloseTo(total, 0);
        }
    });

    it('folds the cover into a top with the back and front flap hanging down', () => {
        const cover = extractPart(result, 'lid');
        const box = foldedBounds(cover.panels, 1);
        // Folded: as long as the cover, as deep as the top, as tall as the back (+ wrap over the edge).
        expect(box.max.x - box.min.x).toBeCloseTo(sizes.cover.length, 3);
        expect(box.max.z - box.min.z).toBeCloseTo(sizes.cover.top, 3);
        expect(box.max.y - box.min.y).toBeCloseTo(sizes.cover.back + sizes.board, 3);
    });

    it('opens on its hinge in the 3D assembly', () => {
        const closed = buildAssembly('rigid-magnetic', result, 1, sizes.board).find((p) => p.key === 'lid');
        const open = buildAssembly('rigid-magnetic', result, 0, sizes.board).find((p) => p.key === 'lid');
        expect(closed?.hingeRotation?.angle).toBeCloseTo(0, 6);
        expect(Math.abs(open?.hingeRotation?.angle ?? 0)).toBeGreaterThan(1.5);
    });
});
