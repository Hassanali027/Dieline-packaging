import { Clipper, FillRule, Path64, Paths64 } from 'clipper2-js';
import type { Pt } from '../../types/design';

/**
 * Geometry helpers for the dieline engine.
 *
 * Conventions (shared with the 2D editor and the 3D builder):
 * - All coordinates are millimetres.
 * - X grows to the right, Y grows downwards (same as SVG and Fabric).
 * - Polygons are closed implicitly: the last point connects back to the first.
 */

/** Decimal places kept when rounding output coordinates (0.001 mm). */
export const PRECISION = 3;

/** Clipper works on integers, so coordinates are scaled by this factor first. */
const CLIPPER_SCALE = 1000;

export const MM_PER_INCH = 25.4;

export function pt(x: number, y: number): Pt {
    return { x, y };
}

export function add(a: Pt, b: Pt): Pt {
    return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Pt, b: Pt): Pt {
    return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(p: Pt, factor: number): Pt {
    return { x: p.x * factor, y: p.y * factor };
}

export function distance(a: Pt, b: Pt): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

export function round(value: number, places = PRECISION): number {
    const f = 10 ** places;
    const r = Math.round(value * f) / f;
    // Avoid "-0" in generated SVG / JSON.
    return Object.is(r, -0) ? 0 : r;
}

export function roundPt(p: Pt, places = PRECISION): Pt {
    return { x: round(p.x, places), y: round(p.y, places) };
}

export function toMm(value: number, unit: 'mm' | 'in'): number {
    return unit === 'in' ? value * MM_PER_INCH : value;
}

export function fromMm(value: number, unit: 'mm' | 'in'): number {
    return unit === 'in' ? value / MM_PER_INCH : value;
}

/** Axis-aligned rectangle as a clockwise (in screen space) polygon. */
export function rect(x: number, y: number, width: number, height: number): Pt[] {
    return [pt(x, y), pt(x + width, y), pt(x + width, y + height), pt(x, y + height)];
}

export function translate(polygon: Pt[], dx: number, dy: number): Pt[] {
    return polygon.map((p) => pt(p.x + dx, p.y + dy));
}

/** Signed area (shoelace). Positive = clockwise on screen (Y down). */
export function signedArea(polygon: Pt[]): number {
    let sum = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        sum += a.x * b.y - b.x * a.y;
    }
    return sum / 2;
}

export function area(polygon: Pt[]): number {
    return Math.abs(signedArea(polygon));
}

export function centroid(polygon: Pt[]): Pt {
    const a = signedArea(polygon);
    if (Math.abs(a) < 1e-9) {
        const s = polygon.reduce((acc, p) => add(acc, p), pt(0, 0));
        return scale(s, 1 / polygon.length);
    }
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i];
        const q = polygon[(i + 1) % polygon.length];
        const cross = p.x * q.y - q.x * p.y;
        cx += (p.x + q.x) * cross;
        cy += (p.y + q.y) * cross;
    }
    return pt(cx / (6 * a), cy / (6 * a));
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };

export function bounds(polygons: Pt[][]): Bounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const poly of polygons) {
        for (const p of poly) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
    }
    if (!Number.isFinite(minX)) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Even-odd point-in-polygon test. Points exactly on an edge may go either way. */
export function pointInPolygon(p: Pt, polygon: Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

/* ------------------------------------------------------------------ */
/* Clipper2 wrappers                                                   */
/* ------------------------------------------------------------------ */

function toPath64(polygon: Pt[]): Path64 {
    const path = new Path64();
    for (const p of polygon) {
        path.push({ x: Math.round(p.x * CLIPPER_SCALE), y: Math.round(p.y * CLIPPER_SCALE) });
    }
    return path;
}

function toPaths64(polygons: Pt[][]): Paths64 {
    const paths = new Paths64();
    for (const poly of polygons) {
        paths.push(toPath64(poly));
    }
    return paths;
}

function fromPaths64(paths: Paths64): Pt[][] {
    return paths.map((path) => path.map((p) => roundPt(pt(p.x / CLIPPER_SCALE, p.y / CLIPPER_SCALE))));
}

/**
 * Union of solid polygons. Each input is treated as filled whatever its winding
 * (inputs are re-oriented first, otherwise opposite windings would cancel out under
 * the non-zero rule). Returns outer outlines and any holes.
 */
export function union(polygons: Pt[][]): Pt[][] {
    const solid = polygons.filter((p) => p.length >= 3 && Math.abs(signedArea(p)) > 1e-9).map((p) => (signedArea(p) < 0 ? [...p].reverse() : p));
    if (solid.length === 0) {
        return [];
    }
    return fromPaths64(Clipper.Union(toPaths64(solid), undefined, FillRule.NonZero));
}

/** Longest miter allowed, as a multiple of delta; sharper corners get bevelled. */
const MITER_LIMIT = 2;

/**
 * Grow polygons by `delta` mm (bleed). Every edge is swept into a rectangle (both sides),
 * every corner gets a mitred wedge (both sides), and everything is unioned. Pieces on the
 * inner side are swallowed by the polygon itself, so orientation does not matter, the
 * result never self-intersects, and notches narrower than 2×delta are filled.
 *
 * Note: clipper2-js 1.2.x `InflatePaths` returns broken outlines, so it is not used here.
 */
function grow(polygons: Pt[][], delta: number): Pt[][] {
    const pieces: Pt[][] = [...polygons];
    for (const poly of polygons) {
        const edges = polygonEdges(poly);
        const normals = edges.map(({ a, b }) => {
            const u = scale(sub(b, a), 1 / distance(a, b));
            return pt(-u.y, u.x);
        });
        edges.forEach(({ a, b }, i) => {
            const n = scale(normals[i], delta);
            pieces.push([add(a, n), add(b, n), sub(b, n), sub(a, n)]);
        });
        edges.forEach(({ a: v }, i) => {
            const n1 = normals[(i - 1 + edges.length) % edges.length];
            const n2 = normals[i];
            for (const s of [1, -1]) {
                const p1 = add(v, scale(n1, s * delta));
                const p2 = add(v, scale(n2, s * delta));
                const cos = n1.x * n2.x + n1.y * n2.y;
                const miterLen = cos > -0.999 ? Math.sqrt(2 / (1 + cos)) : Infinity;
                if (miterLen <= MITER_LIMIT) {
                    const m = scale(add(n1, n2), (s * delta) / (1 + cos));
                    pieces.push([v, p1, add(v, m), p2]);
                } else {
                    pieces.push([v, p1, p2]);
                }
            }
        });
    }
    // Degenerate (zero-area) wedges at straight vertices are harmless for the union.
    return union(pieces);
}

function lineIntersection(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null {
    const cross = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(cross) < 1e-12) return null;
    const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / cross;
    return add(p1, scale(d1, t));
}

/**
 * Shrink a convex polygon by `delta` mm with mitred corners (safe zone).
 * Returns null when the polygon disappears. Panels are convex, which keeps this exact.
 */
function shrinkConvex(polygon: Pt[], delta: number): Pt[] | null {
    const edges = polygonEdges(polygon);
    if (edges.length < 3) return null;
    const orientation = Math.sign(signedArea(polygon));
    // Inward normal: for a clockwise (screen) polygon it is the right-hand normal of each edge.
    const lines = edges.map(({ a, b }) => {
        const d = scale(sub(b, a), 1 / distance(a, b));
        const inward = orientation > 0 ? pt(-d.y, d.x) : pt(d.y, -d.x);
        return { p: add(a, scale(inward, delta)), d };
    });
    const out: Pt[] = [];
    for (let i = 0; i < lines.length; i++) {
        const prev = lines[(i - 1 + lines.length) % lines.length];
        const cur = lines[i];
        const x = lineIntersection(prev.p, prev.d, cur.p, cur.d);
        if (x) out.push(roundPt(x));
    }
    const shrunk = out.filter((p, i) => distance(p, out[(i + 1) % out.length]) > 1e-6);
    if (shrunk.length < 3) return null;
    const a = signedArea(shrunk);
    // Collapsed or inverted: the polygon was thinner than 2×delta.
    if (Math.sign(a) !== orientation || Math.abs(a) < 1e-6) return null;
    // An inverted edge means a side vanished; check every edge still runs the same way.
    for (let i = 0; i < shrunk.length && shrunk.length === edges.length; i++) {
        const before = sub(edges[i].b, edges[i].a);
        const after = sub(shrunk[(i + 1) % shrunk.length], shrunk[i]);
        if (before.x * after.x + before.y * after.y < 0) return null;
    }
    return shrunk;
}

/**
 * Offset closed polygons by `delta` mm: positive grows and merges them (bleed),
 * negative shrinks each convex polygon on its own (safe zone). Polygons that shrink away are dropped.
 */
export function offset(polygons: Pt[][], delta: number): Pt[][] {
    if (polygons.length === 0 || delta === 0) {
        return polygons.map((p) => p.map((q) => roundPt(q)));
    }
    if (delta > 0) {
        return grow(polygons, delta).filter((poly) => poly.length >= 3);
    }
    return polygons.map((p) => shrinkConvex(p, -delta)).filter((p): p is Pt[] => p !== null);
}

/* ------------------------------------------------------------------ */
/* Segments: used to split panel edges into cut vs crease lines        */
/* ------------------------------------------------------------------ */

export type Segment = { a: Pt; b: Pt };

export function polygonEdges(polygon: Pt[]): Segment[] {
    const edges: Segment[] = [];
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (distance(a, b) > 1e-9) {
            edges.push({ a, b });
        }
    }
    return edges;
}

type LineGroup = {
    /** unit direction, normalised so that it points into the +x half-plane (or +y when vertical) */
    dir: Pt;
    /** a point on the line closest to the origin */
    origin: Pt;
    intervals: [number, number][];
};

const EPS = 1e-6;

function lineKey(seg: Segment): { dir: Pt; origin: Pt; t0: number; t1: number } {
    let d = sub(seg.b, seg.a);
    const len = Math.hypot(d.x, d.y);
    d = scale(d, 1 / len);
    if (d.x < -EPS || (Math.abs(d.x) <= EPS && d.y < 0)) {
        d = scale(d, -1);
    }
    // Perpendicular foot from origin onto the line.
    const t = seg.a.x * d.x + seg.a.y * d.y;
    const origin = sub(seg.a, scale(d, t));
    const ta = t;
    const tb = seg.b.x * d.x + seg.b.y * d.y;
    return { dir: d, origin, t0: Math.min(ta, tb), t1: Math.max(ta, tb) };
}

function mergeIntervals(intervals: [number, number][]): [number, number][] {
    const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const iv of sorted) {
        const last = out[out.length - 1];
        if (last && iv[0] <= last[1] + EPS) {
            last[1] = Math.max(last[1], iv[1]);
        } else {
            out.push([iv[0], iv[1]]);
        }
    }
    return out;
}

function subtractIntervals(base: [number, number][], remove: [number, number][]): [number, number][] {
    let result = base;
    for (const [r0, r1] of remove) {
        const next: [number, number][] = [];
        for (const [b0, b1] of result) {
            if (r1 <= b0 + EPS || r0 >= b1 - EPS) {
                next.push([b0, b1]);
                continue;
            }
            if (r0 > b0 + EPS) next.push([b0, r0]);
            if (r1 < b1 - EPS) next.push([r1, b1]);
        }
        result = next;
    }
    return result;
}

function groupByLine(segments: Segment[]): LineGroup[] {
    const groups: LineGroup[] = [];
    for (const seg of segments) {
        const k = lineKey(seg);
        let group = groups.find((g) => Math.abs(g.dir.x - k.dir.x) < EPS && Math.abs(g.dir.y - k.dir.y) < EPS && distance(g.origin, k.origin) < 1e-4);
        if (!group) {
            group = { dir: k.dir, origin: k.origin, intervals: [] };
            groups.push(group);
        }
        group.intervals.push([k.t0, k.t1]);
    }
    return groups;
}

/**
 * Merge collinear, overlapping segments and remove the parts covered by `exclude`.
 * Used to turn "every panel edge" into "cut lines" by removing the hinge (crease) segments,
 * so the cutter never runs twice over the same line.
 */
export function mergeSegments(segments: Segment[], exclude: Segment[] = []): Segment[] {
    const groups = groupByLine(segments);
    const excludeGroups = groupByLine(exclude);
    const out: Segment[] = [];
    for (const g of groups) {
        let intervals = mergeIntervals(g.intervals);
        const ex = excludeGroups.find(
            (e) => Math.abs(e.dir.x - g.dir.x) < EPS && Math.abs(e.dir.y - g.dir.y) < EPS && distance(e.origin, g.origin) < 1e-4,
        );
        if (ex) {
            intervals = subtractIntervals(intervals, mergeIntervals(ex.intervals));
        }
        for (const [t0, t1] of intervals) {
            if (t1 - t0 > EPS) {
                out.push({ a: roundPt(add(g.origin, scale(g.dir, t0))), b: roundPt(add(g.origin, scale(g.dir, t1))) });
            }
        }
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* SVG path strings                                                    */
/* ------------------------------------------------------------------ */

function fmt(n: number): string {
    return String(round(n));
}

export function polygonToPath(polygon: Pt[]): string {
    if (polygon.length === 0) return '';
    const [first, ...rest] = polygon;
    return `M${fmt(first.x)} ${fmt(first.y)}` + rest.map((p) => ` L${fmt(p.x)} ${fmt(p.y)}`).join('') + ' Z';
}

export function polygonsToPath(polygons: Pt[][]): string {
    return polygons.map(polygonToPath).filter(Boolean).join(' ');
}

export function segmentToPath(seg: Segment): string {
    return `M${fmt(seg.a.x)} ${fmt(seg.a.y)} L${fmt(seg.b.x)} ${fmt(seg.b.y)}`;
}

/**
 * Join segments that share end points into polylines, so the SVG/PDF has fewer, longer paths.
 */
export function segmentsToPath(segments: Segment[]): string {
    const remaining = segments.map((s) => ({ ...s }));
    const polylines: Pt[][] = [];
    const same = (p: Pt, q: Pt) => distance(p, q) < 1e-4;
    while (remaining.length) {
        const seg = remaining.shift()!;
        const line: Pt[] = [seg.a, seg.b];
        let extended = true;
        while (extended) {
            extended = false;
            for (let i = 0; i < remaining.length; i++) {
                const s = remaining[i];
                const head = line[0];
                const tail = line[line.length - 1];
                if (same(s.a, tail)) line.push(s.b);
                else if (same(s.b, tail)) line.push(s.a);
                else if (same(s.b, head)) line.unshift(s.a);
                else if (same(s.a, head)) line.unshift(s.b);
                else continue;
                remaining.splice(i, 1);
                extended = true;
                break;
            }
        }
        polylines.push(line);
    }
    return polylines
        .map((line) => {
            const closed = line.length > 2 && same(line[0], line[line.length - 1]);
            const pts = closed ? line.slice(0, -1) : line;
            const d =
                `M${fmt(pts[0].x)} ${fmt(pts[0].y)}` +
                pts
                    .slice(1)
                    .map((p) => ` L${fmt(p.x)} ${fmt(p.y)}`)
                    .join('');
            return closed ? `${d} Z` : d;
        })
        .join(' ');
}

/**
 * Mirror an engine-made SVG path (only M/L/Z commands) left-right around x = width / 2.
 * The inside of a sheet is the mirror image of its outside.
 */
export function mirrorPathX(d: string, width: number): string {
    return d.replace(/([ML])(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, cmd: string, x: string, y: string) => `${cmd}${fmt(width - Number(x))} ${y}`);
}

export function mirrorPolygonX(polygon: Pt[], width: number): Pt[] {
    return polygon.map((p) => roundPt(pt(width - p.x, p.y))).reverse();
}
