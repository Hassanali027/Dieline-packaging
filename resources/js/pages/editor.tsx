import { ElementsPanel, TextPanel, UploadsPanel } from '@/components/editor/AddPanels';
import BottomToolbar from '@/components/editor/BottomToolbar';
import BoxSettings from '@/components/editor/BoxSettings';
import DielineCanvas, { type CanvasController } from '@/components/editor/DielineCanvas';
import EditorSidebar from '@/components/editor/EditorSidebar';
import RightPanel from '@/components/editor/RightPanel';
import SaveControls, { clearDraft, DraftBanner, draftHasWork, readDraft, type Draft } from '@/components/editor/SaveControls';
import SelectionToolbar from '@/components/editor/SelectionToolbar';
import ShareDialog from '@/components/editor/ShareDialog';
import type { ProductItem } from '@/components/editor/types';
import { useDieline } from '@/hooks/use-dieline';
import { useSheetTextures, type SheetSurface } from '@/hooks/use-sheet-textures';
import type { SavedDesign } from '@/lib/api';
import { extractPart } from '@/lib/dieline';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/useEditorStore';
import type { Design, DesignPartKey, DielineResult } from '@/types/design';
import { Head } from '@inertiajs/react';
import { useEffect, useMemo, useRef, useState } from 'react';

const PART_LABELS: Record<string, string> = { lid: 'Lid', base: 'Base', liner: 'Liner', drawer: 'Drawer', sleeve: 'Sleeve', tray: 'Tray' };

interface EditorPageProps {
    products: ProductItem[];
    activeProduct: ProductItem | null;
    /** Set when the URL has ?design={id} and the visitor owns it (EditorController). */
    savedDesign: SavedDesign | null;
    /** Set on /s/{token}: a shared design, opened read-only. */
    sharedDesign: { token: string; data: Design; expires_at: string } | null;
}

export default function EditorPage({ products, activeProduct, savedDesign, sharedDesign }: EditorPageProps) {
    // Shared links open read-only until the visitor chooses "Edit a copy".
    const [readOnly, setReadOnly] = useState(!!sharedDesign);
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
    const activePart = useEditorStore((s) => s.activePart);
    const setActivePart = useEditorStore((s) => s.setActivePart);
    const designParts = useEditorStore((s) => s.design.parts);

    // Rigid boxes: one dieline per part (lid / base / liner), each starting at (0, 0).
    const parts = useMemo(() => (result?.parts ?? []) as DesignPartKey[], [result]);
    const partResults = useMemo(() => {
        const map: Partial<Record<DesignPartKey, DielineResult>> = {};
        if (result) for (const p of parts) map[p] = extractPart(result, p);
        return map;
    }, [result, parts]);
    const sheetResult = (activePart && partResults[activePart]) || result;

    // Keep the part tab valid when the style changes (folding styles have no parts).
    useEffect(() => {
        if (!parts.length) {
            if (activePart) setActivePart(null);
        } else if (!activePart || !parts.includes(activePart)) {
            setActivePart(parts[0]);
        }
    }, [parts, activePart, setActivePart]);

    const surfaces = useMemo<SheetSurface[]>(() => {
        if (!result) return [];
        if (!parts.length) return [{ key: 'main', result, outside: outsideObjects, inside: insideObjects }];
        return parts.map((p) => ({
            key: p,
            result: partResults[p]!,
            outside: designParts?.[p]?.outside ?? [],
            inside: designParts?.[p]?.inside ?? [],
        }));
    }, [result, parts, partResults, outsideObjects, insideObjects, designParts]);
    const textures = useSheetTextures(surfaces, faceColors, material);
    const sheet = sheetResult ? sheetResult.overallSize : null;
    // Read the local draft once, before the autosave can overwrite it.
    const [draftOffer, setDraftOffer] = useState<Draft | null>(() => {
        if (savedDesign || sharedDesign || typeof window === 'undefined') return null;
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
        if (sharedDesign) {
            useEditorStore.getState().loadDesign(sharedDesign.data, { id: null, name: 'Shared design', baseline: null });
            return;
        }
        if (activeProduct?.default_params) {
            setSource({ kind: 'parametric', params: activeProduct.default_params });
            useEditorStore.temporal.getState().clear();
        }
    }, [activeProduct, savedDesign, sharedDesign, setSource]);

    /** Turns the shared view into the visitor's own unsaved copy (saving creates a new design). */
    const editCopy = () => {
        setReadOnly(false);
        useEditorStore.getState().setDesignMeta({ id: null, name: 'Copy of shared design', baseline: null });
        window.history.replaceState(window.history.state, '', `/editor/${activeProduct?.slug ?? ''}`);
    };

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
                <div className={cn('flex h-full', readOnly && 'pointer-events-none opacity-50')} aria-disabled={readOnly}>
                    <EditorSidebar
                        panels={{
                            box: <BoxSettings products={products} params={params} errors={errors} onPickProduct={pickProduct} />,
                            uploads: <UploadsPanel sheet={sheet} />,
                            elements: <ElementsPanel sheet={sheet} />,
                            text: <TextPanel sheet={sheet} />,
                        }}
                    />
                </div>

                <main className="relative flex min-w-0 flex-1 flex-col">
                    <div className="relative flex-1">
                        <DielineCanvas
                            result={sheetResult}
                            side={activeSide}
                            material={material}
                            faceColors={faceColors}
                            selectedPanelId={selectedPanelId}
                            onSelectPanel={setSelectedPanelId}
                            onZoomChange={setZoom}
                            controllerRef={controller}
                        />
                        {/* One top bar: view + part tabs on the left, saving on the right; wraps on narrow screens. */}
                        <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-wrap items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="rounded-md bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 capitalize shadow-xs">
                                    {activeSide} view
                                </span>
                                {parts.length > 0 && (
                                    <div
                                        className="pointer-events-auto flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-xs"
                                        role="tablist"
                                        aria-label="Box part"
                                    >
                                        {parts.map((p) => (
                                            <button
                                                key={p}
                                                type="button"
                                                role="tab"
                                                aria-selected={activePart === p}
                                                onClick={() => setActivePart(p)}
                                                className={cn(
                                                    'rounded-md px-3 py-1 text-xs font-medium',
                                                    activePart === p ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                                                )}
                                            >
                                                {PART_LABELS[p] ?? p}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="ml-auto flex flex-col items-end gap-2">
                                {readOnly ? (
                                    <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-900 shadow-xs">
                                        Shared design · view only
                                        <button
                                            type="button"
                                            onClick={editCopy}
                                            className="rounded bg-indigo-600 px-2 py-1 font-medium text-white hover:bg-indigo-700"
                                        >
                                            Edit a copy
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-start gap-2">
                                        <ShareDialog />
                                        <SaveControls defaultName={`${activeProduct?.name ?? 'Box'} design`} autosave={!draftOffer} />
                                    </div>
                                )}
                                {draftOffer && <DraftBanner draft={draftOffer} onRestore={restoreDraft} onDiscard={discardDraft} />}
                            </div>
                        </div>
                        {readOnly && <div className="absolute inset-0 z-10" aria-hidden onPointerDown={(e) => e.stopPropagation()} />}
                        {canvasNotice && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80">
                                <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-center text-sm text-slate-600 shadow-sm">
                                    {canvasNotice}
                                    <div className="mt-1 text-xs text-slate-400">
                                        Folding styles (Mailer, Tuck, Burger, Tray, Sleeve) and Rigid Lid & Base work today.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-2">
                        {!readOnly && <SelectionToolbar controller={controller} />}
                        <BottomToolbar controller={controller} zoom={zoom} />
                    </div>
                </main>

                <RightPanel result={result} sheetResult={sheetResult} params={params} textures={textures} />
            </div>
        </>
    );
}
