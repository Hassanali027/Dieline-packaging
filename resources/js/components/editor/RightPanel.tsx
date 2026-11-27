import type { SheetTextures } from '@/hooks/use-sheet-textures';
import { toMm } from '@/lib/dieline';
import { downloadText } from '@/lib/export/download';
import { dielineFileName, dielineToSvg } from '@/lib/export/svg';
import { materialColor } from '@/lib/three/materials';
import { cn } from '@/lib/utils';
import { useEditorStore, type CameraPreset } from '@/store/useEditorStore';
import type { BoxParams, DielineResult } from '@/types/design';
import { Download } from 'lucide-react';
import { lazy, Suspense } from 'react';

// Three.js is large; load the 3D view in its own chunk so the 2D editor paints first.
const Preview3D = lazy(() => import('@/components/preview3d/Preview3D'));

const PRESETS: CameraPreset[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

type Props = {
    result: DielineResult | null;
    params: BoxParams | null;
    textures?: SheetTextures | null;
};

export default function RightPanel({ result, params, textures }: Props) {
    const activeSide = useEditorStore((s) => s.activeSide);
    const setActiveSide = useEditorStore((s) => s.setActiveSide);
    const foldProgress = useEditorStore((s) => s.foldProgress);
    const setFoldProgress = useEditorStore((s) => s.setFoldProgress);
    const cameraPreset = useEditorStore((s) => s.cameraPreset);
    const setCameraPreset = useEditorStore((s) => s.setCameraPreset);
    const material = useEditorStore((s) => s.design.material);
    const faceColors = useEditorStore((s) => s.design.faceColors);
    const setFaceColor = useEditorStore((s) => s.setFaceColor);
    const selectedPanelId = useEditorStore((s) => s.selectedPanelId);
    const setSelectedPanelId = useEditorStore((s) => s.setSelectedPanelId);

    const size = params
        ? {
              length: toMm(params.length, params.unit),
              width: toMm(params.width, params.unit),
              depth: toMm(params.depth, params.unit),
              thickness: toMm(params.thickness, params.unit),
          }
        : null;

    const selectedPanel = result?.panels.find((p) => p.id === selectedPanelId) ?? null;

    return (
        <aside className="flex h-full w-[360px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-4">
            <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-slate-400">Loading 3D…</div>}>
                    <Preview3D
                        result={result}
                        style={params?.style}
                        textures={textures}
                        size={size}
                        progress={foldProgress}
                        material={material}
                        faceColors={faceColors}
                        cameraPreset={cameraPreset}
                        selectedPanelId={selectedPanelId}
                        onSelectPanel={setSelectedPanelId}
                    />
                </Suspense>
                {!result && (
                    <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-slate-500">
                        3D preview appears when this box style has a dieline.
                    </div>
                )}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
                {PRESETS.map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        onClick={() => setCameraPreset(preset)}
                        className={cn(
                            'rounded-md py-1.5 text-xs font-medium capitalize',
                            cameraPreset === preset ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                        )}
                    >
                        {preset}
                    </button>
                ))}
            </div>

            <div>
                <label htmlFor="fold-progress" className="flex justify-between text-xs font-medium text-slate-600">
                    <span>Open / Close</span>
                    <span className="tabular-nums">{Math.round(foldProgress * 100)}%</span>
                </label>
                <input
                    id="fold-progress"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={foldProgress}
                    onChange={(e) => setFoldProgress(Number(e.target.value))}
                    className="mt-1 w-full accent-slate-900"
                />
            </div>

            <div className="flex gap-2">
                {(['outside', 'inside'] as const).map((side) => (
                    <button
                        key={side}
                        type="button"
                        onClick={() => setActiveSide(side)}
                        className={cn(
                            'flex-1 rounded-md py-1.5 text-xs font-medium capitalize',
                            activeSide === side ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                        )}
                    >
                        {side}
                    </button>
                ))}
            </div>

            <div className="rounded-lg border border-slate-200 p-3 text-xs">
                {selectedPanel ? (
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <div className="font-medium text-slate-900">{selectedPanel.name}</div>
                            <div className="text-slate-500">Panel colour</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                aria-label={`${selectedPanel.name} colour`}
                                value={toHexColor(faceColors[selectedPanel.id] ?? materialColor(material, activeSide))}
                                onChange={(e) => setFaceColor(selectedPanel.id, e.target.value)}
                                className="h-8 w-10 cursor-pointer rounded border border-slate-200"
                            />
                        </div>
                    </div>
                ) : (
                    <p className="text-slate-500">Click a panel on the 2D dieline or the 3D box to select it.</p>
                )}
            </div>

            {result && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <dt>Sheet size</dt>
                    <dd className="text-right text-slate-700 tabular-nums">
                        {Math.round(result.overallSize.width)} × {Math.round(result.overallSize.height)} mm
                    </dd>
                    <dt>Panels</dt>
                    <dd className="text-right text-slate-700">{result.panels.length}</dd>
                    <dt className="col-span-2 mt-2 flex flex-wrap gap-3">
                        <Legend color="#0f172a" label="Cut" />
                        <Legend color="#e11d48" label="Crease" dashed />
                        <Legend color="#38bdf8" label="Bleed 3 mm" dashed />
                        <Legend color="#22c55e" label="Safe" dashed />
                    </dt>
                </dl>
            )}

            {result && (
                <button
                    type="button"
                    onClick={() => downloadText(dielineFileName(params), dielineToSvg(result, { params: params ?? undefined }))}
                    className="flex items-center justify-center gap-2 rounded-md border border-slate-200 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                    <Download className="size-4" />
                    Download dieline (SVG)
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
        <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t-2" style={{ borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />
            {label}
        </span>
    );
}
