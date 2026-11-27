import { ElementsPanel, TextPanel, UploadsPanel } from '@/components/editor/AddPanels';
import BoxSettings from '@/components/editor/BoxSettings';
import DielineCanvas, { type CanvasController } from '@/components/editor/DielineCanvas';
import EditorHeader from '@/components/editor/EditorHeader';
import EditorSidebar from '@/components/editor/EditorSidebar';
import RightPanel from '@/components/editor/RightPanel';
import { clearDraft, DraftBanner, draftHasWork, readDraft, type Draft } from '@/components/editor/SaveControls';
import SelectionToolbar from '@/components/editor/SelectionToolbar';
import type { ProductItem } from '@/components/editor/types';
import ZoomControls from '@/components/editor/ZoomControls';
import { useDieline } from '@/hooks/use-dieline';
import { useSheetTextures, type SheetSurface } from '@/hooks/use-sheet-textures';
import type { SavedDesign } from '@/lib/api';
import { extractPart } from '@/lib/dieline';
import { replacePath, replaceUrl } from '@/lib/url';
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
    const setActiveSide = useEditorStore((s) => s.setActiveSide);
    const material = useEditorStore((s) => s.design.material);
    const source = useEditorStore((s) => s.design.source);
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

    // The box being designed right now. The URL's product is only the starting point: picking
    // another style, opening a saved design or restoring a draft can change it.
    const currentProduct = products.find((p) => p.style === params?.style) ?? activeProduct;
    const editorTitle = source.kind === 'uploaded-dieline' ? source.fileId : currentProduct?.name ?? 'Box';
    const defaultDesignName = source.kind === 'uploaded-dieline'
        ? `${source.fileId.replace(/\.svg$/i, '')} design`
        : `${currentProduct?.name ?? 'Box'} design`;

    const pickProduct = (product: ProductItem) => {
        setSelectedPanelId(null);
        setSource({ kind: 'parametric', params: product.default_params });
        // Keep the address in step (a reload reopens this style); ?design= stays as it is.
        replacePath(`/editor/${product.slug}`);
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
        replaceUrl(`/editor/${currentProduct?.slug ?? ''}`);
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
            <Head title={`${editorTitle} — Dieline Editor`} />
            <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
                <EditorHeader
                    productName={editorTitle}
                    defaultName={defaultDesignName}
                    autosave={!draftOffer}
                    readOnly={readOnly}
                    onEditCopy={editCopy}
                />

                <div className="flex min-h-0 flex-1">
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

                    <main className="editor-grid @container relative min-w-0 flex-1 overflow-hidden">
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

                        {/* Canvas overlay: which sheet is shown (side, part) on the left, draft notice on the right. */}
                        <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex flex-wrap items-start justify-between gap-2">
                            <div className="editor-glass pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-2xl border border-white/60 p-1 shadow-lg ring-1 shadow-slate-900/10 ring-slate-900/5">
                                <Segmented
                                    label="Printed side"
                                    value={activeSide}
                                    options={[
                                        { value: 'outside', label: 'Outside' },
                                        { value: 'inside', label: 'Inside' },
                                    ]}
                                    onChange={(v) => setActiveSide(v as typeof activeSide)}
                                />
                                {parts.length > 0 && (
                                    <>
                                        <div className="mx-1 h-6 w-px bg-slate-200" />
                                        <Segmented
                                            label="Box part"
                                            value={activePart ?? ''}
                                            options={parts.map((p) => ({ value: p, label: PART_LABELS[p] ?? p }))}
                                            onChange={(v) => setActivePart(v as DesignPartKey)}
                                        />
                                    </>
                                )}
                            </div>
                            {draftOffer && <DraftBanner draft={draftOffer} onRestore={restoreDraft} onDiscard={discardDraft} />}
                        </div>

                        {readOnly && <div className="absolute inset-0 z-10" aria-hidden onPointerDown={(e) => e.stopPropagation()} />}
                        {canvasNotice && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/70 backdrop-blur-[2px]">
                                <div className="max-w-sm rounded-3xl border border-slate-200 bg-white px-7 py-6 text-center shadow-xl shadow-slate-900/5">
                                    <div className="text-sm font-semibold text-slate-900">{canvasNotice}</div>
                                    <div className="mt-1.5 text-xs leading-relaxed text-slate-500">
                                        Folding styles (Mailer, Tuck, Burger, Tray, Sleeve) and Rigid Lid & Base work today.
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="pointer-events-none absolute inset-x-4 bottom-[4.5rem] z-20 flex justify-center">
                            {!readOnly && <SelectionToolbar controller={controller} />}
                        </div>
                        <div className="pointer-events-none absolute right-4 bottom-5 z-20">
                            <ZoomControls controller={controller} zoom={zoom} />
                        </div>
                        <div className="pointer-events-none absolute bottom-6 left-4 z-10 hidden text-[11px] text-slate-400 xl:block">
                            Scroll to zoom · Space + drag to pan
                        </div>
                    </main>

                    <RightPanel result={result} sheetResult={sheetResult} params={params} textures={textures} />
                </div>
            </div>
        </>
    );
}

/** Pill-style segmented control used on the canvas overlay. */
function Segmented({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
}) {
    return (
        <div role="tablist" aria-label={label} className="flex gap-0.5">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="tab"
                    aria-selected={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        'rounded-xl px-3.5 py-1.5 text-xs font-semibold transition',
                        value === o.value ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-900/5 hover:text-slate-900',
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
