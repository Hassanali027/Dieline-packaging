import { renderSheetTexture } from '@/components/editor/textureCanvas';
import { materialColor } from '@/lib/three/materials';
import type { CanvasObject, DielineResult } from '@/types/design';
import { useEffect, useRef, useState } from 'react';

export type SheetTextures = { outside: HTMLCanvasElement | null; inside: HTMLCanvasElement | null; version: number };

/** Redraws the outside/inside texture canvases a moment after the design stops changing. */
const DEBOUNCE_MS = 250;

export function useSheetTextures(
    result: DielineResult | null,
    outside: CanvasObject[],
    inside: CanvasObject[],
    faceColors: Record<string, string>,
    material: string,
): SheetTextures {
    const canvases = useRef<{ outside: HTMLCanvasElement; inside: HTMLCanvasElement } | null>(null);
    const [version, setVersion] = useState(0);
    const run = useRef(0);

    useEffect(() => {
        if (!result) return;
        if (!canvases.current) {
            canvases.current = { outside: document.createElement('canvas'), inside: document.createElement('canvas') };
        }
        const targets = canvases.current;
        const id = ++run.current;
        const isCurrent = () => id === run.current;
        const timer = window.setTimeout(async () => {
            try {
                await Promise.all([
                    renderSheetTexture(targets.outside, {
                        result,
                        objects: outside,
                        faceColors,
                        baseColor: materialColor(material, 'outside'),
                        side: 'outside',
                        isCurrent,
                    }),
                    renderSheetTexture(targets.inside, {
                        result,
                        objects: inside,
                        faceColors,
                        baseColor: materialColor(material, 'inside'),
                        side: 'inside',
                        isCurrent,
                    }),
                ]);
                if (id === run.current) setVersion((v) => v + 1);
            } catch (error) {
                console.error('Texture render failed', error);
            }
        }, DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [result, outside, inside, faceColors, material]);

    return {
        outside: version > 0 ? (canvases.current?.outside ?? null) : null,
        inside: version > 0 ? (canvases.current?.inside ?? null) : null,
        version,
    };
}
