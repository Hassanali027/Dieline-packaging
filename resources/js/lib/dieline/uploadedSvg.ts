import type { DielineLineTag, Panel, Pt } from '../../types/design';
import { autoBuildFoldTreeFromBase } from '../three/foldMapping';
import { signedArea } from './geometry';
import { svgPathToPolylines } from './svgPath';

/** One straight segment of an uploaded dieline, classified as cut, crease or not yet known. */
export type UploadedDielineLine = { id: string; a: Pt; b: Pt; kind: 'cut' | 'crease' | 'unknown' };
export type SvgLine = UploadedDielineLine;
export type ParsedSvgDieline = { panels: Panel[]; lines: SvgLine[]; width: number; height: number; unit: string; warnings: string[] };

const NUM = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
const LENGTH = new RegExp(`^\\s*(${NUM})\\s*(mm|cm|in|pt|px)?\\s*$`, 'i');
const EPS = 1e-4;

function length(value: string | undefined): { value: number; unit: string } | null {
    if (!value) return null;
    const m = value.match(LENGTH);
    return m ? { value: Number(m[1]), unit: (m[2] ?? 'px').toLowerCase() } : null;
}

function parsePoints(value: string): Pt[] {
    const n = value.match(new RegExp(NUM, 'gi'))?.map(Number) ?? [];
    if (n.length < 6 || n.length % 2) return [];
    const points: Pt[] = [];
    for (let i = 0; i < n.length; i += 2) points.push({ x: n[i], y: n[i + 1] });
    return points;
}

function attr(tag: string, name: string): string | undefined {
    return tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
}

function lineKind(tag: string): SvgLine['kind'] {
    const hints =
        `${attr(tag, 'id') ?? ''} ${attr(tag, 'class') ?? ''} ${attr(tag, 'data-layer') ?? ''} ${attr(tag, 'stroke') ?? ''} ${attr(tag, 'stroke-dasharray') ?? ''}`.toLowerCase();
    if (/crease|fold|score|dash|#00ff00|#00a000|#00a0e9/.test(hints)) return 'crease';
    if (/cut|knife|#ff0000|#ff000|#f00|#ec008c/.test(hints)) return 'cut';
    return 'unknown';
}

const same = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) <= EPS;
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;

function segmentIntersections(a: Pt, b: Pt, c: Pt, d: Pt): { point: Pt; edgeT: number; lineT: number } | null {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c.x, y: d.y - c.y };
    const denominator = cross(r, s);
    if (Math.abs(denominator) < EPS) return null;
    const q = { x: c.x - a.x, y: c.y - a.y };
    const t = cross(q, s) / denominator;
    const u = cross(q, r) / denominator;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return { point: { x: a.x + r.x * t, y: a.y + r.y * t }, edgeT: u, lineT: t };
}

function splitPolygon(polygon: Pt[], a: Pt, b: Pt): [Pt[], Pt[]] | null {
    const hits: { point: Pt; edge: number; t: number; lineT: number }[] = [];
    for (let i = 0; i < polygon.length; i++) {
        const hit = segmentIntersections(a, b, polygon[i], polygon[(i + 1) % polygon.length]);
        if (hit && !hits.some((h) => same(h.point, hit.point))) hits.push({ ...hit, edge: i, t: hit.edgeT });
    }
    if (hits.length !== 2) return null;
    hits.sort((x, y) => x.lineT - y.lineT);
    const [first, second] = hits;
    const makePath = (start: (typeof hits)[number], end: (typeof hits)[number]) => {
        const points = [start.point];
        let i = (start.edge + 1) % polygon.length;
        const endVertex = (end.edge + 1) % polygon.length;
        while (i !== endVertex && points.length <= polygon.length + 1) {
            points.push(polygon[i]);
            i = (i + 1) % polygon.length;
        }
        points.push(end.point);
        return points;
    };
    const one = makePath(first, second);
    const two = makePath(second, first);
    if (one.length < 3 || two.length < 3) return null;
    return [one, two];
}

function hasEdge(panel: Panel, a: Pt, b: Pt): boolean {
    return panel.polygon.some(
        (p, i) =>
            (same(p, a) && same(panel.polygon[(i + 1) % panel.polygon.length], b)) ||
            (same(p, b) && same(panel.polygon[(i + 1) % panel.polygon.length], a)),
    );
}

/** Recover closed outlines from connected cut strokes (common in CAD-exported SVG files). */
function cutLoops(lines: SvgLine[]): Pt[][] {
    const cuts = lines.filter((line) => line.kind === 'cut');
    const key = (p: Pt) => `${Math.round(p.x / EPS)},${Math.round(p.y / EPS)}`;
    const points = new Map<string, Pt>();
    const adjacency = new Map<string, number[]>();
    const edges = cuts.map((line, index) => {
        const a = key(line.a);
        const b = key(line.b);
        points.set(a, line.a);
        points.set(b, line.b);
        adjacency.set(a, [...(adjacency.get(a) ?? []), index]);
        adjacency.set(b, [...(adjacency.get(b) ?? []), index]);
        return { a, b };
    });
    const used = new Set<number>();
    const loops: Pt[][] = [];
    for (let start = 0; start < edges.length; start++) {
        if (used.has(start)) continue;
        const componentEdges: number[] = [];
        const stack = [edges[start].a];
        const nodes = new Set<string>();
        while (stack.length) {
            const node = stack.pop()!;
            if (nodes.has(node)) continue;
            nodes.add(node);
            for (const edge of adjacency.get(node) ?? []) {
                componentEdges.push(edge);
                const e = edges[edge];
                stack.push(e.a === node ? e.b : e.a);
            }
        }
        const uniqueEdges = [...new Set(componentEdges)];
        if (uniqueEdges.length < 3 || [...nodes].some((node) => (adjacency.get(node)?.length ?? 0) !== 2)) {
            uniqueEdges.forEach((edge) => used.add(edge));
            continue;
        }
        const pointsInLoop: Pt[] = [];
        let node = edges[start].a;
        let previous = -1;
        while (pointsInLoop.length <= uniqueEdges.length) {
            pointsInLoop.push(points.get(node)!);
            const nextEdge = (adjacency.get(node) ?? []).find((edge) => edge !== previous && !used.has(edge));
            if (nextEdge === undefined) break;
            used.add(nextEdge);
            const edge = edges[nextEdge];
            const next = edge.a === node ? edge.b : edge.a;
            previous = nextEdge;
            node = next;
            if (node === key(pointsInLoop[0])) {
                if (pointsInLoop.length >= 3) loops.push(pointsInLoop);
                break;
            }
        }
        uniqueEdges.forEach((edge) => used.add(edge));
    }
    return loops;
}

/** Split simple closed panels along tagged crease lines and create a hinge tree for 3D folding. */
export function mapSvgCreasesToPanels(input: Panel[], lines: SvgLine[]): Panel[] {
    let panels = input.map((panel) => ({ ...panel, polygon: [...panel.polygon] }));
    for (const line of lines.filter((item) => item.kind === 'crease')) {
        if (panels.some((panel) => hasEdge(panel, line.a, line.b))) continue;
        // A long crease (e.g. across all the walls of a carton) crosses several panels: split each.
        const next: Panel[] = [];
        for (const panel of panels) {
            const split = splitPolygon(panel.polygon, line.a, line.b);
            if (!split) {
                next.push(panel);
                continue;
            }
            next.push(
                { ...panel, id: `${panel.id}-a`, name: `${panel.name} A`, polygon: split[0] },
                { ...panel, id: `${panel.id}-b`, name: `${panel.name} B`, polygon: split[1] },
            );
        }
        panels = next;
    }
    if (panels.length < 2) return panels.map((panel) => ({ ...panel, parentId: undefined, hinge: undefined, foldAngle: 0 }));

    // Hinge tree from shared edges, starting at the biggest panel (usually the floor or front);
    // every panel then folds about the crease it shares with its parent, not all off one root.
    const base = panels.reduce((a, b) => (Math.abs(signedArea(b.polygon)) > Math.abs(signedArea(a.polygon)) ? b : a));
    return autoBuildFoldTreeFromBase(panels, base.id, 90);
}

/**
 * Panels of an uploaded dieline from its tagged lines (the editor's DielineLineTag list):
 * closed cut paths and loops of cut segments become outlines, which fold-tagged lines split
 * into panels linked by hinges. Re-run whenever the customer re-tags a line.
 */
export function panelsFromLineTags(tags: DielineLineTag[]): Panel[] {
    const segments: SvgLine[] = [];
    const outlines: Pt[][] = [];
    for (const tag of tags) {
        for (const line of svgPathToPolylines(tag.path)) {
            if (tag.tag === 'cut' && line.closed && line.pts.length >= 3) {
                outlines.push(line.pts);
                continue;
            }
            const count = line.closed ? line.pts.length : line.pts.length - 1;
            for (let i = 0; i < count; i++) {
                const a = line.pts[i];
                const b = line.pts[(i + 1) % line.pts.length];
                if (!same(a, b)) segments.push({ id: `${tag.id}-${i + 1}`, a, b, kind: tag.tag === 'fold' ? 'crease' : 'cut' });
            }
        }
    }
    const loops = [...outlines, ...cutLoops(segments)];
    if (!loops.length) return [];
    // The outer cut outline holds the panels; small closed cuts inside it (holes, windows) are not panels.
    const outer = loops.reduce((a, b) => (Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a));
    const start: Panel = { id: 'panel-1', name: 'Panel 1', polygon: outer, foldAngle: 0, side: 'outside' };
    return mapSvgCreasesToPanels([start], segments).map((panel, i) => ({ ...panel, name: `Panel ${i + 1}` }));
}

function parsePath(tag: string): { subpaths: { points: Pt[]; closed: boolean }[]; unsupported: boolean } {
    const d = attr(tag, 'd') ?? '';
    if (/[CcSsQqTtAa]/.test(d)) return { subpaths: [], unsupported: true };
    const tokens = d.match(/[MLHVZmlhvz]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/gi) ?? [];
    let cursor = { x: 0, y: 0 };
    let command = '';
    const subpaths: { points: Pt[]; closed: boolean }[] = [];
    let current: { points: Pt[]; closed: boolean } | null = null;
    for (let i = 0; i < tokens.length; ) {
        if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++];
        const relative = command === command.toLowerCase();
        const op = command.toUpperCase();
        if (op === 'Z') {
            if (current) current.closed = true;
            current = null;
            command = '';
            continue;
        }
        if (op === 'M' || op === 'L') {
            if (i + 1 >= tokens.length) return { subpaths: [], unsupported: true };
            const x = Number(tokens[i++]);
            const y = Number(tokens[i++]);
            cursor = { x: relative ? cursor.x + x : x, y: relative ? cursor.y + y : y };
            if (op === 'M') {
                current = { points: [{ ...cursor }], closed: false };
                subpaths.push(current);
                command = relative ? 'l' : 'L';
            } else {
                if (!current) return { subpaths: [], unsupported: true };
                current.points.push({ ...cursor });
            }
        } else if (op === 'H') {
            if (!current) return { subpaths: [], unsupported: true };
            const x = Number(tokens[i++]);
            cursor = { ...cursor, x: relative ? cursor.x + x : x };
            current.points.push({ ...cursor });
        } else if (op === 'V') {
            if (!current) return { subpaths: [], unsupported: true };
            const y = Number(tokens[i++]);
            cursor = { ...cursor, y: relative ? cursor.y + y : y };
            current.points.push({ ...cursor });
        } else return { subpaths: [], unsupported: true };
    }
    return { subpaths, unsupported: false };
}

/** Parse a safe straight-edge SVG subset. Unsupported transforms/curves are clearly flagged. */
export function parseUploadedSvg(source: string): ParsedSvgDieline {
    if (source.length > 10_000_000) throw new Error('SVG exceeds the 10 MB parser limit.');
    if (!/<svg\b/i.test(source) || /<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b/i.test(source)) throw new Error('File is not a safe SVG dieline.');
    const rootTag = source.match(/<svg\b[^>]*>/i)?.[0] ?? '';
    const w = length(attr(rootTag, 'width'));
    const h = length(attr(rootTag, 'height'));
    const vb = attr(rootTag, 'viewBox')?.trim().split(/[ ,]+/).map(Number);
    if (vb && (vb.length !== 4 || vb.some((value) => !Number.isFinite(value)) || vb[2] <= 0 || vb[3] <= 0))
        throw new Error('SVG viewBox is invalid.');
    const unit = w?.unit ?? h?.unit ?? (vb ? 'px' : 'mm');
    const unitToMm = unit === 'in' ? 25.4 : unit === 'cm' ? 10 : unit === 'pt' ? 25.4 / 72 : unit === 'px' ? 25.4 / 96 : 1;
    const width = w ? w.value * unitToMm : vb ? vb[2] * unitToMm : 0;
    const height = h ? h.value * unitToMm : vb ? vb[3] * unitToMm : 0;
    if (!(width > 0 && height > 0 && Number.isFinite(width + height)))
        throw new Error('SVG needs positive physical width and height or a valid viewBox.');
    const scaleX = width / (vb?.[2] ?? width);
    const scaleY = height / (vb?.[3] ?? height);
    const ox = vb?.[0] ?? 0;
    const oy = vb?.[1] ?? 0;
    const point = (p: Pt): Pt => ({ x: (p.x - ox) * scaleX, y: (p.y - oy) * scaleY });
    const panels: Panel[] = [];
    const lines: SvgLine[] = [];
    let unsupported = /transform\s*=/.test(source);
    const tags = source.match(/<(?:polygon|polyline|rect|line|path)\b[^>]*>/gi) ?? [];
    for (const [index, tag] of tags.entries()) {
        const name = tag.match(/^<([a-z]+)/i)?.[1]?.toLowerCase();
        let polygon: Pt[] = [];
        let isClosed = false;
        if (name === 'polygon' || name === 'polyline') {
            polygon = parsePoints(attr(tag, 'points') ?? '');
            isClosed = name === 'polygon' || (polygon.length > 2 && same(polygon[0], polygon[polygon.length - 1]));
        } else if (name === 'rect') {
            const x = Number(attr(tag, 'x') ?? 0);
            const y = Number(attr(tag, 'y') ?? 0);
            const rw = Number(attr(tag, 'width'));
            const rh = Number(attr(tag, 'height'));
            if (rw > 0 && rh > 0) {
                polygon = [
                    { x, y },
                    { x: x + rw, y },
                    { x: x + rw, y: y + rh },
                    { x, y: y + rh },
                ];
                isClosed = true;
            }
        } else if (name === 'path') {
            const path = parsePath(tag);
            unsupported ||= path.unsupported;
            for (const subpath of path.subpaths) {
                if (subpath.closed && subpath.points.length >= 3) {
                    panels.push({
                        id: attr(tag, 'id') ?? `panel-${panels.length + 1}`,
                        name: attr(tag, 'id') ?? `Panel ${panels.length + 1}`,
                        polygon: subpath.points.map(point),
                        foldAngle: 0,
                        side: 'outside',
                    });
                }
                const count = subpath.closed ? subpath.points.length : subpath.points.length - 1;
                for (let i = 0; i < count && (!subpath.closed || lineKind(tag) !== 'unknown'); i++) {
                    const a = point(subpath.points[i]);
                    const b = point(subpath.points[(i + 1) % subpath.points.length]);
                    if (!same(a, b)) lines.push({ id: `${attr(tag, 'id') ?? `path-${index}`}-${i + 1}`, a, b, kind: lineKind(tag) });
                }
            }
        } else if (name === 'line') {
            const a = point({ x: Number(attr(tag, 'x1')), y: Number(attr(tag, 'y1')) });
            const b = point({ x: Number(attr(tag, 'x2')), y: Number(attr(tag, 'y2')) });
            if (Number.isFinite(a.x + a.y + b.x + b.y) && !same(a, b))
                lines.push({ id: attr(tag, 'id') ?? `line-${index}`, a, b, kind: lineKind(tag) });
        }
        if (isClosed && polygon.length >= 3)
            panels.push({
                id: attr(tag, 'id') ?? `panel-${panels.length + 1}`,
                name: attr(tag, 'id') ?? `Panel ${panels.length + 1}`,
                polygon: polygon.map(point),
                foldAngle: 0,
                side: 'outside',
            });
        if (name === 'polyline') {
            const count = isClosed ? polygon.length - 1 : polygon.length - 1;
            for (let i = 0; i < count; i++) {
                const a = point(polygon[i]);
                const b = point(polygon[i + 1]);
                if (!same(a, b)) lines.push({ id: `${attr(tag, 'id') ?? `polyline-${index}`}-${i + 1}`, a, b, kind: lineKind(tag) });
            }
        }
    }
    const detectedPanels = panels.length
        ? panels
        : cutLoops(lines).map((polygon, index) => ({
              id: `cut-outline-${index + 1}`,
              name: `Detected outline ${index + 1}`,
              polygon,
              foldAngle: 0,
              side: 'outside' as const,
          }));
    const mapped = mapSvgCreasesToPanels(detectedPanels, lines);
    const allPoints = mapped.flatMap((panel) => panel.polygon);
    const minX = allPoints.length ? Math.min(...allPoints.map((p) => p.x)) : 0;
    const minY = allPoints.length ? Math.min(...allPoints.map((p) => p.y)) : 0;
    const normalizedPanels = mapped.map((panel) => ({
        ...panel,
        polygon: panel.polygon.map((p) => ({ x: p.x - minX, y: p.y - minY })),
        hinge: panel.hinge
            ? { a: { x: panel.hinge.a.x - minX, y: panel.hinge.a.y - minY }, b: { x: panel.hinge.b.x - minX, y: panel.hinge.b.y - minY } }
            : undefined,
    }));
    const normalizedLines = lines.map((line) => ({
        ...line,
        a: { x: line.a.x - minX, y: line.a.y - minY },
        b: { x: line.b.x - minX, y: line.b.y - minY },
    }));
    const warnings: string[] = [];
    if (unit === 'px') warnings.push('SVG uses pixels; confirm the physical scale before production.');
    if (unsupported) warnings.push('SVG contains transformed or curved geometry. Simplify it to straight paths before production.');
    if (!normalizedPanels.length)
        warnings.push('No closed panel shapes could be inferred from the cut lines. Add a closed outline or correct the cut-line tags.');
    if (normalizedLines.some((line) => line.kind === 'unknown'))
        warnings.push('Some lines are unclassified. Tag each as cut or crease before using 3D fold preview.');
    if (normalizedLines.some((line) => line.kind === 'crease') && normalizedPanels.every((panel) => !panel.parentId))
        warnings.push('Crease lines did not split or match panel edges; those folds need manual mapping.');
    return { panels: normalizedPanels, lines: normalizedLines, width, height, unit, warnings };
}
