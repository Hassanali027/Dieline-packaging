import { useEditorStore } from '@/store/useEditorStore';
import { Maximize, Minus, Plus, Redo2, Undo2 } from 'lucide-react';
import type { RefObject } from 'react';
import { useStore } from 'zustand';
import type { CanvasController } from './DielineCanvas';

type Props = {
    controller: RefObject<CanvasController | null>;
    zoom: number;
};

function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            className="flex size-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent"
        >
            {children}
        </button>
    );
}

export default function BottomToolbar({ controller, zoom }: Props) {
    const canUndo = useStore(useEditorStore.temporal, (s) => s.pastStates.length > 0);
    const canRedo = useStore(useEditorStore.temporal, (s) => s.futureStates.length > 0);
    const { undo, redo } = useEditorStore.temporal.getState();

    return (
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 px-2 py-1 shadow-sm backdrop-blur">
            <ToolButton label="Undo (Ctrl+Z)" onClick={() => undo()} disabled={!canUndo}>
                <Undo2 className="size-4" />
            </ToolButton>
            <ToolButton label="Redo (Ctrl+Y)" onClick={() => redo()} disabled={!canRedo}>
                <Redo2 className="size-4" />
            </ToolButton>
            <div className="mx-1 h-5 w-px bg-slate-200" />
            <ToolButton label="Zoom out" onClick={() => controller.current?.zoomOut()}>
                <Minus className="size-4" />
            </ToolButton>
            <span className="w-14 text-center text-xs font-medium text-slate-700 tabular-nums">{Math.round(zoom * 100)}%</span>
            <ToolButton label="Zoom in" onClick={() => controller.current?.zoomIn()}>
                <Plus className="size-4" />
            </ToolButton>
            <ToolButton label="Fit to screen" onClick={() => controller.current?.fit()}>
                <Maximize className="size-4" />
            </ToolButton>
            <div className="mx-1 h-5 w-px bg-slate-200" />
            <span className="px-1 text-[11px] text-slate-400">Scroll to zoom · Space + drag to pan</span>
        </div>
    );
}
