import { Maximize2, Minus, Plus } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import type { CanvasController } from './DielineCanvas';

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            onClick={onClick}
            className="flex size-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-900/5 hover:text-slate-900"
        >
            {children}
        </button>
    );
}

/** Floating zoom pill for the 2D canvas (wheel zooms too; Space + drag pans). */
export default function ZoomControls({ controller, zoom }: { controller: RefObject<CanvasController | null>; zoom: number }) {
    return (
        <div className="editor-glass pointer-events-auto flex items-center gap-0.5 rounded-xl border border-white/60 p-1 shadow-lg ring-1 shadow-slate-900/10 ring-slate-900/5">
            <ZoomButton label="Zoom out" onClick={() => controller.current?.zoomOut()}>
                <Minus className="size-4" />
            </ZoomButton>
            <span className="w-12 text-center text-xs font-semibold text-slate-700 tabular-nums">{Math.round(zoom * 100)}%</span>
            <ZoomButton label="Zoom in" onClick={() => controller.current?.zoomIn()}>
                <Plus className="size-4" />
            </ZoomButton>
            <div className="mx-0.5 h-5 w-px bg-slate-200" />
            <ZoomButton label="Fit to screen" onClick={() => controller.current?.fit()}>
                <Maximize2 className="size-4" />
            </ZoomButton>
        </div>
    );
}
