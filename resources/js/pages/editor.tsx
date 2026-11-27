import BottomToolbar from '@/components/editor/BottomToolbar';
import BoxSettings from '@/components/editor/BoxSettings';
import DielineCanvas, { type CanvasController } from '@/components/editor/DielineCanvas';
import EditorSidebar from '@/components/editor/EditorSidebar';
import RightPanel from '@/components/editor/RightPanel';
import type { ProductItem } from '@/components/editor/types';
import { useDieline } from '@/hooks/use-dieline';
import { useEditorStore } from '@/store/useEditorStore';
import { Head } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';

interface EditorPageProps {
    products: ProductItem[];
    activeProduct: ProductItem | null;
}

export default function EditorPage({ products, activeProduct }: EditorPageProps) {
    const setSource = useEditorStore((s) => s.setSource);
    const activeSide = useEditorStore((s) => s.activeSide);
    const material = useEditorStore((s) => s.design.material);
    const faceColors = useEditorStore((s) => s.design.faceColors);
    const selectedPanelId = useEditorStore((s) => s.selectedPanelId);
    const setSelectedPanelId = useEditorStore((s) => s.setSelectedPanelId);

    const { params, result, errors, supported } = useDieline();
    const controller = useRef<CanvasController>(null);
    const [zoom, setZoom] = useState(1);

    const pickProduct = (product: ProductItem) => {
        setSelectedPanelId(null);
        setSource({ kind: 'parametric', params: product.default_params });
    };

    // Load the product from the URL (/editor/{slug}) and start a fresh history for it.
    useEffect(() => {
        if (activeProduct?.default_params) {
            setSource({ kind: 'parametric', params: activeProduct.default_params });
            useEditorStore.temporal.getState().clear();
        }
    }, [activeProduct, setSource]);

    // Ctrl/Cmd + Z / Y (Shift+Z) for undo / redo, ignored while typing in a field.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (document.activeElement?.tagName ?? '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            if (!(e.ctrlKey || e.metaKey)) return;
            const key = e.key.toLowerCase();
            const { undo, redo } = useEditorStore.temporal.getState();
            if (key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // When the dieline cannot be built, keep the canvas showing the last good one.
    const canvasNotice = !supported && params ? `The ${params.style} dieline is coming in a later sprint.` : null;

    return (
        <>
            <Head title={activeProduct ? `${activeProduct.name} — Dieline Editor` : 'Dieline Editor'} />
            <div className="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-900">
                <EditorSidebar boxPanel={<BoxSettings products={products} params={params} errors={errors} onPickProduct={pickProduct} />} />

                <main className="relative flex min-w-0 flex-1 flex-col">
                    <div className="relative flex-1">
                        <DielineCanvas
                            result={result}
                            side={activeSide}
                            material={material}
                            faceColors={faceColors}
                            selectedPanelId={selectedPanelId}
                            onSelectPanel={setSelectedPanelId}
                            onZoomChange={setZoom}
                            controllerRef={controller}
                        />
                        <div className="pointer-events-none absolute top-3 left-3 rounded-md bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 capitalize shadow-xs">
                            {activeSide} view
                        </div>
                        {canvasNotice && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80">
                                <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-center text-sm text-slate-600 shadow-sm">
                                    {canvasNotice}
                                    <div className="mt-1 text-xs text-slate-400">Pick the Mailer Box to try the engine.</div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                        <BottomToolbar controller={controller} zoom={zoom} />
                    </div>
                </main>

                <RightPanel result={result} params={params} />
            </div>
        </>
    );
}
