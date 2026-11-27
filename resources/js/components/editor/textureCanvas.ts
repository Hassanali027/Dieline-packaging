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
        /** Checked before the result is copied in, so a slow, outdated render cannot overwrite a newer one. */
        isCurrent?: () => boolean;
    },
): Promise<void> {
    const { result, objects, faceColors, baseColor, side } = opts;
    const { width: W, height: H } = result.overallSize;
    const scale = Math.min(MAX_PX_PER_MM, (opts.maxPx ?? MAX_TEXTURE_PX) / Math.max(W, H, 1));
    const pxW = Math.max(1, Math.round(W * scale));
    const pxH = Math.max(1, Math.round(H * scale));

    // Fabric owns the element it renders into, so draw into a scratch canvas and copy.
    const scratch = document.createElement('canvas');
    const sc = new StaticCanvas(scratch, {
        width: pxW,
        height: pxH,
        enableRetinaScaling: false,
        renderOnAddRemove: false,
        backgroundColor: baseColor,
    });
    sc.setViewportTransform([scale, 0, 0, scale, 0, 0]);

    for (const panel of result.panels) {
        const color = faceColors[panel.id];
        if (!color) continue;
        const polygon = side === 'inside' ? mirrorPolygonX(panel.polygon, W) : panel.polygon;
        // A hair of stroke in the same colour hides seams between neighbouring panels.
        sc.add(new Polygon(polygon, { fill: color, stroke: color, strokeWidth: 0.4, objectCaching: false }));
    }

    const created = await Promise.all(objects.map((o) => createFabricObject(o)));
    for (const fo of created) if (fo) sc.add(fo);
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
