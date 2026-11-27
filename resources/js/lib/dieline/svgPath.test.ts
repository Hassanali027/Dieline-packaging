import { describe, expect, it } from 'vitest';
import { applyMatrix, parseTransform, svgPathToPolylines } from './svgPath';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
};

describe('svgPathToPolylines', () => {
    it('reads relative and H / V commands as absolute points', () => {
        const [rect] = svgPathToPolylines('M10,10 h200 v100 h-200 z');
        expect(rect.closed).toBe(true);
        expect(rect.pts).toEqual([
            { x: 10, y: 10 },
            { x: 210, y: 10 },
            { x: 210, y: 110 },
            { x: 10, y: 110 },
        ]);
    });

    it('handles implicit linetos, packed numbers and several subpaths', () => {
        const lines = svgPathToPolylines('M0 0 10 0 10-10M1.5.5l1-1Zm1 1 2 0');
        expect(lines[0].pts).toEqual([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: -10 },
        ]);
        expect(lines[1].pts).toEqual([
            { x: 1.5, y: 0.5 },
            { x: 2.5, y: -0.5 },
        ]);
        expect(lines[1].closed).toBe(true);
        // After Z the pen is back at the subpath start, so the relative m starts from (1.5, 0.5).
        expect(lines[2].pts).toEqual([
            { x: 2.5, y: 1.5 },
            { x: 4.5, y: 1.5 },
        ]);
    });

    it('flattens arcs, including packed arc flags', () => {
        for (const d of ['M0 0 a10 10 0 0 1 20 0', 'M0 0a10 10 0 0120 0']) {
            const [arc] = svgPathToPolylines(d);
            close(arc.pts[arc.pts.length - 1], { x: 20, y: 0 });
            for (const p of arc.pts) expect(Math.hypot(p.x - 10, p.y)).toBeCloseTo(10, 6);
            // Sweep flag 1 in a Y-down drawing goes through the top half (negative y).
            expect(Math.min(...arc.pts.map((p) => p.y))).toBeCloseTo(-10, 1);
        }
    });

    it('reflects control points for S and T', () => {
        const [s] = svgPathToPolylines('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
        close(s.pts[s.pts.length - 1], { x: 20, y: 0 });
        expect(Math.min(...s.pts.map((p) => p.y))).toBeCloseTo(-7.5, 1);

        const [t] = svgPathToPolylines('M0 0 Q5 10 10 0 T20 0');
        close(t.pts[t.pts.length - 1], { x: 20, y: 0 });
        expect(Math.min(...t.pts.map((p) => p.y))).toBeCloseTo(-5, 1);
    });
});

describe('parseTransform', () => {
    it('combines transforms left to right like SVG', () => {
        close(applyMatrix(parseTransform('translate(10 5) scale(2)'), { x: 1, y: 1 }), { x: 12, y: 7 });
        close(applyMatrix(parseTransform('rotate(90 10 10)'), { x: 20, y: 10 }), { x: 10, y: 20 });
        close(applyMatrix(parseTransform('matrix(1,0,0,1,3,4)'), { x: 0, y: 0 }), { x: 3, y: 4 });
        close(applyMatrix(parseTransform(null), { x: 7, y: 8 }), { x: 7, y: 8 });
    });
});
