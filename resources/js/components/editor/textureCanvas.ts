import { mirrorPolygonX } from '@/lib/dieline';
import type { BoxSide } from '@/store/useEditorStore';
import type { CanvasObject, DielineResult } from '@/types/design';
import { Polygon, StaticCanvas } from 'fabric';
import { createFabricObject } from './objects';

/** Texture limits from the plan: max 4096 px, and no more detail than the preview needs. */
export const MAX_TEXTURE_PX = 4096;
export const MAX_PX_PER_MM = 6;

/**
 * Draws one printed side of the sheet (panel colours + the customer's objects, no dieline
 * lines) into `target`, in dieline space: pixel (x, y) = dieline mm × scale. The inside is
 * drawn mirrored, exactly as the editor shows it; the 3D view flips it back.
 *
 * This is the getTextureCanvas(side) contract between the 2D editor and the 3D preview.
 */
export async function renderSheetTexture(
    target: HTMLCanvasElement,
    opts: {
        result: DielineResult;
        objects: CanvasObject[];
        faceColors: Record<string, string>;
        baseColor: string;
        side: BoxSide;
        maxPx?: number;
        /** Exact resolution instead of the preview limits (print export: 300 DPI ≈ 11.8 px/mm). */
        pxPerMm?: number;
        /** Extra sheet drawn on every side, in mm (print export: the bleed). */
        margin?: number;
        /** Checked before the result is copied in, so a slow, outdated render cannot overwrite a newer one. */
        isCurrent?: () => boolean;
    },
): Promise<void> {
    const { result, objects, faceColors, baseColor, side } = opts;
    const { width: W, height: H } = result.overallSize;
    const margin = opts.margin ?? 0;
    const scale = opts.pxPerMm ?? Math.min(MAX_PX_PER_MM, (opts.maxPx ?? MAX_TEXTURE_PX) / Math.max(W, H, 1));
    const pxW = Math.max(1, Math.round((W + 2 * margin) * scale));
    const pxH = Math.max(1, Math.round((H + 2 * margin) * scale));

    // Fabric owns the element it renders into, so draw into a scratch canvas and copy.
    const scratch = document.createElement('canvas');
    const sc = new StaticCanvas(scratch, {
        width: pxW,
        height: pxH,
        enableRetinaScaling: false,
        renderOnAddRemove: false,
        backgroundColor: baseColor,
    });
    sc.setViewportTransform([scale, 0, 0, scale, margin * scale, margin * scale]);

    for (const panel of result.panels) {
        const color = faceColors[panel.id];
        if (!color) continue;
        const polygon = side === 'inside' ? mirrorPolygonX(panel.polygon, W) : panel.polygon;
        // A hair of stroke in the same colour hides seams between neighbouring panels.
        sc.add(new Polygon(polygon, { fill: color, stroke: color, strokeWidth: 0.4, objectCaching: false }));
    }

    const created = await Promise.all(objects.map((o) => createFabricObject(o)));
    // The emboss / deboss shadow is an on-screen hint only; the 3D relief comes from renderSheetRelief.
    for (const fo of created) if (fo) sc.add(fo.set({ shadow: null }));
    sc.renderAll();
    if (opts.isCurrent && !opts.isCurrent()) {
        await sc.dispose();
        return;
    }

    if (target.width !== pxW) target.width = pxW;
    if (target.height !== pxH) target.height = pxH;
    const ctx = target.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, pxW, pxH);
        ctx.drawImage(sc.getElement(), 0, 0);
    }
    await sc.dispose();
}

/** Objects on a surface that are embossed or debossed. */
export function reliefObjects(objects: CanvasObject[]): CanvasObject[] {
    return objects.filter((o) => o.effect === 'emboss' || o.effect === 'deboss');
}

/**
 * Height map of the sheet for the 3D view (used as a bump map, outside only): mid grey is the
 * flat board, embossed artwork is lighter (raised), debossed artwork darker (pressed in).
 * Same pixel layout as renderSheetTexture, and softened a little so edges look pressed.
 */
export async function renderSheetRelief(
    target: HTMLCanvasElement,
    opts: { result: DielineResult; objects: CanvasObject[]; maxPx?: number; isCurrent?: () => boolean },
): Promise<void> {
    const { width: W, height: H } = opts.result.overallSize;
    const scale = Math.min(MAX_PX_PER_MM, (opts.maxPx ?? MAX_TEXTURE_PX) / Math.max(W, H, 1));
    const pxW = Math.max(1, Math.round(W * scale));
    const pxH = Math.max(1, Math.round(H * scale));

    const height = document.createElement('canvas');
    height.width = pxW;
    height.height = pxH;
    const hctx = height.getContext('2d');
    if (!hctx) return;
    hctx.fillStyle = '#808080';
    hctx.fillRect(0, 0, pxW, pxH);

    for (const obj of reliefObjects(opts.objects)) {
        // Draw the object alone, then turn its silhouette white (emboss) or black (deboss).
        const layer = document.createElement('canvas');
        layer.width = pxW;
        layer.height = pxH;
        const sc = new StaticCanvas(layer, { width: pxW, height: pxH, enableRetinaScaling: false, renderOnAddRemove: false });
        sc.setViewportTransform([scale, 0, 0, scale, 0, 0]);
        const fo = await createFabricObject({ ...obj, effect: 'none', props: { ...obj.props, opacity: 1 } });
        if (fo) sc.add(fo);
        sc.renderAll();
        const lctx = sc.getElement().getContext('2d');
        if (lctx) {
            lctx.globalCompositeOperation = 'source-in';
            lctx.fillStyle = obj.effect === 'emboss' ? '#ffffff' : '#000000';
            lctx.fillRect(0, 0, pxW, pxH);
        }
        hctx.save();
        hctx.filter = `blur(${Math.max(1, Math.round(scale * 0.35))}px)`;
        hctx.drawImage(sc.getElement(), 0, 0);
        hctx.restore();
        await sc.dispose();
    }

    if (opts.isCurrent && !opts.isCurrent()) return;
    if (target.width !== pxW) target.width = pxW;
    if (target.height !== pxH) target.height = pxH;
    const ctx = target.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, pxW, pxH);
        ctx.drawImage(height, 0, 0);
    }
}
