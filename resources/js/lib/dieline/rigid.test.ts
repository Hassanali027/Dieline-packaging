import { describe, expect, it } from 'vitest';
import type { BoxParams } from '../../types/design';
import { foldedBounds } from '../three/foldTree';
import { area, distance, extractPart, generateDieline, mergeSegments, rigidSizes, union, validateParams, WRAP_MM, type Segment } from './index';

/** Same as the seeded "Rigid Lid & Base" product. */
const params: BoxParams = {
    style: 'rigid-lid-base',
    length: 200,
    width: 150,
    depth: 60,
    thickness: 2,
    unit: 'mm',
    construction: 'rigid',
    rigid: { boardThickness: 2, turnIn: 18, lidDepth: 30, lidClearance: 1.5 },
};

const result = generateDieline(params);
const sizes = rigidSizes(params);

function pathToSegments(d: string): Segment[] {
    const segs: Segment[] = [];
    for (const sub of d.split('M').filter((s) => s.trim())) {
        const closed = sub.includes('Z');
        const nums = sub.replace(/[LZ]/g, ' ').trim().split(/\s+/).map(Number);
        const pts = [];
        for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
        if (closed) pts.push(pts[0]);
        for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1] });
    }
    return segs;
}
const length = (segs: Segment[]) => segs.reduce((s, x) => s + distance(x.a, x.b), 0);

describe('rigid lid & base sizes', () => {
    it('derives the chipboard trays from the inside size', () => {
        expect(sizes.base).toEqual({ length: 204, width: 154, height: 62 });
        expect(sizes.lid.height).toBe(30);
        // lid inside = base inside + 2 × (board + wrap) + clearance
        expect(sizes.lid.length - 2 * sizes.board).toBeCloseTo(200 + 2 * (2 + WRAP_MM) + 1.5, 6);
    });

    it('leaves the clearance between the wrapped base and the lid', () => {
        const lidInside = sizes.lid.length - 2 * sizes.board;
        const baseWithWrap = sizes.base.length + 2 * WRAP_MM;
        expect(lidInside - baseWithWrap).toBeCloseTo(1.5, 6);
    });

    it('lists the chipboard blanks to cut', () => {
        expect(result.chipboard).toEqual([
            { part: 'base', name: 'Base bottom', width: 204, height: 154, quantity: 1 },
            { part: 'base', name: 'Base long wall', width: 204, height: 60, quantity: 2 },
            { part: 'base', name: 'Base short wall', width: 150, height: 60, quantity: 2 },
            { part: 'lid', name: 'Lid top', width: 209.9, height: 159.9, quantity: 1 },
            { part: 'lid', name: 'Lid long wall', width: 209.9, height: 28, quantity: 2 },
            { part: 'lid', name: 'Lid short wall', width: 155.9, height: 28, quantity: 2 },
        ]);
    });
});

describe('rigid lid & base dielines', () => {
    it('has lid, base and liner parts, each with one root', () => {
        expect(result.parts).toEqual(['lid', 'base', 'liner']);
        for (const part of result.parts!) {
            const panels = result.panels.filter((p) => p.part === part);
            expect(
                panels.filter((p) => !p.parentId),
                part,
            ).toHaveLength(1);
        }
    });

    it('never overlaps panels and never cuts along a crease', () => {
        const total = result.panels.reduce((s, p) => s + area(p.polygon), 0);
        const merged = union(result.panels.map((p) => p.polygon)).reduce((s, p) => s + area(p), 0);
        expect(merged).toBeCloseTo(total, 0);
        const cuts = pathToSegments(result.cutPath);
        for (const p of result.panels.filter((x) => x.hinge)) {
            expect(length(mergeSegments(cuts, [p.hinge!])), p.id).toBeCloseTo(length(mergeSegments(cuts)), 3);
        }
    });

    it('wraps each tray exactly (folded wrap = chipboard outer size)', () => {
        for (const [part, size] of [
            ['base', sizes.base],
            ['lid', sizes.lid],
        ] as const) {
            const box = foldedBounds(extractPart(result, part).panels, 1);
            expect(box.max.x - box.min.x, part).toBeCloseTo(size.length, 3);
            expect(box.max.z - box.min.z, part).toBeCloseTo(size.width, 3);
            expect(box.max.y - box.min.y, part).toBeCloseTo(size.height, 3);
        }
    });

    it('fits the liner inside the base', () => {
        const box = foldedBounds(extractPart(result, 'liner').panels, 1);
        expect(box.max.x - box.min.x).toBeLessThan(params.length);
        expect(box.max.z - box.min.z).toBeLessThan(params.width);
        expect(box.max.y - box.min.y).toBeCloseTo(60 - 18 + 3, 3);
    });

    it('extracts a part as its own dieline at the origin', () => {
        const lid = extractPart(result, 'lid');
        expect(lid.panels.every((p) => p.part === 'lid')).toBe(true);
        expect(Math.min(...lid.panels.flatMap((p) => p.polygon.map((q) => q.x)))).toBe(0);
        expect(lid.chipboard?.every((c) => c.part === 'lid')).toBe(true);
        expect(extractPart(result, null)).toBe(result);
    });

    it('validates rigid settings', () => {
        expect(validateParams(params)).toEqual([]);
        expect(validateParams({ ...params, rigid: { ...params.rigid!, turnIn: 70 } })).toHaveLength(1);
        expect(validateParams({ ...params, rigid: { ...params.rigid!, boardThickness: 9 } })).toHaveLength(1);
        // inches: 0.7 in turn-in is 17.8 mm, fine
        expect(
            validateParams({ ...params, unit: 'in', length: 8, width: 6, depth: 2.4, thickness: 0.08, rigid: { boardThickness: 0.08, turnIn: 0.7 } }),
        ).toEqual([]);
    });

    it('matches the snapshot', () => {
        expect(result).toMatchSnapshot();
    });
});
