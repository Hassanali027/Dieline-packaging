import type { DielineLineTag, Panel, Pt } from '@/types/design';
import DxfParser from 'dxf-parser';
import { bounds, rect } from './geometry';
import { applyMatrix, ellipsePoints, IDENTITY, multiply, parseTransform, svgPathToPolylines, type Matrix, type Polyline } from './svgPath';
import { panelsFromLineTags } from './uploadedSvg';

export type ParsedUploadedDieline = {
    fileId: string;
    panels: Panel[];
    lines: DielineLineTag[];
    foldMapped: boolean;
    widthMm: number;
    heightMm: number;
    unit: string;
    warnings: string[];
    scaleConfirmed: boolean;
};

/** Millimetres per unit for the units SVG and CSS allow (unitless SVG lengths are px). */
const MM_PER_UNIT: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96 };

/**
 * How many mm one SVG user unit is, from the root's width / height and viewBox. A file with
 * a physical width (e.g. width="210mm") is exact; pixels follow CSS (96 per inch) but are a
 * guess about how it was drawn; a file without any size is taken as drawn in mm. Anything
 * that is a guess comes with a warning so the customer confirms the real size.
 */
function svgUnitScale(svg: Element): { mmPerUnit: number; unit: string; warnings: string[] } {
    const length = (raw: string | null) => {
        const m = raw?.trim().match(/^([\d.]+(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|pc|px)?$/i);
        return m ? { value: Number(m[1]), unit: (m[2] ?? 'px').toLowerCase() } : null;
    };
    const width = length(svg.getAttribute('width'));
    const vb = svg
        .getAttribute('viewBox')
        ?.trim()
        .split(/[\s,]+/)
        .map(Number);
    const vbWidth = vb && vb.length === 4 && vb[2] > 0 ? vb[2] : null;
    if (!width) {
        return {
            mmPerUnit: 1,
            unit: 'assumed mm',
            warnings: ['The file has no physical size, so it was read as millimetres. Check the size below.'],
        };
    }
    const mmWidth = width.value * MM_PER_UNIT[width.unit];
    const mmPerUnit = vbWidth ? mmWidth / vbWidth : MM_PER_UNIT[width.unit];
    const warnings = width.unit === 'px' ? ['The file is measured in pixels (read at 96 per inch). Check the size below.'] : [];
    return { mmPerUnit, unit: width.unit, warnings };
}

/** Panels, size and warnings shared by the SVG and DXF readers. Lines are already in mm, from (0, 0). */
function finishUpload(
    fileName: string,
    lines: DielineLineTag[],
    width: number,
    height: number,
    unit: string,
    warnings: string[],
): ParsedUploadedDieline {
    let panels = panelsFromLineTags(lines);
    if (!panels.length) {
        warnings.push('No closed cut outline was found, so the 3D fold preview is off. Tag the outline lines as Cut.');
        panels = [
            {
                id: 'uploaded-sheet',
                name: fileName.replace(/\.[^.]+$/, '') || 'Custom dieline',
                polygon: rect(0, 0, width, height),
                foldAngle: 0,
                side: 'outside',
            },
        ];
    } else if (panels.length === 1 && lines.some((l) => l.tag === 'fold')) {
        warnings.push('The fold lines do not cross the outline from edge to edge, so no panels were split off. Fold mapping needs them.');
    }
    return {
        fileId: `${fileName}-${Date.now().toString(36)}`,
        panels,
        lines,
        foldMapped: panels.some((p) => p.parentId),
        widthMm: width,
        heightMm: height,
        unit,
        warnings,
        scaleConfirmed: warnings.length === 0,
    };
}

/** Resizes an uploaded dieline (the customer corrected its real width). */
export function scaleUploadedDieline<T extends { panels: Panel[]; lines?: DielineLineTag[]; widthMm?: number; heightMm?: number }>(
    source: T,
    factor: number,
): T {
    if (!(factor > 0) || !Number.isFinite(factor)) return source;
    const s = (p: Pt): Pt => ({ x: Math.round(p.x * factor * 1000) / 1000, y: Math.round(p.y * factor * 1000) / 1000 });
    return {
        ...source,
        panels: source.panels.map((panel) => ({
            ...panel,
            polygon: panel.polygon.map(s),
            hinge: panel.hinge ? { a: s(panel.hinge.a), b: s(panel.hinge.b) } : undefined,
        })),
        lines: source.lines?.map((line) => ({
            ...line,
            path: svgPathToPolylines(line.path)
                .map((pl) => pointsToPath(pl.pts.map(s), pl.closed))
                .join(' '),
        })),
        widthMm: source.widthMm !== undefined ? source.widthMm * factor : undefined,
        heightMm: source.heightMm !== undefined ? source.heightMm * factor : undefined,
    };
}

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

    const { mmPerUnit, unit, warnings } = svgUnitScale(doc.documentElement);
    const toMm = (p: Pt): Pt => ({ x: p.x * mmPerUnit, y: p.y * mmPerUnit });
    const rawLines: { tag: 'cut' | 'fold'; polylines: Polyline[] }[] = [];
    doc.querySelectorAll('path, line, rect, circle, ellipse, polygon, polyline').forEach((el) => {
        if (el.closest(NON_RENDERED)) return;
        const m = elementMatrix(el);
        const polylines = elementPolylines(el).map((l) => ({ ...l, pts: l.pts.map((pt) => toMm(applyMatrix(m, pt))) }));
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

    return finishUpload(fileName, lines, width, height, unit, warnings);
}

/** Parses an uploaded DXF dieline into normalized `DielineLineTag[]` (mm). */
export function parseDxfDieline(dxfText: string, fileName: string): ParsedUploadedDieline {
    const parser = new DxfParser();
    const dxf = parser.parseSync(dxfText);
    const entities = dxf?.entities ?? [];
    // $INSUNITS: 1 inch, 2 feet, 4 mm, 5 cm, 6 m. Missing / 0 = unitless: read as mm and ask to confirm.
    const insUnits = Number((dxf?.header as Record<string, unknown> | undefined)?.['$INSUNITS'] ?? 0);
    const dxfUnits: Record<number, [string, number]> = { 1: ['in', 25.4], 2: ['ft', 304.8], 4: ['mm', 1], 5: ['cm', 10], 6: ['m', 1000] };
    const [unit, mmPerUnit] = dxfUnits[insUnits] ?? ['assumed mm', 1];
    const warnings = dxfUnits[insUnits] ? [] : ['The DXF does not say which unit it uses, so it was read as millimetres. Check the size below.'];

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
            const pts = ent.vertices.map((v) => ({ x: v.x * mmPerUnit, y: -v.y * mmPerUnit }));
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

    return finishUpload(fileName, lines, width, height, unit, warnings);
}

export async function parseUploadedDielineFile(file: File): Promise<ParsedUploadedDieline> {
    const text = await file.text();
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'dxf') return parseDxfDieline(text, file.name);
    if (ext === 'svg') return parseSvgDieline(text, file.name);
    throw new Error('Please upload an .svg or .dxf dieline file.');
}
