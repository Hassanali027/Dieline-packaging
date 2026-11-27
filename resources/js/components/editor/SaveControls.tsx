import { ApiError, saveDesign } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/useEditorStore';
import type { Design } from '@/types/design';
import { Check, Loader2, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

/**
 * Saving (Dev 2 UI on Dev 4's /api/designs):
 * - "Save" stores the design on the server; the URL becomes /editor/...?design={id} so a
 *   reload or bookmark reopens it.
 * - Every change is also kept as a local draft (localStorage), offered back after a reload.
 */

export const DRAFT_KEY = 'dieline-editor:draft';
const DRAFT_DEBOUNCE_MS = 800;

export type Draft = { design: Design; designId: number | null; name: string; savedAt: string };

export function readDraft(): Draft | null {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        const draft = raw ? (JSON.parse(raw) as Draft) : null;
        return draft?.design?.source ? draft : null;
    } catch {
        return null;
    }
}

export function clearDraft(): void {
    try {
        localStorage.removeItem(DRAFT_KEY);
    } catch {
        // Storage can be blocked (private mode); drafts are best effort.
    }
}

/** A draft is worth offering only if the customer actually designed something. */
export function draftHasWork(draft: Draft): boolean {
    const d = draft.design;
    return d.outside.length > 0 || d.inside.length > 0 || Object.keys(d.faceColors ?? {}).length > 0;
}

function setDesignInUrl(id: number) {
    const url = new URL(window.location.href);
    url.searchParams.set('design', String(id));
    window.history.replaceState(window.history.state, '', url);
}

/** `autosave` is off while the restore-draft banner is open, so the old draft is not overwritten. */
export default function SaveControls({ defaultName, autosave = true }: { defaultName: string; autosave?: boolean }) {
    const design = useEditorStore((s) => s.design);
    const meta = useEditorStore((s) => s.designMeta);
    const setDesignMeta = useEditorStore((s) => s.setDesignMeta);
    const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const designId = meta.id;
    const name = meta.name || defaultName;
    const dirty = meta.baseline !== design;

    // Local draft, a moment after each change.
    useEffect(() => {
        if (!autosave) return;
        const timer = window.setTimeout(() => {
            try {
                const draft: Draft = { design, designId, name, savedAt: new Date().toISOString() };
                localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
            } catch {
                // Quota or private mode: nothing to do.
            }
        }, DRAFT_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [design, designId, name, autosave]);

    const save = useCallback(async () => {
        const current = useEditorStore.getState().design;
        setStatus('saving');
        setError(null);
        try {
            const { data } = await saveDesign(designId, name.trim() || defaultName, current);
            setDesignInUrl(data.id);
            setDesignMeta({ id: data.id, name: data.name, baseline: current });
            setStatus('idle');
        } catch (e) {
            const err = e as ApiError;
            setError(Object.values(err.errors ?? {})[0]?.[0] ?? err.message);
            setStatus('error');
        }
    }, [designId, name, defaultName, setDesignMeta]);

    // Ctrl/Cmd + S
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void save();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [save]);

    const label =
        status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved' : dirty ? (designId ? 'Unsaved changes' : 'Not saved yet') : 'Saved';

    return (
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-2 py-1 shadow-xs backdrop-blur">
            <input
                value={name}
                onChange={(e) => setDesignMeta({ name: e.target.value })}
                aria-label="Design name"
                maxLength={120}
                className="w-40 rounded px-1.5 py-1 text-xs font-medium text-slate-800 outline-none hover:bg-slate-50 focus:bg-slate-50"
            />
            <span
                title={error ?? undefined}
                className={cn(
                    'flex items-center gap-1 text-[11px] whitespace-nowrap',
                    status === 'error' ? 'text-rose-600' : dirty ? 'text-amber-600' : 'text-emerald-600',
                )}
            >
                {!dirty && status !== 'error' && <Check className="size-3" />}
                {label}
            </span>
            <button
                type="button"
                onClick={() => void save()}
                disabled={status === 'saving'}
                title="Save (Ctrl+S)"
                className="flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
                {status === 'saving' ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Save
            </button>
        </div>
    );
}

/** Offers the local draft back after a reload (only when no saved design was opened). */
export function DraftBanner({ draft, onRestore, onDiscard }: { draft: Draft; onRestore: () => void; onDiscard: () => void }) {
    const when = new Date(draft.savedAt);
    return (
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-xs">
            <span>
                You have an unsaved draft from {when.toLocaleDateString()} {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
            </span>
            <button type="button" onClick={onRestore} className="rounded bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-700">
                Restore
            </button>
            <button type="button" onClick={onDiscard} className="rounded px-2 py-1 font-medium hover:bg-amber-100">
                Discard
            </button>
        </div>
    );
}
