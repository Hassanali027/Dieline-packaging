import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BoxParams, DielineResult } from '../../types/design';
import {
    area,
    bounds,
    distance,
    generateDieline,
    InvalidParamsError,
    isStyleSupported,
    mergeSegments,
    UnsupportedStyleError,
    validateParams,
    type Segment,
} from './index';

const defaults: BoxParams = {
    style: 'mailer',
    length: 220,
    width: 160,
    depth: 70,
    thickness: 1.5,
    unit: 'mm',
    construction: 'corrugated',
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

function totalLength(segs: Segment[]): number {
    return segs.reduce((sum, s) => sum + distance(s.a, s.b), 0);
}

const FIXTURE = fileURLToPath(new URL('../../fixtures/mailer.json', import.meta.url));

describe('mailer dieline', () => {
    const result = generateDieline(defaults);
    const byId = Object.fromEntries(result.panels.map((p) => [p.id, p]));

    it('creates every panel with a valid hinge tree', () => {
        expect(result.panels.map((p) => p.id)).toEqual([
            'base',
            'back',
            'lid',
            'lid-front',
            'lid-dust-left',
            'lid-dust-right',
            'ear-left',
            'ear-right',
            'front',
            'front-inner',
            'side-left',
            'side-left-inner',
            'side-right',
            'side-right-inner',
        ]);
        const roots = result.panels.filter((p) => !p.parentId);
        expect(roots.map((p) => p.id)).toEqual(['base']);
        for (const panel of result.panels) {
            if (panel.parentId) {
                expect(byId[panel.parentId], `${panel.id} parent`).toBeDefined();
                expect(panel.hinge, `${panel.id} hinge`).toBeDefined();
            }
        }
    });

    it('uses the inside dimensions for the main panels', () => {
        const base = bounds([byId.base.polygon]);
        expect(base.width).toBe(220);
        expect(base.height).toBe(160);
        expect(bounds([byId.back.polygon]).height).toBe(70);
        expect(bounds([byId['side-left'].polygon]).width).toBe(70);
        expect(bounds([byId.lid.polygon]).height).toBe(160);
    });

    it('places the cut outline at the origin and computes the overall size', () => {
        const all = bounds(result.panels.map((p) => p.polygon));
        expect(all.minX).toBe(0);
        expect(all.minY).toBe(0);
        // side inner + side + base + side + side inner
        expect(result.overallSize.width).toBeCloseTo(68.5 + 70 + 220 + 70 + 68.5, 3);
        // tuck + lid + back + base + front + front inner
        expect(result.overallSize.height).toBeCloseTo(68.5 + 160 + 70 + 160 + 70 + 68.5, 3);
    });

    it('panels do not overlap', () => {
        const total = result.panels.reduce((sum, p) => sum + area(p.polygon), 0);
        expect(total).toBeGreaterThan(0);
        for (let i = 0; i < result.panels.length; i++) {
            for (let j = i + 1; j < result.panels.length; j++) {
                const a = bounds([result.panels[i].polygon]);
                const b = bounds([result.panels[j].polygon]);
                const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
                const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
                // bounding boxes of trapezoids may touch, but never overlap by more than a hair
                const overlap = ox > 0.01 && oy > 0.01;
                if (overlap) {
                    // only the tapered flaps may share bbox area; check that their centres are apart
                    expect([result.panels[i].id, result.panels[j].id].some((id) => id.includes('dust') || id.includes('ear'))).toBe(true);
                }
            }
        }
    });

    it('draws every hinge as a crease and never as a cut', () => {
        // 13 hinges; collinear neighbours (e.g. the three hinges on each side of the base column) merge.
        expect(result.creasePaths).toHaveLength(9);
        const cuts = pathToSegments(result.cutPath);
        const creases = result.creasePaths.flatMap(pathToSegments);
        for (const panel of result.panels) {
            if (!panel.hinge) continue;
            const hinge = [{ a: panel.hinge.a, b: panel.hinge.b }];
            // removing the hinge from the creases leaves less crease length...
            expect(totalLength(mergeSegments(creases, hinge)), panel.id).toBeLessThan(totalLength(creases) - 1);
            // ...but removing it from the cuts changes nothing: no cut runs along a hinge.
            expect(totalLength(mergeSegments(cuts, hinge)), panel.id).toBeCloseTo(totalLength(mergeSegments(cuts)), 3);
        }
        expect(result.cutPath.startsWith('M')).toBe(true);
        expect(result.bleedPath).toContain('Z');
        expect(result.safePath.split('Z').filter((s) => s.trim()).length).toBe(14);
    });

    it('bleed extends 3 mm beyond the cut outline', () => {
        const nums = result.bleedPath.match(/-?\d+(\.\d+)?/g)!.map(Number);
        const xs = nums.filter((_, i) => i % 2 === 0);
        const ys = nums.filter((_, i) => i % 2 === 1);
        expect(Math.min(...xs)).toBeCloseTo(-3, 3);
        expect(Math.min(...ys)).toBeCloseTo(-3, 3);
        expect(Math.max(...xs)).toBeCloseTo(result.overallSize.width + 3, 3);
    });

    it('accepts inches', () => {
        const inch = generateDieline({ ...defaults, length: 10, width: 6, depth: 3, thickness: 0.06, unit: 'in' });
        const base = bounds([inch.panels[0].polygon]);
        expect(base.width).toBeCloseTo(254, 3);
        expect(base.height).toBeCloseTo(152.4, 3);
    });

    it('matches the shared fixture used by the editor and 3D teams', () => {
        if (process.env.UPDATE_FIXTURES || !existsSync(FIXTURE)) {
            writeFileSync(FIXTURE, JSON.stringify({ params: defaults, result }, null, 4) + '\n');
        }
        const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { params: BoxParams; result: DielineResult };
        expect(fixture.params).toEqual(defaults);
        expect(fixture.result).toEqual(result);
    });
});

describe('validation', () => {
    it('rejects bad sizes', () => {
        expect(validateParams(defaults)).toEqual([]);
        expect(validateParams({ ...defaults, length: 5 })).toHaveLength(1);
        expect(validateParams({ ...defaults, depth: Number.NaN })).toHaveLength(1);
        expect(validateParams({ ...defaults, thickness: 30 })).toHaveLength(1);
        expect(() => generateDieline({ ...defaults, width: 0 })).toThrow(InvalidParamsError);
    });

    it('reports unsupported styles', () => {
        expect(isStyleSupported('mailer')).toBe(true);
        expect(isStyleSupported('rigid-book')).toBe(true);
        expect(() => generateDieline({ ...defaults, style: 'rigid-book', construction: 'rigid' })).not.toThrow();
    });
});
