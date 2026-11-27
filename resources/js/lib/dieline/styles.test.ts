import { describe, expect, it } from 'vitest';
import type { BoxParams, BoxStyle } from '../../types/design';
import { buildFoldTree, foldedBounds, styleOrientation } from '../three/foldTree';
import { area, distance, generateDieline, mergeSegments, SUPPORTED_STYLES, union, type Segment } from './index';

/** Same defaults as database/seeders/ProductSeeder.php. */
const DEFAULTS: Record<string, BoxParams> = {
    mailer: { style: 'mailer', length: 220, width: 160, depth: 70, thickness: 1.5, unit: 'mm', construction: 'corrugated' },
    'reverse-tuck': { style: 'reverse-tuck', length: 100, width: 60, depth: 140, thickness: 0.4, unit: 'mm', construction: 'folding' },
    'straight-tuck': { style: 'straight-tuck', length: 100, width: 60, depth: 140, thickness: 0.4, unit: 'mm', construction: 'folding' },
    burger: { style: 'burger', length: 115, width: 115, depth: 85, thickness: 0.4, unit: 'mm', construction: 'folding' },
    tray: { style: 'tray', length: 180, width: 120, depth: 45, thickness: 0.5, unit: 'mm', construction: 'folding' },
    sleeve: { style: 'sleeve', length: 150, width: 100, depth: 40, thickness: 0.35, unit: 'mm', construction: 'folding' },
};

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

it('supports the six folding styles from Sprint 1', () => {
    expect([...SUPPORTED_STYLES].sort()).toEqual(['burger', 'mailer', 'reverse-tuck', 'rigid-book', 'rigid-drawer', 'rigid-lid-base', 'rigid-shoulder', 'sleeve', 'straight-tuck', 'tray']);
});

describe.each(Object.keys(DEFAULTS))('%s', (style) => {
    const params = DEFAULTS[style];
    const result = generateDieline(params);

    it('has a single root and every other panel hangs off a hinge', () => {
        const ids = new Set(result.panels.map((p) => p.id));
        expect(ids.size).toBe(result.panels.length);
        expect(result.panels.filter((p) => !p.parentId)).toHaveLength(1);
        for (const p of result.panels) {
            if (p.parentId) {
                expect(ids.has(p.parentId), p.id).toBe(true);
                expect(p.hinge, p.id).toBeDefined();
            }
        }
        const roots = buildFoldTree(result.panels);
        const count = (n: (typeof roots)[number]): number => 1 + n.children.reduce((s, c) => s + count(c), 0);
        expect(count(roots[0])).toBe(result.panels.length);
    });

    it('panels never overlap on the sheet', () => {
        const total = result.panels.reduce((s, p) => s + area(p.polygon), 0);
        const merged = union(result.panels.map((p) => p.polygon)).reduce((s, p) => s + area(p), 0);
        expect(merged).toBeCloseTo(total, 0);
    });

    it('never cuts along a crease', () => {
        const cuts = pathToSegments(result.cutPath);
        for (const p of result.panels) {
            if (!p.hinge) continue;
            expect(length(mergeSegments(cuts, [p.hinge])), p.id).toBeCloseTo(length(mergeSegments(cuts)), 3);
        }
    });

    it('folds into a box of the requested inside size', () => {
        const box = foldedBounds(result.panels, 1, styleOrientation(params.style as BoxStyle));
        const size = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].sort((a, b) => a - b);
        const wanted = [params.length, params.width, params.depth].sort((a, b) => a - b);
        // Burger lids are a board thickness bigger so they close over the walls.
        const tolerance = 2 * params.thickness + 0.01;
        size.forEach((s, i) => {
            expect(s).toBeGreaterThanOrEqual(wanted[i] - 0.01);
            expect(s).toBeLessThanOrEqual(wanted[i] + tolerance);
        });
    });

    it('stands upright: depth is the height', () => {
        const box = foldedBounds(result.panels, 1, styleOrientation(params.style as BoxStyle));
        // Sleeves are a tube lying down (height = depth too); burger lids add one board thickness.
        expect(box.max.y - box.min.y).toBeGreaterThanOrEqual(params.depth - 0.01);
        expect(box.max.y - box.min.y).toBeLessThanOrEqual(params.depth + params.thickness + 0.01);
    });

    it('matches the snapshot', () => {
        expect(result).toMatchSnapshot();
    });
});
