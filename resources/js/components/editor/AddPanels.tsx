import { ApiError, listUploads, MAX_UPLOAD_BYTES, UPLOAD_ACCEPT, uploadImage, type UploadedAsset } from '@/lib/api';
import { ensureFont, FONT_COMBOS, QUICK_TEXTS } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/useEditorStore';
import { Barcode, Circle, Loader2, Minus, QrCode, Square, Triangle, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
    BARCODE_FORMATS,
    generateBarcodeDataUrl,
    generateQrDataUrl,
    validateBarcodeInput,
    validateQrInput,
    type BarcodeFormat,
    type QrErrorCorrection,
} from './codes';
import { makeBarcode, makeImage, makeQr, makeShape, makeText, makeTextWith, type ShapeKind, type SheetFrame, type TextPreset } from './objects';

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
                className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/40 px-4 py-7 text-sm text-slate-600 transition hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50"
            >
                {busy ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
                <span className="font-medium">{busy ? 'Uploading…' : 'Upload images'}</span>
                <span className="text-xs text-slate-400">JPG, PNG or SVG · up to 10 MB · or drop here</span>
            </button>
            {error && <p className="rounded-md bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
            {assets.length > 0 && (
                <div>
                    <h3 className="mb-2 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">Your uploads</h3>
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

/* ------------------------------------------------------------------ */
/* QR & Barcodes                                                       */
/* ------------------------------------------------------------------ */

export function QrBarcodePanel({ sheet }: PanelProps) {
    const { side, addObject } = useAdd();
    const [mode, setMode] = useState<'qr' | 'barcode'>('qr');

    // QR state
    const [qrValue, setQrValue] = useState('https://example.com');
    const [qrEcc, setQrEcc] = useState<QrErrorCorrection>('M');
    const [qrColor, setQrColor] = useState('#0f172a');
    const [qrBg, setQrBg] = useState('#ffffff');

    // Barcode state
    const [format, setFormat] = useState<BarcodeFormat>('CODE128');
    const [barValue, setBarValue] = useState('PKG-2026-001');
    const [barColor, setBarColor] = useState('#0f172a');
    const [displayValue, setDisplayValue] = useState(true);

    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const formatInfo = BARCODE_FORMATS.find((f) => f.id === format) ?? BARCODE_FORMATS[0];

    const switchMode = (next: 'qr' | 'barcode') => {
        setMode(next);
        setError(null);
    };

    const addQr = async () => {
        if (!sheet) return;
        const msg = validateQrInput(qrValue);
        if (msg) {
            setError(msg);
            return;
        }
        setError(null);
        setBusy(true);
        try {
            const src = await generateQrDataUrl(qrValue, { color: qrColor, background: qrBg, ecc: qrEcc });
            addObject(side, makeQr({ src, value: qrValue.trim(), ecc: qrEcc, color: qrColor, background: qrBg }, side, sheet));
        } catch (e) {
            setError((e as Error).message || 'Could not generate QR code.');
        } finally {
            setBusy(false);
        }
    };

    const addBarcode = () => {
        if (!sheet) return;
        const msg = validateBarcodeInput(format, barValue);
        if (msg) {
            setError(msg);
            return;
        }
        setError(null);
        try {
            const { src, width, height } = generateBarcodeDataUrl(format, barValue, {
                lineColor: barColor,
                background: '#ffffff',
                displayValue,
            });
            addObject(
                side,
                makeBarcode(
                    { src, format, value: barValue.trim(), width, height, color: barColor, background: '#ffffff', displayValue },
                    side,
                    sheet,
                ),
            );
        } catch (e) {
            setError((e as Error).message || 'Invalid barcode value for the selected format.');
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                <button
                    type="button"
                    onClick={() => switchMode('qr')}
                    className={cn(
                        'flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition',
                        mode === 'qr' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900',
                    )}
                >
                    <QrCode className="size-3.5" />
                    QR Code
                </button>
                <button
                    type="button"
                    onClick={() => switchMode('barcode')}
                    className={cn(
                        'flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition',
                        mode === 'barcode' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900',
                    )}
                >
                    <Barcode className="size-3.5" />
                    Barcode
                </button>
            </div>

            {mode === 'qr' ? (
                <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-slate-600">URL or text</span>
                        <textarea
                            rows={2}
                            value={qrValue}
                            onChange={(e) => {
                                setQrValue(e.target.value);
                                if (error) setError(null);
                            }}
                            placeholder="https://yourbrand.com"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-400"
                        />
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-slate-600">Correction</span>
                            <select
                                value={qrEcc}
                                onChange={(e) => setQrEcc(e.target.value as QrErrorCorrection)}
                                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900"
                            >
                                <option value="L">L (7%)</option>
                                <option value="M">M (15%)</option>
                                <option value="Q">Q (25%)</option>
                                <option value="H">H (30%)</option>
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-slate-600">Modules</span>
                            <input
                                type="color"
                                value={qrColor}
                                onChange={(e) => setQrColor(e.target.value)}
                                className="h-8 w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-slate-600">Background</span>
                            <input
                                type="color"
                                value={qrBg}
                                onChange={(e) => setQrBg(e.target.value)}
                                className="h-8 w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
                            />
                        </label>
                    </div>

                    {error && (
                        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                            {error}
                        </p>
                    )}

                    <button
                        type="button"
                        disabled={!sheet || busy}
                        onClick={() => void addQr()}
                        className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-violet-600 disabled:opacity-40"
                    >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <QrCode className="size-3.5" />}
                        Add QR code
                    </button>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-slate-600">Barcode format</span>
                        <select
                            value={format}
                            onChange={(e) => {
                                const next = e.target.value as BarcodeFormat;
                                setFormat(next);
                                const info = BARCODE_FORMATS.find((f) => f.id === next);
                                if (info) setBarValue(info.placeholder);
                                setError(null);
                            }}
                            className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-900"
                        >
                            {BARCODE_FORMATS.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-slate-600">Code value</span>
                        <input
                            type="text"
                            value={barValue}
                            onChange={(e) => {
                                setBarValue(e.target.value);
                                if (error) setError(null);
                            }}
                            placeholder={formatInfo.placeholder}
                            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-violet-400"
                        />
                        <span className="text-[10.5px] text-slate-400">{formatInfo.hint}</span>
                    </label>

                    <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                            <input
                                type="checkbox"
                                checked={displayValue}
                                onChange={(e) => setDisplayValue(e.target.checked)}
                                className="rounded border-slate-300 text-violet-600"
                            />
                            Show text below bars
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                            Bars
                            <input
                                type="color"
                                value={barColor}
                                onChange={(e) => setBarColor(e.target.value)}
                                className="h-7 w-8 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
                            />
                        </label>
                    </div>

                    {error && (
                        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                            {error}
                        </p>
                    )}

                    <button
                        type="button"
                        disabled={!sheet}
                        onClick={addBarcode}
                        className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-violet-600 disabled:opacity-40"
                    >
                        <Barcode className="size-3.5" />
                        Add barcode
                    </button>
                </div>
            )}
        </div>
    );
}
