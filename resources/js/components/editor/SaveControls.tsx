import { ApiError, saveDesign } from '@/lib/api';
import { replaceUrl } from '@/lib/url';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/useEditorStore';
import type { Design } from '@/types/design';
import { Check, Loader2, Save } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

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
    const partWork = Object.values(d.parts ?? {}).some((p) => (p?.outside?.length ?? 0) > 0 || (p?.inside?.length ?? 0) > 0);
    return (
        d.outside.length > 0 || d.inside.length > 0 || partWork || d.source.kind === 'uploaded-dieline' || Object.keys(d.faceColors ?? {}).length > 0
    );
}

function setDesignInUrl(id: number) {
    const url = new URL(window.location.href);
    url.searchParams.set('design', String(id));
    replaceUrl(url);
}

/** `autosave` is off while the restore-draft banner is open, so the old draft is not overwritten. */
export default function SaveControls({ defaultName, autosave = true, children }: { defaultName: string; autosave?: boolean; children?: ReactNode }) {
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

    const tone = status === 'error' ? 'error' : dirty ? 'dirty' : 'saved';

    return (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
            {/* Design name, edited in place, with its save state underneath. */}
            <div className="flex min-w-0 flex-col">
                <input
                    value={name}
                    onChange={(e) => setDesignMeta({ name: e.target.value })}
                    aria-label="Design name"
                    maxLength={120}
                    className="w-64 max-w-full truncate rounded-md bg-transparent px-1.5 py-0.5 text-sm font-semibold text-slate-900 outline-none hover:bg-slate-100 focus:bg-slate-100"
                />
                <span title={error ?? undefined} className="flex items-center gap-1.5 px-1.5 text-[11px] whitespace-nowrap text-slate-500">
                    <span
                        className={cn(
                            'inline-block size-1.5 rounded-full',
                            tone === 'error' ? 'bg-rose-500' : tone === 'dirty' ? 'bg-amber-500' : 'bg-emerald-500',
                        )}
                    />
                    {label}
                    {status === 'saving' && <Loader2 className="size-3 animate-spin" />}
                </span>
            </div>
            <div className="flex items-center gap-2">
                {children}
                <button
                    type="button"
                    onClick={() => void save()}
                    disabled={status === 'saving'}
                    title="Save (Ctrl+S)"
                    className="flex h-9 items-center gap-2 rounded-xl bg-gradient-to-b from-violet-500 to-violet-700 px-4 text-sm font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_6px_16px_-6px_rgba(109,40,217,0.7)] transition hover:from-violet-500 hover:to-violet-600 disabled:opacity-60"
                >
                    {tone === 'saved' && status !== 'saving' ? <Check className="size-4" /> : <Save className="size-4" />}
                    Save
                </button>
            </div>
        </div>
    );
}

/** Offers the local draft back after a reload (only when no saved design was opened). */
export function DraftBanner({ draft, onRestore, onDiscard }: { draft: Draft; onRestore: () => void; onDiscard: () => void }) {
    const when = new Date(draft.savedAt);
    return (
        <div className="editor-glass pointer-events-auto flex items-center gap-3 rounded-2xl border border-amber-200/80 px-3.5 py-2.5 text-xs text-amber-900 shadow-lg shadow-amber-900/5">
            <span>
                You have an unsaved draft from {when.toLocaleDateString()} {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
            </span>
            <button type="button" onClick={onRestore} className="rounded-lg bg-amber-500 px-2.5 py-1 font-semibold text-white hover:bg-amber-600">
                Restore
            </button>
            <button type="button" onClick={onDiscard} className="rounded px-2 py-1 font-medium hover:bg-amber-100">
                Discard
            </button>
        </div>
    );
}
