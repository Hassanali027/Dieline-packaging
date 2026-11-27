import { ApiError, listUploads, MAX_UPLOAD_BYTES, UPLOAD_ACCEPT, uploadImage, type UploadedAsset } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/useEditorStore';
import { Circle, Loader2, Minus, Square, Triangle, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { makeImage, makeShape, makeText, type ShapeKind, type SheetFrame, type TextPreset } from './objects';

type PanelProps = { sheet: SheetFrame | null };

function useAdd() {
    const side = useEditorStore((s) => s.activeSide);
    const addObject = useEditorStore((s) => s.addObject);
    return { side, addObject };
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

const TEXT_BUTTONS: { preset: TextPreset; label: string; className: string }[] = [
    { preset: 'heading', label: 'Add a heading', className: 'text-lg font-bold' },
    { preset: 'subheading', label: 'Add a subheading', className: 'text-base font-semibold' },
    { preset: 'body', label: 'Add body text', className: 'text-sm' },
];

export function TextPanel({ sheet }: PanelProps) {
    const { side, addObject } = useAdd();
    return (
        <div className="flex flex-col gap-2">
            {TEXT_BUTTONS.map((b) => (
                <button
                    key={b.preset}
                    type="button"
                    disabled={!sheet}
                    onClick={() => sheet && addObject(side, makeText(b.preset, side, sheet))}
                    className={cn(
                        'rounded-lg border border-slate-200 px-3 py-3 text-left text-slate-800 hover:bg-slate-50 disabled:opacity-40',
                        b.className,
                    )}
                >
                    {b.label}
                </button>
            ))}
            <p className="mt-2 text-xs text-slate-500">Double-click text on the canvas to edit it.</p>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Elements (shapes)                                                   */
/* ------------------------------------------------------------------ */

const SHAPES: { kind: ShapeKind; label: string; icon: React.ReactNode }[] = [
    { kind: 'rect', label: 'Square', icon: <Square className="size-7" /> },
    { kind: 'rounded', label: 'Rounded', icon: <Square className="size-7 rounded-md" style={{ borderRadius: 6 }} /> },
    { kind: 'circle', label: 'Circle', icon: <Circle className="size-7" /> },
    { kind: 'triangle', label: 'Triangle', icon: <Triangle className="size-7" /> },
    { kind: 'line', label: 'Line', icon: <Minus className="size-7" /> },
];

export function ElementsPanel({ sheet }: PanelProps) {
    const { side, addObject } = useAdd();
    return (
        <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Shapes</h3>
            <div className="grid grid-cols-3 gap-2">
                {SHAPES.map((s) => (
                    <button
                        key={s.kind}
                        type="button"
                        disabled={!sheet}
                        onClick={() => sheet && addObject(side, makeShape(s.kind, side, sheet))}
                        className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 py-3 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                        {s.icon}
                        {s.label}
                    </button>
                ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">Icons and patterns arrive in Sprint 2.</p>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */

function loadNaturalSize(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth || 300, height: img.naturalHeight || 300 });
        img.onerror = () => reject(new Error('Could not load the image.'));
        img.src = url;
    });
}

export function UploadsPanel({ sheet }: PanelProps) {
    const { side, addObject } = useAdd();
    const inputRef = useRef<HTMLInputElement>(null);
    const [assets, setAssets] = useState<UploadedAsset[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        listUploads()
            .then((r) => setAssets(r.data))
            .catch(() => setAssets([]));
    }, []);

    const place = async (asset: UploadedAsset) => {
        if (!sheet) return;
        try {
            const natural = asset.width && asset.height ? { width: asset.width, height: asset.height } : await loadNaturalSize(asset.url);
            addObject(side, makeImage(asset, natural, side, sheet));
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const onFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        setError(null);
        setBusy(true);
        try {
            for (const file of Array.from(files)) {
                if (file.size > MAX_UPLOAD_BYTES) {
                    setError(`${file.name} is larger than 10 MB.`);
                    continue;
                }
                const { data } = await uploadImage(file);
                setAssets((list) => [data, ...list]);
                await place(data);
            }
        } catch (e) {
            const err = e as ApiError;
            setError(err.errors?.file?.[0] ?? err.message);
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <input ref={inputRef} type="file" accept={UPLOAD_ACCEPT} multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy || !sheet}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    void onFiles(e.dataTransfer.files);
                }}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
            >
                {busy ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
                <span className="font-medium">{busy ? 'Uploading…' : 'Upload images'}</span>
                <span className="text-xs text-slate-400">JPG, PNG or SVG · up to 10 MB · or drop here</span>
            </button>
            {error && <p className="rounded-md bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
            {assets.length > 0 && (
                <div>
                    <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Your uploads</h3>
                    <div className="grid grid-cols-3 gap-2">
                        {assets.map((a) => (
                            <button
                                key={a.id}
                                type="button"
                                title={a.name ?? 'Image'}
                                onClick={() => place(a)}
                                className="aspect-square overflow-hidden rounded-md border border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] hover:ring-2 hover:ring-indigo-400"
                            >
                                <img src={a.thumbnail_url ?? a.url} alt={a.name ?? ''} className="h-full w-full object-contain" loading="lazy" />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
