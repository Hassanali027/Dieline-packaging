import { describe, expect, it } from 'vitest';
import {
    area,
    bounds,
    centroid,
    mergeSegments,
    offset,
    pointInPolygon,
    polygonToPath,
    pt,
    rect,
    segmentsToPath,
    signedArea,
    toMm,
    union,
} from './geometry';

describe('geometry helpers', () => {
    it('computes area, centroid and bounds of a rectangle', () => {
        const r = rect(10, 20, 100, 50);
        expect(area(r)).toBe(5000);
        expect(signedArea(r)).toBeGreaterThan(0);
        expect(centroid(r)).toEqual({ x: 60, y: 45 });
        expect(bounds([r])).toMatchObject({ minX: 10, minY: 20, width: 100, height: 50 });
    });

    it('converts inches to mm', () => {
        expect(toMm(1, 'in')).toBeCloseTo(25.4);
        expect(toMm(5, 'mm')).toBe(5);
    });

    it('tests points inside a polygon', () => {
        const r = rect(0, 0, 10, 10);
        expect(pointInPolygon(pt(5, 5), r)).toBe(true);
        expect(pointInPolygon(pt(15, 5), r)).toBe(false);
    });

    it('grows and shrinks polygons with clipper2', () => {
        const r = rect(0, 0, 100, 50);
        const [grown] = offset([r], 3);
        expect(bounds([grown])).toMatchObject({ minX: -3, minY: -3, width: 106, height: 56 });

        const [shrunk] = offset([r], -3);
        expect(bounds([shrunk])).toMatchObject({ minX: 3, minY: 3, width: 94, height: 44 });

        expect(offset([rect(0, 0, 4, 4)], -3)).toHaveLength(0);
    });

    it('unions touching rectangles into one outline', () => {
        const result = union([rect(0, 0, 10, 10), rect(10, 0, 10, 10)]);
        expect(result).toHaveLength(1);
        expect(area(result[0])).toBe(200);
    });

    it('merges overlapping collinear segments and removes excluded parts', () => {
        const segs = [
            { a: pt(0, 0), b: pt(10, 0) },
            { a: pt(10, 0), b: pt(5, 0) },
            { a: pt(8, 0), b: pt(20, 0) },
        ];
        expect(mergeSegments(segs)).toEqual([{ a: pt(0, 0), b: pt(20, 0) }]);
        expect(mergeSegments(segs, [{ a: pt(5, 0), b: pt(15, 0) }])).toEqual([
            { a: pt(0, 0), b: pt(5, 0) },
            { a: pt(15, 0), b: pt(20, 0) },
        ]);
    });

    it('writes SVG path strings', () => {
        expect(polygonToPath(rect(0, 0, 1, 2))).toBe('M0 0 L1 0 L1 2 L0 2 Z');
        const square = [
            { a: pt(0, 0), b: pt(1, 0) },
            { a: pt(1, 1), b: pt(1, 0) },
            { a: pt(1, 1), b: pt(0, 1) },
            { a: pt(0, 1), b: pt(0, 0) },
        ];
        expect(segmentsToPath(square)).toBe('M0 0 L1 0 L1 1 L0 1 Z');
    });
});

describe('mirroring', () => {
    it('mirrors engine paths and polygons around the sheet centre', async () => {
        const { mirrorPathX, mirrorPolygonX } = await import('./geometry');
        expect(mirrorPathX('M0 0 L10 0 L10 5.5 Z', 100)).toBe('M100 0 L90 0 L90 5.5 Z');
        expect(mirrorPolygonX(rect(0, 0, 10, 5), 100)).toEqual([pt(100, 5), pt(90, 5), pt(90, 0), pt(100, 0)]);
    });
});
