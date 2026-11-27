import { autoBuildFoldTreeFromBase, updatePanelFoldAngle } from '@/lib/three/foldTree';
import type { Panel } from '@/types/design';
import { GitBranch, RotateCw } from 'lucide-react';

type Props = {
    panels: Panel[];
    selectedPanelId: string | null;
    onSelectPanel: (id: string) => void;
    onChangePanels: (panels: Panel[]) => void;
};

/**
 * Sprint 3 Fold Mapping UI (Dev 3): lets a user pick the base panel for an uploaded
 * dieline, auto-build the hinge tree from shared edges, and fine-tune fold angles live.
 */
export default function FoldMappingPanel({ panels, selectedPanelId, onSelectPanel, onChangePanels }: Props) {
    if (!panels.length) {
        return <p className="text-xs text-slate-500">Upload a dieline to map base panel and fold angles.</p>;
    }

    const basePanel = panels.find((p) => !p.parentId) ?? panels[0];
    const children = panels.filter((p) => p.id !== basePanel.id);

    const setBasePanel = (baseId: string) => {
        onChangePanels(autoBuildFoldTreeFromBase(panels, baseId));
        onSelectPanel(baseId);
    };

    const resetAngles = () => {
        onChangePanels(
            autoBuildFoldTreeFromBase(
                panels.map((p) => ({ ...p, foldAngle: 0 })),
                basePanel.id,
                90,
            ),
        );
    };

    return (
        <section className="shrink-0 rounded-2xl border border-slate-200/80 bg-white p-4 text-xs">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">
                    <GitBranch className="size-3.5" />
                    Fold mapping
                </h3>
                <button
                    type="button"
                    onClick={resetAngles}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                >
                    <RotateCw className="size-3" />
                    Auto 90°
                </button>
            </div>

            <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
                Base (floor) panel
                <select
                    value={basePanel.id}
                    onChange={(e) => setBasePanel(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900"
                >
                    {panels.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name}
                        </option>
                    ))}
                </select>
            </label>

            <div className="mt-3 flex max-h-48 flex-col gap-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {children.map((panel) => {
                    const selected = panel.id === selectedPanelId;
                    const linked = Boolean(panel.parentId && panel.hinge);
                    return (
                        <div
                            key={panel.id}
                            onClick={() => onSelectPanel(panel.id)}
                            className={`cursor-pointer rounded-xl border p-2.5 transition ${
                                selected ? 'border-violet-500 bg-violet-50/40' : 'border-slate-200/80 bg-slate-50/60 hover:bg-slate-50'
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-semibold text-slate-800">{panel.name}</span>
                                <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                                    {linked ? `${Math.round(panel.foldAngle)}°` : 'Unlinked'}
                                </span>
                            </div>
                            {linked && (
                                <input
                                    type="range"
                                    min={-180}
                                    max={180}
                                    step={5}
                                    value={panel.foldAngle}
                                    onChange={(e) => onChangePanels(updatePanelFoldAngle(panels, panel.id, Number(e.target.value)))}
                                    className="mt-1.5 h-1.5 w-full cursor-pointer accent-violet-600"
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
