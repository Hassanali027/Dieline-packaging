import { buildDielineResult, generateDieline, InvalidParamsError, isStyleSupported, UnsupportedStyleError } from '@/lib/dieline';
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

/** Generates the dieline for the current design source (memoised on the params object). */
export function useDieline(): DielineState {
    const source = useEditorStore((s) => s.design.source);
    const params = source.kind === 'parametric' ? source.params : null;

    return useMemo(() => {
        if (!params) {
            if (source.kind === 'uploaded-dieline' && source.panels.length) {
                const result = buildDielineResult(source.panels);
                const cutLines = (source.lines ?? []).filter((line) => line.kind === 'cut');
                if (cutLines.length) {
                    const importedCuts = cutLines.map((line) => `M ${line.a.x} ${line.a.y} L ${line.b.x} ${line.b.y}`);
                    result.cutPath = [result.cutPath, ...importedCuts].filter(Boolean).join(' ');
                }
                return { params: null, result, errors: [], supported: true };
            }
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
    }, [params, source]);
}
