import FoldMappingPanel from '@/components/preview3d/FoldMappingPanel';
import type { SheetTextures } from '@/hooks/use-sheet-textures';
import { toMm } from '@/lib/dieline';
import { downloadText } from '@/lib/export/download';
import { dielineFileName, dielineToSvg } from '@/lib/export/svg';
import { materialColor } from '@/lib/three/materials';
import { cn } from '@/lib/utils';
import { surfaceObjects, useEditorStore, type CameraPreset } from '@/store/useEditorStore';
import type { BoxParams, DielineResult } from '@/types/design';
<<<<<<< HEAD
import { Box, Download, Eye, Layers, MousePointerClick, Ruler, Scissors, Sparkles } from 'lucide-react';
=======
import { AlertTriangle, Box, Download, Layers, MousePointerClick, Ruler, Scissors } from 'lucide-react';
>>>>>>> Farukh
import { lazy, Suspense, type ReactNode } from 'react';
import { LOW_PRINT_DPI, lowDpiImages } from './objects';

// Three.js is large; load the 3D view in its own chunk so the 2D editor paints first.
const Preview3D = lazy(() => import('@/components/preview3d/Preview3D'));

const PRESETS: { id: CameraPreset; label: string; short: string }[] = [
    { id: 'front', label: 'Front', short: 'F' },
    { id: 'back', label: 'Back', short: 'B' },
    { id: 'left', label: 'Left', short: 'L' },
    { id: 'right', label: 'Right', short: 'R' },
    { id: 'top', label: 'Top', short: 'T' },
    { id: 'bottom', label: 'Bottom', short: 'Bt' },
];

type Props = {
    /** The whole box (all parts), for the 3D view. */
    result: DielineResult | null;
    /** The sheet shown in the editor (the active part of a rigid box). */
    sheetResult?: DielineResult | null;
    params: BoxParams | null;
    textures?: SheetTextures | null;
};

function Card({ title, icon, children, aside }: { title: string; icon?: ReactNode; children: ReactNode; aside?: ReactNode }) {
    return (
        <section className="shrink-0 rounded-2xl border border-slate-200/80 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">
                    {icon}
                    {title}
                </h3>
                {aside}
            </div>
            {children}
        </section>
    );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="text-[10px] font-medium text-slate-500">{label}</div>
            <div className="mt-0.5 text-sm font-bold text-slate-900 tabular-nums">{value}</div>
        </div>
    );
}

export default function RightPanel({ result, sheetResult, params, textures }: Props) {
    const sheet = sheetResult ?? result;
    const activeSide = useEditorStore((s) => s.activeSide);
    const foldProgress = useEditorStore((s) => s.foldProgress);
    const setFoldProgress = useEditorStore((s) => s.setFoldProgress);
    const xRay = useEditorStore((s) => s.xRay);
    const toggleXRay = useEditorStore((s) => s.toggleXRay);
    const cameraPreset = useEditorStore((s) => s.cameraPreset);
    const setCameraPreset = useEditorStore((s) => s.setCameraPreset);
    const source = useEditorStore((s) => s.design.source);
    const updateUploadedPanels = useEditorStore((s) => s.updateUploadedPanels);
    const material = useEditorStore((s) => s.design.material);
    const finish = useEditorStore((s) => s.design.finish);
    const setFinish = useEditorStore((s) => s.setFinish);
    const faceColors = useEditorStore((s) => s.design.faceColors);
    const setFaceColor = useEditorStore((s) => s.setFaceColor);
    const selectedPanelId = useEditorStore((s) => s.selectedPanelId);
    const setSelectedPanelId = useEditorStore((s) => s.setSelectedPanelId);
    const activePart = useEditorStore((s) => s.activePart);
    const setSelectedObjectIds = useEditorStore((s) => s.setSelectedObjectIds);
    const objects = useEditorStore((s) => surfaceObjects(s.design, activePart, activeSide));
    const dpiWarnings = lowDpiImages(objects);

    const size = params
        ? {
              length: toMm(params.length, params.unit),
              width: toMm(params.width, params.unit),
              depth: toMm(params.depth, params.unit),
              thickness: toMm(params.thickness, params.unit),
          }
        : null;

    const rigid = !!result?.parts?.length;
    const selectedPanel = result?.panels.find((p) => p.id === selectedPanelId) ?? null;
    const percent = Math.round(foldProgress * 100);

    return (
        <aside className="flex h-full w-[360px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200/80 bg-slate-50/80 p-3 [scrollbar-width:thin]">
            {/* 3D studio */}
            <section className="editor-studio relative shrink-0 overflow-hidden rounded-3xl shadow-xl ring-1 shadow-slate-900/20 ring-black/10">
                <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white/80 uppercase backdrop-blur">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                    Live 3D
                </div>
                <button
                    type="button"
                    onClick={toggleXRay}
                    className={cn(
                        'absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase backdrop-blur transition',
                        xRay ? 'bg-violet-500 text-white shadow' : 'bg-white/10 text-white/80 hover:bg-white/20',
                    )}
                >
                    <Eye className="size-3" />
                    X-Ray
                </button>
                <div className="relative aspect-[1/1]">
                    <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-white/50">Loading 3D…</div>}>
                        <Preview3D
                            result={result}
                            style={params?.style}
                            textures={textures}
                            size={size}
                            progress={foldProgress}
                            material={material}
                            finish={finish}
                            xRay={xRay}
                            faceColors={faceColors}
                            cameraPreset={cameraPreset}
                            selectedPanelId={selectedPanelId}
                            onSelectPanel={setSelectedPanelId}
                        />
                    </Suspense>
                    {!result && (
                        <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-xs text-white/60">
                            3D preview appears when this box style has a dieline.
                        </div>
                    )}
                </div>
                {/* Camera presets, docked on the viewer */}
                <div className="absolute inset-x-3 bottom-3 z-10 flex justify-center">
                    <div className="flex gap-0.5 rounded-2xl bg-black/35 p-1 ring-1 ring-white/10 backdrop-blur-md">
                        {PRESETS.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                title={`${p.label} view`}
                                onClick={() => setCameraPreset(p.id)}
                                className={cn(
                                    'rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition',
                                    cameraPreset === p.id ? 'bg-white text-slate-900 shadow' : 'text-white/70 hover:bg-white/10 hover:text-white',
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {/* Open / close */}
            <Card
                title={rigid ? 'Lid' : 'Fold'}
                icon={<Box className="size-3.5" />}
                aside={<span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700 tabular-nums">{percent}%</span>}
            >
                <input
                    id="fold-progress"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={foldProgress}
                    aria-label={rigid ? 'Lift or close the lid' : 'Fold the box'}
                    onChange={(e) => setFoldProgress(Number(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full accent-violet-600"
                    style={{ background: `linear-gradient(90deg, #7c3aed ${percent}%, #e2e8f0 ${percent}%)` }}
                />
                <div className="mt-1.5 flex justify-between text-[10px] font-medium text-slate-400">
                    <span>{rigid ? 'Open' : 'Flat'}</span>
                    <span>{rigid ? 'Closed' : 'Folded'}</span>
                </div>
            </Card>

            {/* Surface finish */}
            <Card title="Finish" icon={<Sparkles className="size-3.5" />}>
                <div className="flex flex-col gap-2.5">
                    <div className="grid grid-cols-3 gap-1.5">
                        {(['matte', 'gloss', 'soft-touch'] as const).map((lam) => (
                            <button
                                key={lam}
                                type="button"
                                onClick={() => setFinish({ lamination: lam })}
                                className={cn(
                                    'rounded-lg py-1.5 text-[11px] font-semibold capitalize transition',
                                    (finish?.lamination ?? 'matte') === lam
                                        ? 'bg-slate-900 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                                )}
                            >
                                {lam}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex gap-1">
                            {(['none', 'gold', 'silver'] as const).map((foil) => (
                                <button
                                    key={foil}
                                    type="button"
                                    onClick={() => setFinish({ foil })}
                                    className={cn(
                                        'rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition',
                                        (finish?.foil ?? 'none') === foil
                                            ? 'bg-slate-900 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                                    )}
                                >
                                    {foil === 'none' ? 'No foil' : `${foil} foil`}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => setFinish({ spotUv: !finish?.spotUv })}
                            className={cn(
                                'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition',
                                finish?.spotUv ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                            )}
                        >
                            Spot UV
                        </button>
                    </div>
                </div>
            </Card>

            {source.kind === 'uploaded-dieline' && (
                <FoldMappingPanel
                    panels={source.panels}
                    selectedPanelId={selectedPanelId}
                    onSelectPanel={setSelectedPanelId}
                    onChangePanels={(panels) => updateUploadedPanels(panels, true)}
                />
            )}

            {/* Selected panel */}
            <Card title="Panel" icon={<MousePointerClick className="size-3.5" />}>
                {selectedPanel ? (
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{selectedPanel.name}</div>
                            <div className="text-[11px] text-slate-500">Fill colour · {activeSide}</div>
                        </div>
                        <label
                            className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-slate-200 shadow-inner"
                            style={{ background: faceColors[selectedPanel.id] ?? materialColor(material, activeSide) }}
                        >
                            <input
                                type="color"
                                aria-label={`${selectedPanel.name} colour`}
                                value={toHexColor(faceColors[selectedPanel.id] ?? materialColor(material, activeSide))}
                                onChange={(e) => setFaceColor(selectedPanel.id, e.target.value)}
                                className="absolute inset-0 cursor-pointer opacity-0"
                            />
                        </label>
                    </div>
                ) : (
                    <p className="text-xs leading-relaxed text-slate-500">Click a panel on the dieline or on the 3D box to colour it.</p>
                )}
            </Card>

            {/* Sheet facts */}
            {sheet && (
                <Card title="Sheet" icon={<Ruler className="size-3.5" />}>
                    <div className="grid grid-cols-2 gap-2">
                        <Stat
                            label="Flat size"
                            value={
                                <>
                                    {Math.round(sheet.overallSize.width)} × {Math.round(sheet.overallSize.height)}
                                    <span className="ml-0.5 text-[10px] font-medium text-slate-400">mm</span>
                                </>
                            }
                        />
                        <Stat label="Panels" value={sheet.panels.length} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
                        <Legend color="#0f172a" label="Cut" />
                        <Legend color="#e11d48" label="Crease" dashed />
                        <Legend color="#38bdf8" label="Bleed" dashed />
                        <Legend color="#22c55e" label="Safe" dashed />
                        {sheet.panels.some((p) => p.id.includes('turnin-')) && <Legend color="#d97706" label="Turn-in" dashed />}
                    </div>
                </Card>
            )}

            {dpiWarnings.length > 0 && (
                <Card
                    title="Print quality"
                    icon={<AlertTriangle className="size-3.5 text-amber-500" />}
                    aside={
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 tabular-nums">
                            {dpiWarnings.length} low DPI
                        </span>
                    }
                >
                    <p className="mb-2 text-xs text-slate-600">
                        Images below 300 DPI may print blurry. Click an item to select and resize it.
                    </p>
                    <ul className="flex flex-col gap-1.5">
                        {dpiWarnings.map(({ object, dpi }, idx) => (
                            <li key={object.id}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedObjectIds([object.id])}
                                    className={cn(
                                        'flex w-full items-center justify-between rounded-xl border px-2.5 py-1.5 text-left text-xs transition hover:border-slate-300',
                                        dpi < LOW_PRINT_DPI ? 'border-rose-200 bg-rose-50/60 text-rose-800' : 'border-amber-200 bg-amber-50/60 text-amber-800',
                                    )}
                                >
                                    <span className="truncate font-medium">{String(object.props.name || `Image ${idx + 1}`)}</span>
                                    <span className="font-bold tabular-nums">{dpi} DPI</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {result?.chipboard && (
                <Card title="Chipboard cutting list" icon={<Layers className="size-3.5" />}>
                    <ul className="divide-y divide-slate-100 text-xs">
                        {result.chipboard.map((c) => (
                            <li key={c.name} className="flex items-center justify-between gap-2 py-1.5">
                                <span className="text-slate-600">{c.name}</span>
                                <span className="flex items-center gap-2 font-semibold text-slate-900 tabular-nums">
                                    {c.width} × {c.height}
                                    <span className="rounded-md bg-slate-100 px-1.5 py-px text-[10px] font-bold text-slate-500">×{c.quantity}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {sheet && (
                <button
                    type="button"
                    onClick={() => downloadText(dielineFileName(params), dielineToSvg(sheet, { params: params ?? undefined }))}
                    className="group flex shrink-0 items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 text-left transition hover:border-violet-300 hover:shadow-md hover:shadow-violet-100"
                >
                    <span className="flex size-10 items-center justify-center rounded-xl bg-slate-900 text-white transition group-hover:bg-violet-600">
                        <Scissors className="size-4" />
                    </span>
                    <span className="flex-1">
                        <span className="block text-sm font-semibold text-slate-900">Download dieline</span>
                        <span className="block text-[11px] text-slate-500">Layered SVG · cut, crease, bleed, safe</span>
                    </span>
                    <Download className="size-4 text-slate-400 transition group-hover:text-violet-600" />
                </button>
            )}
        </aside>
    );
}

/** <input type="color"> only accepts #rrggbb. */
function toHexColor(color: string): string {
    return /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
    return (
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="inline-block w-4 border-t-2" style={{ borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />
            {label}
        </span>
    );
}
