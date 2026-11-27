import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/useEditorStore';
import { Box, ChevronRight, Eye, Redo2, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import SaveControls from './SaveControls';
import ShareDialog from './ShareDialog';

type Props = {
    productName: string;
    defaultName: string;
    autosave: boolean;
    readOnly: boolean;
    onEditCopy: () => void;
};

function HeaderIcon({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            className="flex size-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30"
        >
            {children}
        </button>
    );
}

/** Top app bar: brand, the design being edited, history and the save / share actions. */
export default function EditorHeader({ productName, defaultName, autosave, readOnly, onEditCopy }: Props) {
    const canUndo = useStore(useEditorStore.temporal, (s) => s.pastStates.length > 0);
    const canRedo = useStore(useEditorStore.temporal, (s) => s.futureStates.length > 0);
    const { undo, redo } = useEditorStore.temporal.getState();

    return (
        <header className="relative z-30 flex h-16 shrink-0 items-center gap-4 border-b border-slate-200/80 bg-white px-4">
            <div className="flex items-center gap-3 pr-2">
                <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-700 text-white shadow-md shadow-violet-500/30">
                    <Box className="size-5" strokeWidth={2.2} />
                </div>
                <div className="hidden leading-tight sm:block">
                    <div className="text-sm font-bold tracking-tight text-slate-900">Dieline Studio</div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        Editor <ChevronRight className="size-3" /> <span className="font-medium text-slate-700">{productName}</span>
                    </div>
                </div>
            </div>
            <div className="h-8 w-px bg-slate-200" />

            {readOnly ? (
                <div className="flex flex-1 items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                            <Eye className="size-4" />
                        </span>
                        <span className="font-semibold">Shared design</span>
                        <span className="text-slate-400">· view only</span>
                    </div>
                    <button
                        type="button"
                        onClick={onEditCopy}
                        className="flex h-9 items-center rounded-xl bg-gradient-to-b from-violet-500 to-violet-700 px-4 text-sm font-semibold text-white shadow-md shadow-violet-500/30 hover:to-violet-600"
                    >
                        Edit a copy
                    </button>
                </div>
            ) : (
                <SaveControls defaultName={defaultName} autosave={autosave}>
                    <div className={cn('flex items-center rounded-xl border border-slate-200 p-0.5')}>
                        <HeaderIcon label="Undo (Ctrl+Z)" onClick={() => undo()} disabled={!canUndo}>
                            <Undo2 className="size-4" />
                        </HeaderIcon>
                        <HeaderIcon label="Redo (Ctrl+Y)" onClick={() => redo()} disabled={!canRedo}>
                            <Redo2 className="size-4" />
                        </HeaderIcon>
                    </div>
                    <ShareDialog />
                </SaveControls>
            )}
        </header>
    );
}
