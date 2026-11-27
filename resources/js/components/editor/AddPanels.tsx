import { ApiError, listUploads, MAX_UPLOAD_BYTES, UPLOAD_ACCEPT, uploadImage, type Library, type UploadedAsset } from '@/lib/api';
import { ensureFont, FONT_COMBOS, QUICK_TEXTS } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { surfaceObjects, useEditorStore } from '@/store/useEditorStore';
import type { CanvasObject, DielineResult } from '@/types/design';
import { Barcode, Circle, Loader2, Minus, QrCode, Square, Trash2, Triangle, Upload } from 'lucide-react';
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
import ColorPicker from './ColorPicker';
import { DEFAULT_TILE_MM, iconSrc, loadLibrary, makeIcon, makePattern, patternTileSrc, sheetOutline } from './library';
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

const sectionTitle = 'mb-2 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase';

/** Shapes, plus the icon and pattern library admins manage in Filament (Library). */
export function ElementsPanel({ sheet, result }: PanelProps & { result?: DielineResult | null }) {
    const { side, addObject } = useAdd();
    const selectedPanelId = useEditorStore((s) => s.selectedPanelId);
    const setSelectedObjectIds = useEditorStore((s) => s.setSelectedObjectIds);
    const [library, setLibrary] = useState<Library | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [category, setCategory] = useState('All');

    useEffect(() => {
        let alive = true;
        loadLibrary()
            .then((l) => alive && setLibrary(l))
            .catch(() => alive && setError('Could not load the icon and pattern library.'));
        return () => {
            alive = false;
        };
    }, []);

    const panel = result?.panels.find((p) => p.id === selectedPanelId) ?? null;
    const categories = ['All', ...new Set((library?.icons ?? []).map((i) => i.category).filter((c): c is string => !!c))];
    const icons = (library?.icons ?? []).filter((i) => category === 'All' || i.category === category);

    return (
        <div className="flex flex-col gap-5">
            <section>
                <h3 className={sectionTitle}>Shapes</h3>
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
            </section>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
            {!library && !error && (
                <p className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="size-3.5 animate-spin" /> Loading icons and patterns…
                </p>
            )}

            {library && library.icons.length > 0 && (
                <section>
                    <h3 className={sectionTitle}>Icons</h3>
                    {categories.length > 2 && (
                        <div className="mb-2 flex flex-wrap gap-1">
                            {categories.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setCategory(c)}
                                    className={cn(
                                        'rounded-full px-2.5 py-1 text-[11px] font-medium transition',
                                        category === c ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                                    )}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="grid grid-cols-4 gap-2">
                        {icons.map((icon) => (
                            <button
                                key={icon.id}
                                type="button"
                                title={icon.name}
                                aria-label={`Add icon: ${icon.name}`}
                                disabled={!sheet}
                                onClick={() => sheet && addObject(side, makeIcon(icon, side, sheet))}
                                className="flex aspect-square items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md hover:shadow-violet-100 disabled:opacity-40"
                            >
                                <img src={icon.src} alt="" className="size-full object-contain" />
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {library && library.patterns.length > 0 && (
                <section>
                    <h3 className={sectionTitle}>Patterns</h3>
                    <p className="mb-2 text-[11px] text-slate-500">
                        Adds to <span className="font-semibold text-slate-700">{panel ? panel.name : 'the whole box'}</span>.{' '}
                        {panel ? 'Click empty space on the canvas for the whole box.' : 'Click a panel first to pattern just that panel.'}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {library.patterns.map((pattern) => (
                            <button
                                key={pattern.id}
                                type="button"
                                title={pattern.name}
                                aria-label={`Add pattern: ${pattern.name}`}
                                disabled={!sheet}
                                onClick={() => {
                                    if (!sheet) return;
                                    // Behind the rest of the artwork; patterns are edited in the list below, not on the canvas.
                                    addObject(side, makePattern(pattern, side, sheet, panel, sheetOutline(result, sheet)), 'back');
                                    setSelectedObjectIds([]);
                                }}
                                className="group flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-1.5 text-[10.5px] font-medium text-slate-600 transition hover:-translate-y-0.5 hover:border-violet-300 hover:text-violet-700 disabled:opacity-40"
                            >
                                <span
                                    className="block h-12 w-full rounded-lg border border-slate-100"
                                    style={{ backgroundImage: `url("${pattern.src}")`, backgroundSize: '20px', backgroundRepeat: 'repeat' }}
                                />
                                <span className="truncate">{pattern.name}</span>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            <SideObjects result={result ?? null} />
        </div>
    );
}

const SHAPE_NAMES: Record<string, string> = { rect: 'Square', rounded: 'Rounded square', circle: 'Circle', triangle: 'Triangle', line: 'Line' };

/** What a layer is called in the list. */
function objectLabel(o: CanvasObject): { name: string; kind: string } {
    const p = o.props;
    switch (o.type) {
        case 'text':
            return {
                name:
                    String(p.text ?? 'Text')
                        .replace(/\s+/g, ' ')
                        .slice(0, 28) || 'Text',
                kind: Number(p.curve ?? 0) ? 'Curved text' : 'Text',
            };
        case 'icon':
            return { name: String(p.name ?? 'Icon'), kind: 'Icon' };
        case 'shape':
            return { name: SHAPE_NAMES[String(p.shape)] ?? 'Shape', kind: 'Shape' };
        case 'image':
            return { name: String(p.name ?? 'Image'), kind: 'Image' };
        case 'qr':
            return { name: String(p.value ?? 'QR code').slice(0, 28), kind: 'QR code' };
        case 'barcode':
            return { name: String(p.value ?? 'Barcode'), kind: `Barcode ${String(p.format ?? '')}`.trim() };
        case 'group':
            return { name: `Group of ${Array.isArray(p.children) ? p.children.length : 0}`, kind: 'Group' };
        case 'pattern':
            return { name: String(p.name ?? 'Pattern'), kind: 'Pattern' };
        default:
            return { name: o.type, kind: o.type };
    }
}

/** Small preview of a layer. */
function ObjectThumb({ o }: { o: CanvasObject }) {
    const p = o.props;
    const box = 'flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white';
    if (o.type === 'pattern') return <span className={box} style={{ backgroundImage: `url("${patternTileSrc(o)}")`, backgroundSize: '14px' }} />;
    if (o.type === 'icon')
        return (
            <span className={box}>
                <img src={iconSrc(o)} alt="" className="size-5 object-contain" />
            </span>
        );
    if (o.type === 'image' || o.type === 'qr' || o.type === 'barcode')
        return (
            <span className={box}>
                <img src={String(p.src ?? '')} alt="" className="size-full object-contain" />
            </span>
        );
    if (o.type === 'text')
        return (
            <span className={cn(box, 'text-sm font-bold')} style={{ color: String(p.fill ?? '#0f172a') }}>
                T
            </span>
        );
    if (o.type === 'shape')
        return (
            <span className={box}>
                <span
                    className={cn(
                        'block size-4',
                        p.shape === 'circle' && 'rounded-full',
                        p.shape === 'rounded' && 'rounded',
                        p.shape === 'line' && 'h-0.5',
                    )}
                    style={{ backgroundColor: String(p.shape === 'line' ? (p.stroke ?? '#0f172a') : (p.fill ?? '#6366f1')) }}
                />
            </span>
        );
    return <span className={cn(box, 'text-[10px] font-semibold text-slate-500')}>{o.type.slice(0, 3)}</span>;
}

/**
 * Everything on the visible sheet (top layer first): click to select it on the canvas, remove
 * it, and for patterns (not clickable on the canvas) change tile size, colour and opacity.
 */
function SideObjects({ result }: { result: DielineResult | null }) {
    const side = useEditorStore((s) => s.activeSide);
    // Select the stored list (a stable reference): a selector returning a new array loops React.
    const objects = useEditorStore((s) => surfaceObjects(s.design, s.activePart, side));
    const selectedIds = useEditorStore((s) => s.selectedObjectIds);
    const setSelectedObjectIds = useEditorStore((s) => s.setSelectedObjectIds);
    const updateObjects = useEditorStore((s) => s.updateObjects);
    const removeObjects = useEditorStore((s) => s.removeObjects);

    const set = (o: CanvasObject, props: Record<string, unknown>) => updateObjects(side, [{ id: o.id, props }]);
    const scopeName = (o: CanvasObject) => (o.panelId ? (result?.panels.find((p) => p.id === o.panelId)?.name ?? 'Panel') : 'Whole box');
    const layers = [...objects].reverse();

    return (
        <section>
            <h3 className={sectionTitle}>
                On this side <span className="font-semibold text-slate-300">· {objects.length}</span>
            </h3>
            {!layers.length && <p className="text-xs text-slate-500">Nothing added yet. Shapes, icons, text and patterns you add show up here.</p>}
            <ul className="flex flex-col gap-1.5">
                {layers.map((o) => {
                    const { name, kind } = objectLabel(o);
                    const selected = selectedIds.includes(o.id);
                    const pattern = o.type === 'pattern';
                    return (
                        <li
                            key={o.id}
                            className={cn(
                                'rounded-xl border p-2 transition',
                                selected ? 'border-violet-400 bg-violet-50/60' : 'border-slate-200 bg-slate-50/60',
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={pattern}
                                    onClick={() => setSelectedObjectIds([o.id])}
                                    title={pattern ? 'Patterns are edited here' : 'Select on the canvas'}
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                                >
                                    <ObjectThumb o={o} />
                                    <span className="min-w-0 leading-tight">
                                        <span className="block truncate text-xs font-semibold text-slate-800">{name}</span>
                                        <span className="block text-[10.5px] text-slate-500">
                                            {kind}
                                            {pattern ? ` · ${scopeName(o)}` : ''}
                                            {o.effect && o.effect !== 'none' ? ` · ${o.effect}` : ''}
                                            {o.locked ? ' · locked' : ''}
                                        </span>
                                    </span>
                                </button>
                                {pattern && typeof o.props.tileSvg === 'string' && o.props.tileSvg && (
                                    <ColorPicker label="" value={String(o.props.fill ?? '#0f172a')} onChange={(v) => set(o, { fill: v })} />
                                )}
                                <button
                                    type="button"
                                    aria-label={`Remove ${name}`}
                                    onClick={() => removeObjects(side, [o.id])}
                                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </div>
                            {pattern && (
                                <>
                                    <label className="mt-2 flex items-center gap-2 text-[10.5px] text-slate-500">
                                        <span className="w-14">Tile size</span>
                                        <input
                                            type="range"
                                            min={4}
                                            max={80}
                                            step={1}
                                            value={Number(o.props.tileMm ?? DEFAULT_TILE_MM)}
                                            onChange={(e) => set(o, { tileMm: Number(e.target.value) })}
                                            className="h-1.5 flex-1 accent-violet-600"
                                        />
                                        <span className="w-10 text-right tabular-nums">{Number(o.props.tileMm ?? DEFAULT_TILE_MM)} mm</span>
                                    </label>
                                    <label className="mt-1 flex items-center gap-2 text-[10.5px] text-slate-500">
                                        <span className="w-14">Opacity</span>
                                        <input
                                            type="range"
                                            min={0.05}
                                            max={1}
                                            step={0.05}
                                            value={Number(o.props.opacity ?? 1)}
                                            onChange={(e) => set(o, { opacity: Number(e.target.value) })}
                                            className="h-1.5 flex-1 accent-violet-600"
                                        />
                                        <span className="w-10 text-right tabular-nums">{Math.round(Number(o.props.opacity ?? 1) * 100)}%</span>
                                    </label>
                                </>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
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
