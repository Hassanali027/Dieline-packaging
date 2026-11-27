import { fetchLibrary, type Library, type LibraryIcon, type LibraryPattern } from '@/lib/api';
import { BLEED_MM, mirrorPolygonX, rect, signedArea } from '@/lib/dieline';
import { svgPathToPolylines } from '@/lib/dieline/svgPath';
import { newObjectId, type BoxSide } from '@/store/useEditorStore';
import type { CanvasObject, DielineResult, Panel, Pt } from '@/types/design';
import type { SheetFrame } from './objects';

/**
 * Icons and patterns from the admin library (Filament → /api/library) as canvas objects.
 *
 * - icon:    props.svg (sanitised markup) + props.fill (one colour for the whole icon).
 *            Drawn as an image, so it scales and rotates like any other object.
 * - pattern: a tile repeated over one panel or the whole sheet (props.points, in sheet mm).
 *            It stays where it was put (no moving / scaling); the toolbar changes tile size,
 *            colour and opacity, and it sits behind the rest of the artwork.
 */

let libraryRequest: Promise<Library> | null = null;

/** The library, fetched once per page load (admins rarely change it while someone designs). */
export function loadLibrary(): Promise<Library> {
    libraryRequest ??= fetchLibrary()
        .then((r) => r.data)
        .catch((error) => {
            libraryRequest = null; // let the next attempt retry
            throw error;
        });
    return libraryRequest;
}

const COLOR_ATTR = /\b(fill|stroke)\s*=\s*"(?!none|transparent|url\()[^"]*"/gi;
const COLOR_STYLE = /\b(fill|stroke)\s*:\s*(?!none|transparent|url\()[^;"']+/gi;

/**
 * Paints every fill and stroke of an SVG in one colour (icons and pattern tiles are one-colour
 * line art). `none` stays none, so outlines stay outlines.
 */
export function tintSvg(svg: string, color: string): string {
    const safe = /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#0f172a';
    return svg
        .replace(COLOR_ATTR, (_m, prop: string) => `${prop}="${safe}"`)
        .replace(COLOR_STYLE, (_m, prop: string) => `${prop}:${safe}`)
        .replace(/<svg\b/i, `<svg color="${safe}"`); // for currentColor
}

/** viewBox width / height of an SVG (1 when unknown). */
export function svgAspect(svg: string): number {
    const vb = svg
        .match(/viewBox\s*=\s*"([^"]+)"/i)?.[1]
        ?.trim()
        .split(/[\s,]+/)
        .map(Number);
    if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) return vb[2] / vb[3];
    const w = Number(svg.match(/\bwidth\s*=\s*"([\d.]+)/i)?.[1]);
    const h = Number(svg.match(/\bheight\s*=\s*"([\d.]+)/i)?.[1]);
    return w > 0 && h > 0 ? w / h : 1;
}

/** Base pixel size the icon image is drawn at (the object's scale maps it to mm). */
export const ICON_BASE = 100;

/**
 * A data: URI with an explicit width / height: an SVG with only a viewBox has no reliable
 * intrinsic size in an <img>, which would make the object's size depend on the browser.
 */
export function svgDataUri(svg: string, width: number, height: number): string {
    const sized = svg.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => {
        const rest = attrs.replace(/\s(width|height)\s*=\s*"[^"]*"/gi, '');
        return `<svg${rest} width="${width}" height="${height}">`;
    });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
}

/** Base size (px = object units before scaling) of an icon object. */
export function iconBaseSize(svg: string): { width: number; height: number } {
    const aspect = svgAspect(svg);
    return aspect >= 1 ? { width: ICON_BASE, height: ICON_BASE / aspect } : { width: ICON_BASE * aspect, height: ICON_BASE };
}

/** The image source an icon object draws (its SVG in its colour). */
export function iconSrc(obj: CanvasObject): string {
    const svg = String(obj.props.svg ?? '');
    const { width, height } = iconBaseSize(svg);
    return svgDataUri(tintSvg(svg, String(obj.props.fill ?? '#0f172a')), width, height);
}

export function makeIcon(icon: LibraryIcon, side: BoxSide, sheet: SheetFrame): CanvasObject {
    // About a fifth of the sheet's short side, 15–40 mm.
    const targetMm = Math.max(15, Math.min(40, Math.min(sheet.width, sheet.height) * 0.2));
    const base = iconBaseSize(icon.svg);
    const scale = targetMm / Math.max(base.width, base.height);
    return {
        id: newObjectId(),
        type: 'icon',
        side,
        props: {
            svg: icon.svg,
            fill: '#0f172a',
            name: icon.name,
            libraryId: icon.id,
            naturalWidth: base.width,
            naturalHeight: base.height,
            left: sheet.width / 2,
            top: sheet.height / 2,
            angle: 0,
            scaleX: scale,
            scaleY: scale,
            opacity: 1,
        },
    };
}

/** Default repeat size of a pattern tile on the sheet. */
export const DEFAULT_TILE_MM = 15;

function boundsOf(points: Pt[]) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { minX, minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/**
 * A pattern over one panel (when `panel` is given) or the whole printed sheet (`sheetArea`,
 * see sheetOutline; without it the sheet rectangle plus bleed).
 * On the inside the sheet is shown mirrored, so the panel outline is mirrored too.
 */
/**
 * The printed area of a sheet: the dieline grown by the bleed (result.bleedPath), so a
 * whole-box pattern stops where the sheet is cut away instead of filling the waste around it.
 * Falls back to the sheet rectangle plus bleed.
 */
export function sheetOutline(result: DielineResult | null | undefined, sheet: SheetFrame): Pt[] {
    const outlines = result ? svgPathToPolylines(result.bleedPath).filter((l) => l.pts.length >= 3) : [];
    if (!outlines.length) return rect(-BLEED_MM, -BLEED_MM, sheet.width + 2 * BLEED_MM, sheet.height + 2 * BLEED_MM);
    return outlines.reduce((a, b) => (Math.abs(signedArea(b.pts)) > Math.abs(signedArea(a.pts)) ? b : a)).pts;
}

export function makePattern(pattern: LibraryPattern, side: BoxSide, sheet: SheetFrame, panel?: Panel | null, sheetArea?: Pt[]): CanvasObject {
    const area = panel ? panel.polygon : (sheetArea ?? rect(-BLEED_MM, -BLEED_MM, sheet.width + 2 * BLEED_MM, sheet.height + 2 * BLEED_MM));
    const outline = side === 'inside' ? mirrorPolygonX(area, sheet.width) : area;
    const points = outline.map((p) => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 }));
    const b = boundsOf(points);
    return {
        id: newObjectId(),
        type: 'pattern',
        side,
        panelId: panel?.id,
        locked: false,
        props: {
            name: pattern.name,
            libraryId: pattern.id,
            // SVG tiles can be recoloured; image tiles are used as they are.
            tileSvg: pattern.svg ?? null,
            tileSrc: pattern.svg ? null : pattern.src,
            fill: '#0f172a',
            tileMm: DEFAULT_TILE_MM,
            points,
            width: b.width,
            height: b.height,
            left: b.minX + b.width / 2,
            top: b.minY + b.height / 2,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 0.9,
        },
    };
}

/** The tile image a pattern object repeats. */
export function patternTileSrc(obj: CanvasObject): string {
    const svg = obj.props.tileSvg;
    if (typeof svg === 'string' && svg) {
        const aspect = svgAspect(svg);
        const w = 256;
        return svgDataUri(tintSvg(svg, String(obj.props.fill ?? '#0f172a')), w, Math.max(1, Math.round(w / aspect)));
    }
    return String(obj.props.tileSrc ?? '');
}
