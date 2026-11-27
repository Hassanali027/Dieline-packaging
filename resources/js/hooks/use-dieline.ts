import { BLEED_MM, bounds, generateDieline, InvalidParamsError, isStyleSupported, rect, UnsupportedStyleError } from '@/lib/dieline';
import { useEditorStore } from '@/store/useEditorStore';
import type { BoxParams, DielineResult } from '@/types/design';
import { useMemo } from 'react';

export type DielineState = {
    params: BoxParams | null;
    result: DielineResult | null;
    /** Validation problems or "style not ready yet"; empty when the dieline was generated. */
    errors: string[];
    supported: boolean;
};

function rectPath(x: number, y: number, w: number, h: number): string {
    return `M${x},${y}L${x + w},${y}L${x + w},${y + h}L${x},${y + h}Z`;
}

/** Generates the dieline for the current design source (memoised on the source). */
export function useDieline(): DielineState {
    const source = useEditorStore((s) => s.design.source);

    return useMemo(() => {
        if (source.kind === 'uploaded-dieline') {
            const allPts = source.panels.flatMap((p) => p.polygon);
            const b = allPts.length ? bounds([allPts]) : { minX: 0, minY: 0, maxX: 200, maxY: 150 };
            const width = Math.max(20, b.maxX - b.minX);
            const height = Math.max(20, b.maxY - b.minY);
            const panels = source.panels.length
                ? source.panels
                : [{ id: 'uploaded-sheet', name: 'Custom dieline', polygon: rect(0, 0, width, height), foldAngle: 0, side: 'outside' as const }];
            const lines = source.lines ?? [];
            const cutPath = lines
                .filter((l) => l.tag === 'cut')
                .map((l) => l.path)
                .join(' ');
            const creasePaths = lines.filter((l) => l.tag === 'fold').map((l) => l.path);
            const result: DielineResult = {
                panels,
                cutPath,
                creasePaths,
                bleedPath: rectPath(-BLEED_MM, -BLEED_MM, width + BLEED_MM * 2, height + BLEED_MM * 2),
                safePath: rectPath(3, 3, Math.max(10, width - 6), Math.max(10, height - 6)),
                overallSize: { width, height },
            };
            return { params: null, result, errors: [], supported: true };
        }

        const params = source.kind === 'parametric' ? source.params : null;
        if (!params) {
            return { params: null, result: null, errors: [], supported: false };
        }
        if (!isStyleSupported(params.style)) {
            return { params, result: null, errors: [], supported: false };
        }
        try {
            return { params, result: generateDieline(params), errors: [], supported: true };
        } catch (error) {
            if (error instanceof InvalidParamsError) {
                return { params, result: null, errors: error.errors, supported: true };
            }
            if (error instanceof UnsupportedStyleError) {
                return { params, result: null, errors: [], supported: false };
            }
            throw error;
        }
    }, [source]);
}
