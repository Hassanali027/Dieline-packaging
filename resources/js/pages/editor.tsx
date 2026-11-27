import { ElementsPanel, TextPanel, UploadsPanel } from '@/components/editor/AddPanels';
import BottomToolbar from '@/components/editor/BottomToolbar';
import BoxSettings from '@/components/editor/BoxSettings';
import DielineCanvas, { type CanvasController } from '@/components/editor/DielineCanvas';
import EditorSidebar from '@/components/editor/EditorSidebar';
import RightPanel from '@/components/editor/RightPanel';
import SaveControls, { clearDraft, DraftBanner, draftHasWork, readDraft, type Draft } from '@/components/editor/SaveControls';
import SelectionToolbar from '@/components/editor/SelectionToolbar';
import type { ProductItem } from '@/components/editor/types';
import { useDieline } from '@/hooks/use-dieline';
import { useSheetTextures } from '@/hooks/use-sheet-textures';
import type { SavedDesign } from '@/lib/api';
import { useEditorStore } from '@/store/useEditorStore';
import { Head } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';

interface EditorPageProps {
    products: ProductItem[];
    activeProduct: ProductItem | null;
    /** Set when the URL has ?design={id} and the visitor owns it (EditorController). */
    savedDesign: SavedDesign | null;
}

export default function EditorPage({ products, activeProduct, savedDesign }: EditorPageProps) {
    const setSource = useEditorStore((s) => s.setSource);
    const activeSide = useEditorStore((s) => s.activeSide);
    const material = useEditorStore((s) => s.design.material);
    const faceColors = useEditorStore((s) => s.design.faceColors);
    const selectedPanelId = useEditorStore((s) => s.selectedPanelId);
    const setSelectedPanelId = useEditorStore((s) => s.setSelectedPanelId);
    const outsideObjects = useEditorStore((s) => s.design.outside);
    const insideObjects = useEditorStore((s) => s.design.inside);

    const { params, result, errors, supported } = useDieline();
    const controller = useRef<CanvasController>(null);
    const [zoom, setZoom] = useState(1);
    const textures = useSheetTextures(result, outsideObjects, insideObjects, faceColors, material);
    const sheet = result ? result.overallSize : null;
    // Read the local draft once, before the autosave can overwrite it.
    const [draftOffer, setDraftOffer] = useState<Draft | null>(() => {
        if (savedDesign || typeof window === 'undefined') return null;
        const draft = readDraft();
        return draft && draftHasWork(draft) ? draft : null;
    });

    const pickProduct = (product: ProductItem) => {
        setSelectedPanelId(null);
        setSource({ kind: 'parametric', params: product.default_params });
    };

    // Open the saved design from ?design=, otherwise the product from the URL (/editor/{slug}),
    // with a fresh undo history either way.
    useEffect(() => {
        if (savedDesign) {
            useEditorStore.getState().loadDesign(savedDesign.data, { id: savedDesign.id, name: savedDesign.name, baseline: savedDesign.data });
            return;
        }
        if (activeProduct?.default_params) {
            setSource({ kind: 'parametric', params: activeProduct.default_params });
            useEditorStore.temporal.getState().clear();
        }
    }, [activeProduct, savedDesign, setSource]);

    const restoreDraft = () => {
        if (!draftOffer) return;
        useEditorStore.getState().loadDesign(draftOffer.design, { id: draftOffer.designId, name: draftOffer.name, baseline: null });
        setDraftOffer(null);
    };
    const discardDraft = () => {
        clearDraft();
        setDraftOffer(null);
    };

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
                <EditorSidebar
                    panels={{
                        box: <BoxSettings products={products} params={params} errors={errors} onPickProduct={pickProduct} />,
                        uploads: <UploadsPanel sheet={sheet} />,
                        elements: <ElementsPanel sheet={sheet} />,
                        text: <TextPanel sheet={sheet} />,
                    }}
                />

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
                        <div className="pointer-events-none absolute top-3 right-3 flex flex-col items-end gap-2">
                            <SaveControls defaultName={`${activeProduct?.name ?? 'Box'} design`} autosave={!draftOffer} />
                            {draftOffer && <DraftBanner draft={draftOffer} onRestore={restoreDraft} onDiscard={discardDraft} />}
                        </div>
                        {canvasNotice && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80">
                                <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-center text-sm text-slate-600 shadow-sm">
                                    {canvasNotice}
                                    <div className="mt-1 text-xs text-slate-400">Folding styles (Mailer, Tuck, Burger, Tray, Sleeve) work today.</div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-2">
                        <SelectionToolbar controller={controller} />
                        <BottomToolbar controller={controller} zoom={zoom} />
                    </div>
                </main>

                <RightPanel result={result} params={params} textures={textures} />
            </div>
        </>
    );
}
