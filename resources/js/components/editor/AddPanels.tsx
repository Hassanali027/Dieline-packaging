import { ApiError, listUploads, MAX_UPLOAD_BYTES, UPLOAD_ACCEPT, uploadImage, type UploadedAsset } from '@/lib/api';
import { ensureFont, FONT_COMBOS, QUICK_TEXTS } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { parseUploadedSvg } from '@/lib/dieline';
import { useEditorStore } from '@/store/useEditorStore';
import type { BoxSource } from '@/types/design';
import { Circle, FileText, Loader2, Minus, Square, Triangle, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { makeImage, makeShape, makeText, makeTextWith, type ShapeKind, type SheetFrame, type TextPreset } from './objects';

type PanelProps = { sheet: SheetFrame | null };

function useAdd() {
    const side = useEditorStore((s) => s.activeSide);
    const addObject = useEditorStore((s) => s.addObject);
    const addObjects = useEditorStore((s) => s.addObjects);
    return { side, addObject, addObjects };
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
    const { side, addObject, addObjects } = useAdd();

    // Preview the combination fonts in the panel itself.
    useEffect(() => {
        FONT_COMBOS.forEach((c) => {
            void ensureFont(c.heading);
            void ensureFont(c.body);
        });
    }, []);

    const addCombo = (combo: (typeof FONT_COMBOS)[number]) => {
        if (!sheet) return;
        addObjects(side, [
            makeTextWith({ text: combo.headingText, fontSizePt: 34, fontFamily: combo.heading, fontWeight: 'normal', dy: -6 }, side, sheet),
            makeTextWith({ text: combo.bodyText, fontSizePt: 12, fontFamily: combo.body, dy: 8 }, side, sheet),
        ]);
    };

    return (
        <div className="flex flex-col gap-2">
            {TEXT_BUTTONS.map((b) => (
                <button
                    key={b.preset}
                    type="button"
                    disabled={!sheet}
                    onClick={() => sheet && addObject(side, makeText(b.preset, side, sheet))}
                    className={cn(
                        'rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left text-slate-900 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md hover:shadow-violet-100 disabled:opacity-40',
                        b.className,
                    )}
                >
                    {b.label}
                </button>
            ))}
            <p className="text-xs text-slate-500">Double-click text on the canvas to edit it.</p>

            <h3 className="mt-3 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">Font combinations</h3>
            <div className="grid grid-cols-2 gap-2">
                {FONT_COMBOS.map((c) => (
                    <button
                        key={c.heading}
                        type="button"
                        disabled={!sheet}
                        onClick={() => addCombo(c)}
                        className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-2 py-3 text-center transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md hover:shadow-violet-100 disabled:opacity-40"
                    >
                        <div className="truncate text-base leading-tight text-slate-900" style={{ fontFamily: `"${c.heading}"` }}>
                            {c.headingText}
                        </div>
                        <div className="truncate text-[10px] text-slate-500" style={{ fontFamily: `"${c.body}"` }}>
                            {c.bodyText}
                        </div>
                    </button>
                ))}
            </div>

            <h3 className="mt-3 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">Quick text</h3>
            <div className="flex flex-wrap gap-1.5">
                {QUICK_TEXTS.map((t) => (
                    <button
                        key={t}
                        type="button"
                        disabled={!sheet}
                        onClick={() => sheet && addObject(side, makeTextWith({ text: t, fontSizePt: 16, fontWeight: 'bold' }, side, sheet))}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40"
                    >
                        {t}
                    </button>
                ))}
            </div>
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
            <h3 className="mb-2 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">Shapes</h3>
            <div className="grid grid-cols-3 gap-2">
                {SHAPES.map((s) => (
                    <button
                        key={s.kind}
                        type="button"
                        disabled={!sheet}
                        onClick={() => sheet && addObject(side, makeShape(s.kind, side, sheet))}
                        className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white py-4 text-[11px] font-medium text-slate-600 transition hover:-translate-y-0.5 hover:border-violet-300 hover:text-violet-700 hover:shadow-md hover:shadow-violet-100 disabled:opacity-40"
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
    const dielineRef = useRef<HTMLInputElement>(null);
    const setSource = useEditorStore((s) => s.setSource);
    const setActiveTab = useEditorStore((s) => s.setActiveTab);
    const importedDieline = useEditorStore((s) => s.design.source.kind === 'uploaded-dieline' ? s.design.source : null);
    const [assets, setAssets] = useState<UploadedAsset[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dielineBusy, setDielineBusy] = useState(false);
    const svgAssets = assets.filter((asset) => asset.mime === 'image/svg+xml' || /\.svg$/i.test(asset.name ?? ''));
    const imageAssets = assets.filter((asset) => !svgAssets.includes(asset));

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

    const onDieline = async (file: File | undefined) => {
        if (!file) return;
        setError(null);
        setDielineBusy(true);
        try {
            if (file.size > MAX_UPLOAD_BYTES) throw new Error('SVG dielines must be 10 MB or smaller.');
            if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') throw new Error('Upload an SVG dieline.');
            const source = await readUploadedDieline(file.name, await file.text());
            const { data } = await uploadImage(file);
            setAssets((list) => [data, ...list.filter((asset) => asset.id !== data.id)]);
            setSource(source);
            setActiveTab('uploads');
        } catch (e) {
            const err = e as ApiError;
            setError(err.errors?.file?.[0] ?? err.message);
        } finally {
            setDielineBusy(false);
            if (dielineRef.current) dielineRef.current.value = '';
        }
    };

    const readUploadedDieline = (fileId: string, content: string): Extract<BoxSource, { kind: 'uploaded-dieline' }> => {
        const parsed = parseUploadedSvg(content);
        if (!parsed.panels.length) throw new Error('No closed panels were found. Add polygon panels to the SVG and try again.');
        const otherWarnings = parsed.warnings.filter((warning) => !warning.includes('confirm the physical scale'));
        if (otherWarnings.length) setError(otherWarnings.join(' '));
        return {
            kind: 'uploaded-dieline',
            fileId,
            panels: parsed.panels,
            lines: parsed.lines,
            foldMapped: parsed.panels.some((panel) => !!panel.parentId),
            widthMm: parsed.width,
            heightMm: parsed.height,
            unit: parsed.unit,
            // Pixel SVGs use the parser's standard 96 px/in conversion automatically.
            scaleConfirmed: true,
        };
    };

    const openDielineAsset = async (asset: UploadedAsset) => {
        setError(null);
        try {
            const response = await fetch(asset.url);
            if (!response.ok) throw new Error(`Could not open ${asset.name ?? 'this SVG'}.`);
            setSource(readUploadedDieline(asset.name ?? `dieline-${asset.id}.svg`, await response.text()));
            setActiveTab('uploads');
        } catch (e) {
            setError((e as Error).message);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <input ref={dielineRef} type="file" accept="image/svg+xml,.svg" className="hidden" onChange={(e) => void onDieline(e.target.files?.[0])} />
            <button type="button" onClick={() => dielineRef.current?.click()} disabled={dielineBusy} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-violet-300 disabled:opacity-60">
                <span className="block text-sm font-semibold text-slate-800">{dielineBusy ? 'Importing dieline…' : 'Import SVG dieline'}</span>
                <span className="mt-1 block text-xs text-slate-500">Straight-edged panels · SVG · up to 10 MB</span>
            </button>
            {importedDieline && (
                <div className="flex flex-col gap-2">
                </div>
            )}
            {svgAssets.length > 0 && (
                <section>
                    <h3 className="mb-2 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">Your dielines</h3>
                    <div className="flex flex-col gap-1.5">
                        {svgAssets.map((asset) => {
                            const active = importedDieline?.fileId === asset.name;
                            return (
                                <button
                                    key={asset.id}
                                    type="button"
                                    onClick={() => void openDielineAsset(asset)}
                                    className={cn('flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition', active ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:border-violet-300')}
                                >
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-violet-600"><FileText className="size-4" /></span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-semibold text-slate-800">{asset.name ?? 'Untitled dieline.svg'}</span>
                                        <span className="block text-[10px] text-slate-500">{asset.size ? `${(asset.size / 1024).toFixed(0)} KB` : 'SVG dieline'}</span>
                                    </span>
                                    {active && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-semibold text-violet-700">Open</span>}
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}
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
                className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/40 px-4 py-7 text-sm text-slate-600 transition hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50"
            >
                {busy ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
                <span className="font-medium">{busy ? 'Uploading…' : 'Upload images'}</span>
                <span className="text-xs text-slate-400">JPG, PNG or SVG · up to 10 MB · or drop here</span>
            </button>
            {error && <p className="rounded-md bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
            {imageAssets.length > 0 && (
                <div>
                    <h3 className="mb-2 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">Your image uploads</h3>
                    <div className="grid grid-cols-3 gap-2">
                        {imageAssets.map((a) => (
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
