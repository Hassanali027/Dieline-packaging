import type { DielineLineTag, Panel, Pt } from '@/types/design';
import DxfParser from 'dxf-parser';
import { bounds, rect } from './geometry';

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

function extractPathPoints(d: string): Pt[] {
    const nums = d
        .replace(/[A-Za-z]/g, ' ')
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

function shiftPath(d: string, dx: number, dy: number): string {
    // Only shift simple M/L/H/V/C/Q/Z paths when needed; for SVG we normalize via viewBox or numeric offset.
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return d;
    let axis = 0;
    return d.replace(/([MLHVCSQTAZmlhvcsqtaz])|(-?\d*\.?\d+(?:e[+-]?\d+)?)/g, (token, cmd, numStr) => {
        if (cmd) {
            axis = 0;
            return cmd;
        }
        const v = Number(numStr);
        const shifted = axis % 2 === 0 ? v + dx : v + dy;
        axis += 1;
        return String(Math.round(shifted * 1000) / 1000);
    });
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

/** Parses an uploaded SVG dieline into normalized `DielineLineTag[]` (mm) with a fallback bounding panel. */
export function parseSvgDieline(svgText: string, fileName: string): ParsedUploadedDieline {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
        throw new Error('Could not parse SVG file.');
    }

    const rawLines: { path: string; tag: 'cut' | 'fold'; pts: Pt[] }[] = [];
    const elements = doc.querySelectorAll('path, line, rect, polygon, polyline');

    elements.forEach((el) => {
        const tagName = el.tagName.toLowerCase();
        const tag: 'cut' | 'fold' = isLikelyFoldStyle(el) ? 'fold' : 'cut';

        if (tagName === 'path') {
            const d = el.getAttribute('d')?.trim();
            if (d) rawLines.push({ path: d, tag, pts: extractPathPoints(d) });
        } else if (tagName === 'line') {
            const x1 = Number(el.getAttribute('x1') ?? 0);
            const y1 = Number(el.getAttribute('y1') ?? 0);
            const x2 = Number(el.getAttribute('x2') ?? 0);
            const y2 = Number(el.getAttribute('y2') ?? 0);
            const pts = [
                { x: x1, y: y1 },
                { x: x2, y: y2 },
            ];
            rawLines.push({ path: pointsToPath(pts), tag, pts });
        } else if (tagName === 'rect') {
            const x = Number(el.getAttribute('x') ?? 0);
            const y = Number(el.getAttribute('y') ?? 0);
            const w = Number(el.getAttribute('width') ?? 0);
            const h = Number(el.getAttribute('height') ?? 0);
            if (w > 0 && h > 0) {
                const pts = rect(x, y, w, h);
                rawLines.push({ path: pointsToPath(pts, true), tag, pts });
            }
        } else if (tagName === 'polygon' || tagName === 'polyline') {
            const pts = parsePointsAttr(el.getAttribute('points'));
            if (pts.length >= 2) {
                rawLines.push({ path: pointsToPath(pts, tagName === 'polygon'), tag, pts });
            }
        }
    });

    const allPts = rawLines.flatMap((l) => l.pts);
    if (!rawLines.length || !allPts.length) {
        throw new Error('No vector paths or lines found in this SVG.');
    }

    const b = bounds([allPts]);
    const width = Math.max(20, b.maxX - b.minX);
    const height = Math.max(20, b.maxY - b.minY);
    const dx = -b.minX;
    const dy = -b.minY;

    const lines: DielineLineTag[] = rawLines.map((l, idx) => ({
        id: `line-${idx + 1}`,
        path: shiftPath(l.path, dx, dy),
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
        if ((ent.type === 'LINE' || ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && Array.isArray(ent.vertices) && ent.vertices.length >= 2) {
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
