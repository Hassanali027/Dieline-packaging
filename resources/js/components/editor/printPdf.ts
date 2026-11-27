import { extractPart } from '@/lib/dieline';
import { materialColor } from '@/lib/three/materials';
import { surfaceObjects } from '@/store/useEditorStore';
import type { BoxParams, Design, DesignPartKey, DielineResult } from '@/types/design';
import { renderSheetTexture } from './textureCanvas';

/** Print resolution: 300 DPI. */
const PRINT_PX_PER_MM = 300 / 25.4;
/** Browsers refuse very large canvases; big sheets drop below 300 DPI rather than fail. */
const MAX_PRINT_PX = 9000;

const PART_NAMES: Record<string, string> = { lid: 'Lid', base: 'Base', liner: 'Liner', drawer: 'Drawer', sleeve: 'Sleeve', tray: 'Tray' };

/**
 * "Download print PDF": renders every printed sheet at 300 DPI (outside always; inside only
 * when it has artwork) and builds the PDF with lib/export/pdf.ts. pdf-lib is loaded only
 * when someone asks for a PDF, so it never weighs on the editor.
 */
export async function exportPrintPdf(result: DielineResult, design: Design, params: BoxParams | null, title: string): Promise<void> {
    const { buildPrintPdf, downloadPdf, ARTWORK_MARGIN_MM } = await import('@/lib/export/pdf');
    const parts = (result.parts ?? []) as DesignPartKey[];
    const surfaces = parts.length ? parts.map((part) => ({ part, result: extractPart(result, part) })) : [{ part: null, result }];

    const sheets = [];
    for (const surface of surfaces) {
        for (const side of ['outside', 'inside'] as const) {
            const objects = surfaceObjects(design, surface.part, side);
            const hasColours = surface.result.panels.some((p) => design.faceColors[p.id]);
            if (side === 'inside' && !objects.length && !hasColours) continue;

            const { width: W, height: H } = surface.result.overallSize;
            const pxPerMm = Math.min(PRINT_PX_PER_MM, MAX_PRINT_PX / (Math.max(W, H) + 2 * ARTWORK_MARGIN_MM));
            const artwork = document.createElement('canvas');
            await renderSheetTexture(artwork, {
                result: surface.result,
                objects,
                faceColors: design.faceColors,
                baseColor: materialColor(design.material, side),
                side,
                pxPerMm,
                margin: ARTWORK_MARGIN_MM,
            });
            const partName = surface.part ? `${PART_NAMES[surface.part] ?? surface.part} ` : '';
            sheets.push({
                name: `${partName}${side}`.replace(/^./, (c) => c.toUpperCase()),
                result: surface.result,
                artwork,
                mirrored: side === 'inside',
            });
        }
    }

    const bytes = await buildPrintPdf(sheets, { title, params });
    const slug = (params?.style ?? 'dieline').replace(/[^a-z0-9-]+/gi, '-');
    const size = params ? `-${params.length}x${params.width}x${params.depth}${params.unit}` : '';
    downloadPdf(`${slug}${size}-print.pdf`, bytes);
}
