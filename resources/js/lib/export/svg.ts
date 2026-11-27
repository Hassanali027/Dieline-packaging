import type { BoxParams, DielineResult } from '../../types/design';
import { fromMm, round, toMm } from '../dieline/geometry';

/**
 * Print/cutting SVG of a dieline (Dev 1). One <g> per layer so prepress tools (Illustrator,
 * Inkscape, CorelDRAW) show them as separate layers:
 *
 *   Bleed       - 3 mm outside the cut, where artwork must extend
 *   Safe        - keep text and logos inside
 *   CutContour  - knife line (solid). The usual spot colour name for cutters.
 *   Crease      - fold lines (dashed)
 *   Dimensions  - overall size and the box size, in mm or inches
 *
 * Coordinates stay in mm (viewBox units = mm, width/height carry the "mm" unit), so the file
 * opens at true size whatever unit the labels use.
 */

export type SvgLayer = 'bleed' | 'safe' | 'cut' | 'crease' | 'dimensions';

export type SvgExportOptions = {
    /** Unit for dimension labels. Geometry is always mm. */
    unit?: 'mm' | 'in';
    layers?: Partial<Record<SvgLayer, boolean>>;
    /** Shown as the box size label and in <title>. */
    params?: BoxParams;
    title?: string;
    /** PNG data URL of the customized print surface, embedded below the dieline layers. */
    artworkDataUrl?: string;
};

export const LAYER_STYLE: Record<Exclude<SvgLayer, 'dimensions'>, { id: string; stroke: string; width: number; dash?: string }> = {
    bleed: { id: 'Bleed', stroke: '#38bdf8', width: 0.25, dash: '2 1.5' },
    safe: { id: 'Safe', stroke: '#22c55e', width: 0.25, dash: '1 1.5' },
    cut: { id: 'CutContour', stroke: '#ec008c', width: 0.3 },
    crease: { id: 'Crease', stroke: '#00a0e9', width: 0.3, dash: '3 2' },
};

const DIMENSION_COLOR = '#334155';
/** Room around the sheet for the dimension lines, in mm. */
const MARGIN_MM = 18;
const TEXT_MM = 3.2;

function esc(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function n(v: number): string {
    return String(round(v, 3));
}

export function formatLength(mm: number, unit: 'mm' | 'in'): string {
    return unit === 'in' ? `${round(fromMm(mm, 'in'), 2)} in` : `${round(mm, 1)} mm`;
}

function layer(id: string, body: string): string {
    return `  <g id="${id}" inkscape:groupmode="layer" inkscape:label="${id}">\n${body}\n  </g>`;
}

function pathLayer(key: Exclude<SvgLayer, 'dimensions'>, paths: string[]): string {
    const s = LAYER_STYLE[key];
    const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
    const body = paths
        .filter(Boolean)
        .map(
            (d) =>
                `    <path d="${d}" fill="none" stroke="${s.stroke}" stroke-width="${s.width}"${dash} stroke-linecap="round" stroke-linejoin="round"/>`,
        )
        .join('\n');
    return layer(s.id, body);
}

/** A dimension line with end ticks and a centred label. */
function dimension(x1: number, y1: number, x2: number, y2: number, label: string, vertical: boolean): string {
    const tick = 2;
    const ticks = vertical
        ? `<line x1="${n(x1 - tick)}" y1="${n(y1)}" x2="${n(x1 + tick)}" y2="${n(y1)}"/><line x1="${n(x2 - tick)}" y1="${n(y2)}" x2="${n(x2 + tick)}" y2="${n(y2)}"/>`
        : `<line x1="${n(x1)}" y1="${n(y1 - tick)}" x2="${n(x1)}" y2="${n(y1 + tick)}"/><line x1="${n(x2)}" y1="${n(y2 - tick)}" x2="${n(x2)}" y2="${n(y2 + tick)}"/>`;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const text = vertical
        ? `<text x="${n(cx - 1.5)}" y="${n(cy)}" transform="rotate(-90 ${n(cx - 1.5)} ${n(cy)})" text-anchor="middle">${esc(label)}</text>`
        : `<text x="${n(cx)}" y="${n(cy - 1.5)}" text-anchor="middle">${esc(label)}</text>`;
    return `    <g><line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"/>${ticks}${text}</g>`;
}

export function dielineToSvg(result: DielineResult, options: SvgExportOptions = {}): string {
    const unit = options.unit ?? options.params?.unit ?? 'mm';
    const show = { bleed: true, safe: true, cut: true, crease: true, dimensions: true, ...options.layers };
    const { width: W, height: H } = result.overallSize;
    const m = MARGIN_MM;
    const vbW = W + 2 * m;
    const vbH = H + 2 * m;

    const layers: string[] = [];
    if (options.artworkDataUrl?.startsWith('data:image/png;base64,')) {
        layers.push(layer('Artwork', `    <image x="0" y="0" width="${n(W)}" height="${n(H)}" href="${options.artworkDataUrl}" preserveAspectRatio="none"/>`));
    }
    if (show.bleed) layers.push(pathLayer('bleed', [result.bleedPath]));
    if (show.safe) layers.push(pathLayer('safe', [result.safePath]));
    if (show.crease) layers.push(pathLayer('crease', result.creasePaths));
    if (show.cut) layers.push(pathLayer('cut', [result.cutPath]));

    if (show.dimensions) {
        const dims: string[] = [
            dimension(0, -m / 2 - 2, W, -m / 2 - 2, `${formatLength(W, unit)} (sheet)`, false),
            dimension(-m / 2 - 2, 0, -m / 2 - 2, H, `${formatLength(H, unit)} (sheet)`, true),
        ];
        const p = options.params;
        if (p) {
            const size = [p.length, p.width, p.depth].map((v) => formatLength(toMm(v, p.unit), unit).replace(/ (mm|in)$/, ''));
            const label = `Inside L ${size[0]} × W ${size[1]} × D ${size[2]} ${unit} · board ${formatLength(toMm(p.thickness, p.unit), unit)}`;
            dims.push(`    <text x="${n(W / 2)}" y="${n(H + m / 2 + TEXT_MM)}" text-anchor="middle">${esc(label)}</text>`);
        }
        layers.push(
            layer(
                'Dimensions',
                `    <g fill="${DIMENSION_COLOR}" stroke="${DIMENSION_COLOR}" stroke-width="0.2" font-family="Arial, Helvetica, sans-serif" font-size="${TEXT_MM}">\n${dims
                    .map((d) => d.replace(/<text /g, '<text stroke="none" '))
                    .join('\n')}\n    </g>`,
            ),
        );
    }

    const title = options.title ?? (options.params ? `${options.params.style} dieline` : 'Dieline');
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${n(vbW)}mm" height="${n(vbH)}mm" viewBox="${n(-m)} ${n(-m)} ${n(vbW)} ${n(vbH)}">`,
        `  <title>${esc(title)}</title>`,
        ...layers,
        '</svg>',
        '',
    ].join('\n');
}

/** File name like "mailer-220x160x70mm.svg". */
export function dielineFileName(params: BoxParams | null, ext = 'svg'): string {
    if (!params) return `dieline.${ext}`;
    const fmt = (v: number) => String(round(v, 2)).replace('.', '_');
    return `${params.style}-${fmt(params.length)}x${fmt(params.width)}x${fmt(params.depth)}${params.unit}.${ext}`;
}
