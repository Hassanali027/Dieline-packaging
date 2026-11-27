import { generateDieline, InvalidParamsError, isStyleSupported, UnsupportedStyleError } from '@/lib/dieline';
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
    }, [params]);
}
