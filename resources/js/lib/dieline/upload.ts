import type { DielineLineTag, Panel, Pt } from '@/types/design';
import DxfParser from 'dxf-parser';
import { bounds, rect } from './geometry';
import { applyMatrix, ellipsePoints, IDENTITY, multiply, parseTransform, svgPathToPolylines, type Matrix, type Polyline } from './svgPath';

export type ParsedUploadedDieline = {
    fileId: string;
    panels: Panel[];
    lines: DielineLineTag[];
    foldMapped: boolean;
};

function pointsToPath(pts: Pt[], closed = false): string {
    if (!pts.length) return '';
    const cmds = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    if (closed) cmds.push('Z');
    return cmds.join(' ');
}

function parsePointsAttr(raw: string | null): Pt[] {
    if (!raw) return [];
    const nums = raw
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n));
    const pts: Pt[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
        pts.push({ x: nums[i], y: nums[i + 1] });
    }
    return pts;
}

function isLikelyFoldStyle(el: Element): boolean {
    const dash = el.getAttribute('stroke-dasharray') ?? '';
    const stroke = (el.getAttribute('stroke') ?? '').toLowerCase();
    const id = (el.getAttribute('id') ?? '').toLowerCase();
    const cls = (el.getAttribute('class') ?? '').toLowerCase();
    return (
        (dash !== '' && dash !== 'none') ||
        stroke.includes('f00') ||
        stroke.includes('e11d48') ||
        stroke.includes('red') ||
        id.includes('fold') ||
        id.includes('crease') ||
        cls.includes('fold') ||
        cls.includes('crease')
    );
}

/** Elements that never draw by themselves (clip paths, symbols, …): their shapes are not dieline lines. */
const NON_RENDERED = 'defs, clipPath, mask, symbol, pattern, marker';

const attr = (el: Element, name: string): number => Number(el.getAttribute(name) ?? 0) || 0;

/** The element's shapes in its own coordinates (before transforms). */
function elementPolylines(el: Element): Polyline[] {
    switch (el.tagName.toLowerCase()) {
        case 'path':
            return svgPathToPolylines(el.getAttribute('d') ?? '');
        case 'line':
            return [
                {
                    pts: [
                        { x: attr(el, 'x1'), y: attr(el, 'y1') },
                        { x: attr(el, 'x2'), y: attr(el, 'y2') },
                    ],
                    closed: false,
                },
            ];
        case 'rect': {
            const w = attr(el, 'width');
            const h = attr(el, 'height');
            return w > 0 && h > 0 ? [{ pts: rect(attr(el, 'x'), attr(el, 'y'), w, h), closed: true }] : [];
        }
        case 'circle': {
            const r = attr(el, 'r');
            return r > 0 ? [{ pts: ellipsePoints(attr(el, 'cx'), attr(el, 'cy'), r, r), closed: true }] : [];
        }
        case 'ellipse': {
            const rx = attr(el, 'rx');
            const ry = attr(el, 'ry');
            return rx > 0 && ry > 0 ? [{ pts: ellipsePoints(attr(el, 'cx'), attr(el, 'cy'), rx, ry), closed: true }] : [];
        }
        case 'polygon':
        case 'polyline': {
            const pts = parsePointsAttr(el.getAttribute('points'));
            return pts.length >= 2 ? [{ pts, closed: el.tagName.toLowerCase() === 'polygon' }] : [];
        }
        default:
            return [];
    }
}

/** The element's own transform combined with every ancestor's (outermost first). */
function elementMatrix(el: Element): Matrix {
    const chain: Element[] = [];
    for (let node: Element | null = el; node; node = node.parentElement) chain.unshift(node);
    return chain.reduce((m, node) => multiply(m, parseTransform(node.getAttribute('transform'))), IDENTITY);
}

/**
 * Parses an uploaded SVG dieline into `DielineLineTag[]` (moved so the drawing starts at 0,0)
 * with a fallback bounding panel. All path commands, curves, arcs and group / element
 * transforms are applied (see svgPath.ts), so the lines keep their real shape and position.
 * SVG user units are taken as mm.
 */
export function parseSvgDieline(svgText: string, fileName: string): ParsedUploadedDieline {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
        throw new Error('Could not parse SVG file.');
    }

    const rawLines: { tag: 'cut' | 'fold'; polylines: Polyline[] }[] = [];
    doc.querySelectorAll('path, line, rect, circle, ellipse, polygon, polyline').forEach((el) => {
        if (el.closest(NON_RENDERED)) return;
        const m = elementMatrix(el);
        const polylines = elementPolylines(el).map((l) => ({ ...l, pts: l.pts.map((pt) => applyMatrix(m, pt)) }));
        if (polylines.length) rawLines.push({ tag: isLikelyFoldStyle(el) ? 'fold' : 'cut', polylines });
    });

    const allPts = rawLines.flatMap((l) => l.polylines.flatMap((pl) => pl.pts));
    if (!rawLines.length || !allPts.length) {
        throw new Error('No vector paths or lines found in this SVG.');
    }

    const b = bounds([allPts]);
    const width = Math.max(20, b.maxX - b.minX);
    const height = Math.max(20, b.maxY - b.minY);
    const shift = (pt: Pt): Pt => ({ x: pt.x - b.minX, y: pt.y - b.minY });

    const lines: DielineLineTag[] = rawLines.map((l, idx) => ({
        id: `line-${idx + 1}`,
        path: l.polylines.map((pl) => pointsToPath(pl.pts.map(shift), pl.closed)).join(' '),
        tag: l.tag,
    }));

    const panels: Panel[] = [
        {
            id: 'uploaded-sheet',
            name: fileName.replace(/\.[^.]+$/, '') || 'Custom dieline',
            polygon: rect(0, 0, width, height),
            foldAngle: 0,
            side: 'outside',
        },
    ];

    return {
        fileId: `${fileName}-${Date.now().toString(36)}`,
        panels,
        lines,
        foldMapped: lines.some((l) => l.tag === 'fold'),
    };
}

/** Parses an uploaded DXF dieline into normalized `DielineLineTag[]` (mm). */
export function parseDxfDieline(dxfText: string, fileName: string): ParsedUploadedDieline {
    const parser = new DxfParser();
    const dxf = parser.parseSync(dxfText);
    const entities = dxf?.entities ?? [];

    const rawLines: { pts: Pt[]; closed: boolean; tag: 'cut' | 'fold' }[] = [];
    for (const ent of entities as Array<{
        type?: string;
        layer?: string;
        vertices?: Array<{ x: number; y: number }>;
        shape?: boolean;
    }>) {
        const layer = (ent.layer ?? '').toLowerCase();
        const tag: 'cut' | 'fold' = layer.includes('fold') || layer.includes('crease') ? 'fold' : 'cut';
        if (
            (ent.type === 'LINE' || ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') &&
            Array.isArray(ent.vertices) &&
            ent.vertices.length >= 2
        ) {
            // Flip Y because DXF Y points up while SVG/Fabric Y points down.
            const pts = ent.vertices.map((v) => ({ x: v.x, y: -v.y }));
            rawLines.push({ pts, closed: !!ent.shape, tag });
        }
    }

    const allPts = rawLines.flatMap((l) => l.pts);
    if (!rawLines.length || !allPts.length) {
        throw new Error('No LINE or POLYLINE entities found in this DXF.');
    }

    const b = bounds([allPts]);
    const width = Math.max(20, b.maxX - b.minX);
    const height = Math.max(20, b.maxY - b.minY);
    const dx = -b.minX;
    const dy = -b.minY;

    const lines: DielineLineTag[] = rawLines.map((l, idx) => ({
        id: `line-${idx + 1}`,
        path: pointsToPath(
            l.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            l.closed,
        ),
        tag: l.tag,
    }));

    const panels: Panel[] = [
        {
            id: 'uploaded-sheet',
            name: fileName.replace(/\.[^.]+$/, '') || 'Custom dieline',
            polygon: rect(0, 0, width, height),
            foldAngle: 0,
            side: 'outside',
        },
    ];

    return {
        fileId: `${fileName}-${Date.now().toString(36)}`,
        panels,
        lines,
        foldMapped: lines.some((l) => l.tag === 'fold'),
    };
}

export async function parseUploadedDielineFile(file: File): Promise<ParsedUploadedDieline> {
    const text = await file.text();
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'dxf') return parseDxfDieline(text, file.name);
    if (ext === 'svg') return parseSvgDieline(text, file.name);
    throw new Error('Please upload an .svg or .dxf dieline file.');
}
