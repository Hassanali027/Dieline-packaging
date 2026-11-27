import { renderSheetTexture } from '@/components/editor/textureCanvas';
import { materialColor } from '@/lib/three/materials';
import type { CanvasObject, DielineResult } from '@/types/design';
import { useEffect, useRef, useState } from 'react';

/**
 * A printed sheet the 3D view textures: the whole folding box ('main'), or one part of a
 * rigid box ('lid', 'base', 'liner'). `result` is that sheet's own dieline.
 */
export type SheetSurface = { key: string; result: DielineResult; outside: CanvasObject[]; inside: CanvasObject[] };

export type SurfaceCanvases = { outside: HTMLCanvasElement | null; inside: HTMLCanvasElement | null };
export type SheetTextures = { surfaces: Record<string, SurfaceCanvases>; version: number };

/** Redraws the texture canvases a moment after the design stops changing. */
const DEBOUNCE_MS = 250;

export function useSheetTextures(surfaces: SheetSurface[], faceColors: Record<string, string>, material: string): SheetTextures {
    // Canvases are kept per surface key so the 3D textures can stay bound to them.
    const canvases = useRef(new Map<string, { outside: HTMLCanvasElement; inside: HTMLCanvasElement }>());
    const [version, setVersion] = useState(0);
    const [ready, setReady] = useState<string[]>([]);
    const run = useRef(0);

    useEffect(() => {
        if (!surfaces.length) return;
        const id = ++run.current;
        const isCurrent = () => id === run.current;
        const timer = window.setTimeout(async () => {
            try {
                await Promise.all(
                    surfaces.flatMap((s) => {
                        let target = canvases.current.get(s.key);
                        if (!target) {
                            target = { outside: document.createElement('canvas'), inside: document.createElement('canvas') };
                            canvases.current.set(s.key, target);
                        }
                        const common = { result: s.result, faceColors, isCurrent };
                        return [
                            renderSheetTexture(target.outside, {
                                ...common,
                                objects: s.outside,
                                baseColor: materialColor(material, 'outside'),
                                side: 'outside',
                            }),
                            renderSheetTexture(target.inside, {
                                ...common,
                                objects: s.inside,
                                baseColor: materialColor(material, 'inside'),
                                side: 'inside',
                            }),
                        ];
                    }),
                );
                if (isCurrent()) {
                    setReady(surfaces.map((s) => s.key));
                    setVersion((v) => v + 1);
                }
            } catch (error) {
                console.error('Texture render failed', error);
            }
        }, DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [surfaces, faceColors, material]);

    const out: Record<string, SurfaceCanvases> = {};
    for (const key of ready) {
        const c = canvases.current.get(key);
        if (c) out[key] = c;
    }
    return { surfaces: out, version };
}
