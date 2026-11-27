import { ALL_FONTS, ensureFont } from '@/lib/fonts';
import { newObjectId, type BoxSide } from '@/store/useEditorStore';
import type { CanvasObject } from '@/types/design';
import { Ellipse, FabricImage, Group, Line, Rect, Textbox, Triangle, util, type FabricObject } from 'fabric';

/**
 * Bridge between the store's CanvasObject JSON (the source of truth: undo, save, 3D texture)
 * and Fabric objects (the view). All sizes are millimetres; positions are object centres.
 */

export type ShapeKind = 'rect' | 'rounded' | 'circle' | 'triangle' | 'line';
export type TextPreset = 'heading' | 'subheading' | 'body';

/** Fabric objects we created carry the store id. */
export type BoundObject = FabricObject & { objectId?: string; propsKey?: string; shapeKind?: string; childrenKey?: string };

/** 1 pt = 0.3528 mm; the toolbar shows pt, the canvas works in mm. */
export const MM_PER_PT = 25.4 / 72;

export const FONT_FAMILIES = ALL_FONTS.map((f) => f.family);

const TEXT_PRESETS: Record<TextPreset, { text: string; fontSizePt: number; fontWeight: string }> = {
    heading: { text: 'Your Heading', fontSizePt: 36, fontWeight: 'bold' },
    subheading: { text: 'Subheading', fontSizePt: 22, fontWeight: '600' },
    body: { text: 'Add your text here', fontSizePt: 12, fontWeight: 'normal' },
};

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

function commonOptions(obj: CanvasObject) {
    const p = obj.props;
    const locked = !!obj.locked;
    return {
        originX: 'center' as const,
        originY: 'center' as const,
        left: num(p.left, 0),
        top: num(p.top, 0),
        angle: num(p.angle, 0),
        scaleX: num(p.scaleX, 1),
        scaleY: num(p.scaleY, 1),
        opacity: num(p.opacity, 1),
        lockMovementX: locked,
        lockMovementY: locked,
        lockRotation: locked,
        lockScalingX: locked,
        lockScalingY: locked,
        hasControls: !locked,
        hoverCursor: locked ? 'not-allowed' : 'move',
        borderColor: '#6366f1',
        cornerColor: '#ffffff',
        cornerStrokeColor: '#6366f1',
        transparentCorners: false,
        cornerSize: 9,
        strokeUniform: true,
        objectCaching: false,
    };
}

function shapeOptions(obj: CanvasObject) {
    const p = obj.props;
    return {
        fill: str(p.fill, '#6366f1'),
        stroke: str(p.stroke, '') || undefined,
        strokeWidth: num(p.strokeWidth, 0),
        strokeDashArray: Array.isArray(p.strokeDashArray) ? (p.strokeDashArray as number[]) : null,
    };
}

function textOptions(obj: CanvasObject) {
    const p = obj.props;
    return {
        text: str(p.text, 'Text'),
        width: num(p.width, 80),
        fontFamily: str(p.fontFamily, 'Arial'),
        fontSize: num(p.fontSize, 12 * MM_PER_PT),
        fontWeight: str(p.fontWeight, 'normal'),
        fontStyle: str(p.fontStyle, 'normal') as 'normal' | 'italic',
        textAlign: str(p.textAlign, 'center') as 'left' | 'center' | 'right' | 'justify',
        lineHeight: num(p.lineHeight, 1.16),
        fill: str(p.fill, '#0f172a'),
        splitByGrapheme: false,
    };
}

/** Builds the Fabric object for a CanvasObject. Images load asynchronously. */
export async function createFabricObject(obj: CanvasObject): Promise<BoundObject | null> {
    const p = obj.props;
    let fo: FabricObject | null = null;

    if (obj.type === 'text') {
        // Web fonts must be loaded before Fabric measures the text.
        await ensureFont(str(p.fontFamily, 'Arial'), str(p.fontWeight, 'normal'));
        fo = new Textbox(str(p.text, 'Text'), { ...commonOptions(obj), ...textOptions(obj) });
    } else if (obj.type === 'shape') {
        const kind = str(p.shape, 'rect') as ShapeKind;
        const width = num(p.width, 40);
        const height = num(p.height, 40);
        const base = { ...commonOptions(obj), ...shapeOptions(obj) };
        if (kind === 'circle') fo = new Ellipse({ ...base, rx: width / 2, ry: height / 2 });
        else if (kind === 'triangle') fo = new Triangle({ ...base, width, height });
        else if (kind === 'line')
            fo = new Line([-width / 2, 0, width / 2, 0], {
                ...base,
                fill: undefined,
                stroke: str(p.stroke, '#0f172a'),
                strokeWidth: num(p.strokeWidth, 1),
            });
        else fo = new Rect({ ...base, width, height, rx: num(p.rx, 0), ry: num(p.rx, 0) });
    } else if (obj.type === 'image' || obj.type === 'qr' || obj.type === 'barcode') {
        const src = str(p.src, '');
        if (!src) return null;
        try {
            fo = await FabricImage.fromURL(src, { crossOrigin: 'anonymous' }, commonOptions(obj));
        } catch {
            return null;
        }
    } else if (obj.type === 'group') {
        // Children are stored relative to the group centre; Fabric fits the group around them
        // (centre = 0, 0), then the group's own transform is applied.
        const children = (await Promise.all(groupChildren(obj).map((c) => createFabricObject(c)))).filter((c): c is BoundObject => !!c);
        if (!children.length) return null;
        const group = new Group(children, { subTargetCheck: false, interactive: false });
        group.set(commonOptions(obj));
        group.setCoords();
        fo = group;
    }

    if (!fo) return null;
    const bound = fo as BoundObject;
    bound.objectId = obj.id;
    bound.propsKey = propsKey(obj);
    if (obj.type === 'shape') bound.shapeKind = str(p.shape, 'rect');
    if (obj.type === 'group') bound.childrenKey = JSON.stringify(groupChildren(obj));
    return bound;
}

export function groupChildren(obj: CanvasObject): CanvasObject[] {
    return Array.isArray(obj.props.children) ? (obj.props.children as CanvasObject[]) : [];
}

/** Cheap change detection between the store and what a Fabric object last showed. */
export function propsKey(obj: CanvasObject): string {
    return JSON.stringify([obj.props, !!obj.locked]);
}

/** Pushes store changes onto an existing Fabric object. Returns false when it must be rebuilt. */
export function applyToFabric(fo: BoundObject, obj: CanvasObject): boolean {
    const key = propsKey(obj);
    if (fo.propsKey === key) return true;
    // An image/code with a new source, or a shape with a new kind, is simpler to rebuild.
    if (
        (obj.type === 'image' || obj.type === 'qr' || obj.type === 'barcode') &&
        (fo as FabricImage).getSrc?.() &&
        !(fo as FabricImage).getSrc().endsWith(str(obj.props.src, ''))
    )
        return false;
    if (obj.type === 'shape' && fo.shapeKind !== str(obj.props.shape, 'rect')) return false;
    if (obj.type === 'group' && fo.childrenKey !== JSON.stringify(groupChildren(obj))) return false;

    fo.set(commonOptions(obj));
    if (obj.type === 'text') fo.set(textOptions(obj));
    if (obj.type === 'shape') {
        const p = obj.props;
        const width = num(p.width, 40);
        const height = num(p.height, 40);
        if (str(p.shape, 'rect') === 'line') {
            fo.set({ stroke: str(p.stroke, '#0f172a'), strokeWidth: num(p.strokeWidth, 1) });
        } else {
            fo.set(shapeOptions(obj));
            if (fo instanceof Ellipse) fo.set({ rx: width / 2, ry: height / 2 });
            else if (fo instanceof Rect) fo.set({ width, height, rx: num(p.rx, 0), ry: num(p.rx, 0) });
            else fo.set({ width, height });
        }
    }
    fo.setCoords();
    fo.propsKey = key;
    return true;
}

/**
 * Reads the absolute transform of a Fabric object (also when it sits inside a multi-selection,
 * where left/top are relative to the selection) as store props.
 */
export function readTransform(fo: FabricObject): Record<string, number> {
    const d = util.qrDecompose(fo.calcTransformMatrix());
    const round = (v: number, p = 3) => Math.round(v * 10 ** p) / 10 ** p;
    return {
        left: round(d.translateX),
        top: round(d.translateY),
        angle: round(((d.angle % 360) + 360) % 360, 2),
        scaleX: round(d.scaleX, 5),
        scaleY: round(d.scaleY, 5),
    };
}

/** Text content and box width after in-place editing / resizing a Textbox. */
export function readText(fo: FabricObject): Record<string, unknown> {
    if (!(fo instanceof Textbox)) return {};
    const r = (v: number) => Math.round(v * 1000) / 1000;
    return { text: fo.text, width: r(fo.width), height: r(fo.height) };
}

/** Size of an object on the sheet in mm (after scaling), for the toolbar. */
export function objectSize(obj: CanvasObject): { width: number; height: number } {
    const p = obj.props;
    const sx = Math.abs(num(p.scaleX, 1));
    const sy = Math.abs(num(p.scaleY, 1));
    const base = baseSize(obj);
    return { width: base.width * sx, height: base.height * sy };
}

function baseSize(obj: CanvasObject): { width: number; height: number } {
    const p = obj.props;
    if (obj.type === 'image' || obj.type === 'qr' || obj.type === 'barcode')
        return { width: num(p.naturalWidth, 100), height: num(p.naturalHeight, 100) };
    if (obj.type === 'group') return { width: num(p.width, 40), height: num(p.height, 40) };
    if (obj.type === 'text') return { width: num(p.width, 80), height: num(p.height, num(p.fontSize, 4) * 1.2) };
    if (str(p.shape, '') === 'line') return { width: num(p.width, 40), height: num(p.strokeWidth, 1) };
    return { width: num(p.width, 40), height: num(p.height, 40) };
}

/** Scale props that give the object the requested on-sheet size. */
export function scaleForSize(obj: CanvasObject, size: { width?: number; height?: number }): Record<string, number> {
    const base = baseSize(obj);
    const out: Record<string, number> = {};
    if (size.width && base.width > 0) out.scaleX = Math.sign(num(obj.props.scaleX, 1) || 1) * (size.width / base.width);
    if (size.height && base.height > 0) out.scaleY = Math.sign(num(obj.props.scaleY, 1) || 1) * (size.height / base.height);
    return out;
}

/* ------------------------------------------------------------------ */
/* Factories used by the sidebar                                       */
/* ------------------------------------------------------------------ */

export type SheetFrame = { width: number; height: number };

export function makeText(preset: TextPreset, side: BoxSide, sheet: SheetFrame): CanvasObject {
    const t = TEXT_PRESETS[preset];
    return makeTextWith({ text: t.text, fontSizePt: t.fontSizePt, fontWeight: t.fontWeight }, side, sheet);
}

export type TextSpec = { text: string; fontSizePt: number; fontWeight?: string; fontFamily?: string; dy?: number };

/** A text object centred on the sheet (`dy` moves it down, mm). */
export function makeTextWith(spec: TextSpec, side: BoxSide, sheet: SheetFrame): CanvasObject {
    const t = { fontWeight: 'normal', fontFamily: 'Arial', dy: 0, ...spec };
    return {
        id: newObjectId(),
        type: 'text',
        side,
        props: {
            text: t.text,
            fontSize: t.fontSizePt * MM_PER_PT,
            fontWeight: t.fontWeight,
            fontFamily: t.fontFamily,
            fontStyle: 'normal',
            textAlign: 'center',
            fill: '#0f172a',
            width: Math.min(sheet.width * 0.5, Math.max(40, t.text.length * t.fontSizePt * MM_PER_PT * 0.6)),
            left: sheet.width / 2,
            top: sheet.height / 2 + t.dy,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
        },
    };
}

export function makeShape(kind: ShapeKind, side: BoxSide, sheet: SheetFrame): CanvasObject {
    const size = Math.max(20, Math.min(sheet.width, sheet.height) * 0.15);
    const isLine = kind === 'line';
    return {
        id: newObjectId(),
        type: 'shape',
        side,
        props: {
            shape: kind === 'rounded' ? 'rect' : kind,
            width: isLine ? size * 1.5 : size,
            height: isLine ? 0 : kind === 'triangle' ? size * 0.87 : size,
            rx: kind === 'rounded' ? size * 0.15 : 0,
            fill: isLine ? '' : '#6366f1',
            stroke: isLine ? '#0f172a' : '',
            strokeWidth: isLine ? 1 : 0,
            left: sheet.width / 2,
            top: sheet.height / 2,
            angle: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
        },
    };
}

export type UploadedImage = { id: number; url: string; width: number | null; height: number | null; name?: string | null };

/**
 * An uploaded image, placed in the middle of the sheet. Its natural size is taken as
 * 300 DPI (the print standard) and shrunk if that would not fit on the sheet.
 */
export function makeImage(asset: UploadedImage, natural: { width: number; height: number }, side: BoxSide, sheet: SheetFrame): CanvasObject {
    const mmPerPx = 25.4 / 300;
    const w = natural.width * mmPerPx;
    const h = natural.height * mmPerPx;
    const fit = Math.min(1, (sheet.width * 0.4) / w, (sheet.height * 0.4) / h);
    // Fabric images are sized in source pixels; scale converts them to mm.
    const scale = mmPerPx * fit;
    return {
        id: newObjectId(),
        type: 'image',
        side,
        props: {
            src: asset.url,
            assetId: asset.id,
            ...(asset.name ? { name: asset.name } : {}),
            naturalWidth: natural.width,
            naturalHeight: natural.height,
            left: sheet.width / 2,
            top: sheet.height / 2,
            angle: 0,
            scaleX: scale,
            scaleY: scale,
            opacity: 1,
        },
    };
}

/* ------------------------------------------------------------------ */
/* Group / ungroup                                                     */
/* ------------------------------------------------------------------ */

const r3 = (v: number) => Math.round(v * 1000) / 1000;

function decomposeProps(matrix: number[]): Record<string, number> {
    const d = util.qrDecompose(matrix as Parameters<typeof util.qrDecompose>[0]);
    return {
        left: r3(d.translateX),
        top: r3(d.translateY),
        angle: Math.round((((d.angle % 360) + 360) % 360) * 100) / 100,
        scaleX: Math.round(d.scaleX * 1e5) / 1e5,
        scaleY: Math.round(d.scaleY * 1e5) / 1e5,
    };
}

/**
 * Builds a group CanvasObject from Fabric objects that sit in one parent (a multi-selection).
 * `frame` is that parent: its transform becomes the group's, members keep their offsets to it.
 */
export function buildGroup(frame: FabricObject, members: BoundObject[], source: CanvasObject[], side: BoxSide): CanvasObject | null {
    const order = new Map(source.map((o, i) => [o.id, i]));
    const children = members
        .filter((m) => m.objectId && order.has(m.objectId))
        .sort((a, b) => order.get(a.objectId!)! - order.get(b.objectId!)!)
        .map((m) => {
            const src = source[order.get(m.objectId!)!];
            return { ...src, locked: false, props: { ...src.props, ...decomposeProps(m.calcOwnMatrix()) } };
        });
    if (children.length < 2) return null;
    return {
        id: newObjectId(),
        type: 'group',
        side,
        props: { ...readTransform(frame), opacity: 1, width: r3(frame.width), height: r3(frame.height), children },
    };
}

/** The group's children with absolute transforms (and the group's opacity folded in). */
export function explodeGroup(group: Group, obj: CanvasObject): CanvasObject[] {
    const fabricChildren = group.getObjects();
    const groupOpacity = num(obj.props.opacity, 1);
    return groupChildren(obj).map((child, i) => {
        const fc = fabricChildren[i];
        const transform = fc ? decomposeProps(fc.calcTransformMatrix()) : {};
        return { ...child, props: { ...child.props, ...transform, opacity: r3(num(child.props.opacity, 1) * groupOpacity) } };
    });
}

/** Print standard; below this an image is flagged in the toolbar (plan: "image DPI warning"). */
export const MIN_PRINT_DPI = 300;
/** Critical print resolution threshold below which raster images look visibly pixelated. */
export const LOW_PRINT_DPI = 150;

/** Effective print resolution of an image at its current size on the sheet (worst axis). */
export function imageDpi(obj: CanvasObject): number | null {
    if (obj.type !== 'image') return null;
    const naturalWidth = num(obj.props.naturalWidth, 0);
    const naturalHeight = num(obj.props.naturalHeight, 0);
    const size = objectSize(obj);
    if (!naturalWidth || !size.width) return null;
    const dpiX = naturalWidth / (size.width / 25.4);
    const dpiY = naturalHeight && size.height ? naturalHeight / (size.height / 25.4) : dpiX;
    return Math.round(Math.min(dpiX, dpiY));
}

/** All raster images on a surface whose effective DPI is below `MIN_PRINT_DPI`. */
export function lowDpiImages(objects: CanvasObject[]): { object: CanvasObject; dpi: number }[] {
    const warnings: { object: CanvasObject; dpi: number }[] = [];
    for (const obj of objects) {
        const dpi = imageDpi(obj);
        if (dpi !== null && dpi < MIN_PRINT_DPI) {
            warnings.push({ object: obj, dpi });
        }
    }
    return warnings;
}

export function makeQr(
    spec: { src: string; value: string; ecc: string; color: string; background: string },
    side: BoxSide,
    sheet: SheetFrame,
): CanvasObject {
    const targetMm = Math.max(18, Math.min(35, Math.min(sheet.width, sheet.height) * 0.2));
    const scale = targetMm / 512;
    return {
        id: newObjectId(),
        type: 'qr',
        side,
        props: {
            src: spec.src,
            value: spec.value,
            ecc: spec.ecc,
            color: spec.color,
            background: spec.background,
            naturalWidth: 512,
            naturalHeight: 512,
            left: sheet.width / 2,
            top: sheet.height / 2,
            angle: 0,
            scaleX: scale,
            scaleY: scale,
            opacity: 1,
        },
    };
}

export function makeBarcode(
    spec: { src: string; format: string; value: string; width: number; height: number; color: string; background: string; displayValue: boolean },
    side: BoxSide,
    sheet: SheetFrame,
): CanvasObject {
    const targetWidthMm = Math.max(25, Math.min(55, sheet.width * 0.3));
    const scale = targetWidthMm / Math.max(1, spec.width);
    return {
        id: newObjectId(),
        type: 'barcode',
        side,
        props: {
            src: spec.src,
            format: spec.format,
            value: spec.value,
            color: spec.color,
            background: spec.background,
            displayValue: spec.displayValue,
            naturalWidth: spec.width,
            naturalHeight: spec.height,
            left: sheet.width / 2,
            top: sheet.height / 2,
            angle: 0,
            scaleX: scale,
            scaleY: scale,
            opacity: 1,
        },
    };
}
