import { fromMm, generateDieline, isStyleSupported, round, toMm } from '@/lib/dieline';
import { parseUploadedDielineFile, scaleUploadedDieline } from '@/lib/dieline/upload';
import { MATERIAL_COLORS, materialOptions, useMaterialsVersion } from '@/lib/three/materials';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/useEditorStore';
import type { BoxParams, DielineResult } from '@/types/design';
import { Clock3, Palette, Scissors, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ProductItem } from './types';

type Props = {
    products: ProductItem[];
    params: BoxParams | null;
    errors: string[];
    onPickProduct: (product: ProductItem) => void;
};

type DimKey = 'length' | 'width' | 'depth' | 'thickness';

type RigidKey = 'boardThickness' | 'turnIn' | 'lidDepth' | 'lidClearance';
const RIGID_FIELDS: { key: RigidKey; label: string; fallback: (p: BoxParams) => number }[] = [
    { key: 'boardThickness', label: 'Chipboard', fallback: (p) => p.thickness },
    { key: 'turnIn', label: 'Turn-in', fallback: () => 18 },
    { key: 'lidDepth', label: 'Lid depth', fallback: (p) => Math.round(p.depth / 2) },
    { key: 'lidClearance', label: 'Clearance', fallback: () => 1.5 },
];

const FIELDS: { key: DimKey; label: string; short: string }[] = [
    { key: 'length', label: 'Length', short: 'L' },
    { key: 'width', label: 'Width', short: 'W' },
    { key: 'depth', label: 'Depth', short: 'D' },
    { key: 'thickness', label: 'Board', short: 'T' },
];

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
    return (
        <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">{children}</h3>
            {aside}
        </div>
    );
}

/** A number input that only commits on blur / Enter, so typing does not flood the undo history. */
function DimensionInput({
    label,
    short,
    value,
    unit,
    onCommit,
}: {
    label: string;
    short?: string;
    value: number;
    unit: string;
    onCommit: (v: number) => void;
}) {
    const [text, setText] = useState(String(value));
    useEffect(() => setText(String(value)), [value]);

    const commit = () => {
        const n = Number(text);
        if (Number.isFinite(n) && n !== value) onCommit(n);
        else setText(String(value));
    };

    return (
        <label className="group flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-slate-500">{label}</span>
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 transition focus-within:border-violet-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100 hover:border-slate-300">
                {short && <span className="text-[10px] font-bold text-violet-500">{short}</span>}
                <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className="w-full min-w-0 bg-transparent py-2 text-sm font-semibold text-slate-900 tabular-nums outline-none"
                />
                <span className="text-[11px] text-slate-400">{unit}</span>
            </div>
        </label>
    );
}

/** The style's real dieline (from the engine) as a tiny line drawing. */
function MiniDieline({ result, active }: { result: DielineResult; active: boolean }) {
    const { width: W, height: H } = result.overallSize;
    return (
        <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
            {result.panels.map((p) => (
                <polygon
                    key={p.id}
                    points={p.polygon.map((q) => `${q.x},${q.y}`).join(' ')}
                    className={active ? 'fill-violet-500/10' : 'fill-white'}
                />
            ))}
            {result.creasePaths.map((d, i) => (
                <path
                    key={i}
                    d={d}
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={0.8}
                    strokeDasharray="2 2"
                    className={active ? 'stroke-violet-400' : 'stroke-slate-300'}
                />
            ))}
            <path
                d={result.cutPath}
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeWidth={1.2}
                className={active ? 'stroke-violet-600' : 'stroke-slate-500'}
            />
        </svg>
    );
}

/**
 * Size of an uploaded dieline and the unit it was read in, with the parser's warnings. When the
 * unit was a guess (pixels, or no unit at all) the customer types the real width and the whole
 * drawing is rescaled (plan: "units se asli size; user ek dimension confirm kare").
 */
function UploadedSize() {
    const source = useEditorStore((s) => s.design.source);
    const setSource = useEditorStore((s) => s.setSource);
    const [draft, setDraft] = useState('');
    if (source.kind !== 'uploaded-dieline' || !source.widthMm || !source.heightMm) return null;
    const width = source.widthMm;
    const height = source.heightMm;

    // Once the customer has checked the size, the "check the size" warnings are done with.
    const sizeSettled = () => (source.warnings ?? []).filter((w) => !w.includes('Check the size below'));

    const confirm = (realWidth: number) => {
        if (!(realWidth > 0)) return;
        setSource({ ...scaleUploadedDieline(source, realWidth / width), scaleConfirmed: true, warnings: sizeSettled() });
        setDraft('');
    };

    return (
        <div
            className={cn(
                'mt-2.5 rounded-2xl border p-3 text-xs',
                source.scaleConfirmed ? 'border-slate-200 bg-slate-50/70' : 'border-amber-300 bg-amber-50',
            )}
        >
            <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">Size</span>
                <span className="text-slate-600 tabular-nums">
                    {round(width, 1)} × {round(height, 1)} mm
                </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
                Read in {source.unit ?? 'mm'} · {source.panels.length} panel{source.panels.length === 1 ? '' : 's'}
                {source.foldMapped ? ' · folds mapped' : ''}
            </p>
            {(source.warnings ?? []).map((w) => (
                <p key={w} className="mt-1.5 text-[11px] text-amber-800">
                    {w}
                </p>
            ))}
            <form
                className="mt-2 flex items-center gap-1.5"
                onSubmit={(e) => {
                    e.preventDefault();
                    confirm(Number(draft));
                }}
            >
                <input
                    type="number"
                    min={1}
                    step="0.1"
                    inputMode="decimal"
                    aria-label="Real width in mm"
                    placeholder={`Real width (${round(width, 1)} mm)`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs tabular-nums"
                />
                <button
                    type="submit"
                    disabled={!(Number(draft) > 0)}
                    className="h-8 shrink-0 rounded-lg bg-slate-900 px-2.5 text-[11px] font-semibold text-white disabled:opacity-40"
                >
                    Rescale
                </button>
                {!source.scaleConfirmed && (
                    <button
                        type="button"
                        onClick={() => setSource({ ...source, scaleConfirmed: true, warnings: sizeSettled() })}
                        className="h-8 shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700"
                    >
                        Size is right
                    </button>
                )}
            </form>
        </div>
    );
}

export default function BoxSettings({ products, params, errors, onPickProduct }: Props) {
    const updateParams = useEditorStore((s) => s.updateParams);
    const source = useEditorStore((s) => s.design.source);
    const setSource = useEditorStore((s) => s.setSource);
    const lineTaggingMode = useEditorStore((s) => s.lineTaggingMode);
    const setLineTaggingMode = useEditorStore((s) => s.setLineTaggingMode);
    const material = useEditorStore((s) => s.design.material);
    // Admin materials (Filament → Library) replace the built-in list once they have loaded.
    useMaterialsVersion();
    const setMaterial = useEditorStore((s) => s.setMaterial);
    const dielineInputRef = useRef<HTMLInputElement>(null);
    const [dielineError, setDielineError] = useState<string | null>(null);

    const onUploadDieline = async (file: File | undefined) => {
        if (!file) return;
        setDielineError(null);
        try {
            const parsed = await parseUploadedDielineFile(file);
            setSource({ kind: 'uploaded-dieline', ...parsed });
            setLineTaggingMode(true);
        } catch (e) {
            setDielineError((e as Error).message || 'Could not parse dieline file.');
        } finally {
            if (dielineInputRef.current) dielineInputRef.current.value = '';
        }
    };

    // Previews of every style from its default size (cheap: a few ms for all of them).
    const previews = useMemo(() => {
        const map = new Map<number, DielineResult>();
        for (const p of products) {
            if (!isStyleSupported(p.default_params.style)) continue;
            try {
                map.set(p.id, generateDieline(p.default_params));
            } catch {
                // An invalid seeded size just shows no preview.
            }
        }
        return map;
    }, [products]);

    const switchUnit = (unit: 'mm' | 'in') => {
        if (!params || params.unit === unit) return;
        const convert = (v: number) => round(fromMm(toMm(v, params.unit), unit), unit === 'in' ? 3 : 1);
        updateParams({
            unit,
            length: convert(params.length),
            width: convert(params.width),
            depth: convert(params.depth),
            thickness: convert(params.thickness),
        });
    };

    return (
        <div className="flex flex-col gap-7">
            <section>
                <SectionTitle aside={<span className="text-[11px] text-slate-400">{previews.size} ready</span>}>Box style</SectionTitle>
                <div className="grid grid-cols-2 gap-2.5">
                    {products.map((product) => {
                        const active = params?.style === product.style;
                        const preview = previews.get(product.id);
                        return (
                            <button
                                key={product.id}
                                type="button"
                                onClick={() => onPickProduct(product)}
                                className={cn(
                                    'group relative flex flex-col overflow-hidden rounded-2xl border text-left transition',
                                    active
                                        ? 'border-violet-500 bg-violet-50/60 shadow-[0_0_0_3px_rgba(139,92,246,0.15)]'
                                        : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/80',
                                )}
                            >
                                <div className={cn('flex h-[74px] items-center justify-center p-2', active ? 'bg-violet-100/50' : 'bg-slate-50')}>
                                    {preview ? (
                                        <MiniDieline result={preview} active={active} />
                                    ) : (
                                        <span className="flex flex-col items-center gap-1 text-slate-300">
                                            <Clock3 className="size-5" />
                                        </span>
                                    )}
                                </div>
                                <div className="px-2.5 py-2">
                                    <div className={cn('truncate text-xs font-semibold', active ? 'text-violet-900' : 'text-slate-800')}>
                                        {product.name}
                                    </div>
                                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500 capitalize">
                                        {product.construction}
                                        {!preview && (
                                            <span className="rounded-full bg-slate-100 px-1.5 py-px text-[9px] font-semibold tracking-wide text-slate-500 uppercase">
                                                Soon
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section>
                <SectionTitle>Custom dieline (SVG / DXF)</SectionTitle>
                <input
                    ref={dielineInputRef}
                    type="file"
                    accept=".svg,.dxf,image/svg+xml"
                    className="hidden"
                    onChange={(e) => void onUploadDieline(e.target.files?.[0])}
                />
                <button
                    type="button"
                    onClick={() => dielineInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-violet-400 hover:bg-violet-50/50 hover:text-violet-700"
                >
                    <Upload className="size-3.5" />
                    Upload custom dieline
                </button>
                {dielineError && <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">{dielineError}</p>}
                {source.kind === 'uploaded-dieline' && <UploadedSize />}
                {source.kind === 'uploaded-dieline' && (
                    <div className="mt-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-800">Line tagging</span>
                            <span className="text-[11px] text-slate-500 tabular-nums">
                                {(source.lines ?? []).filter((l) => l.tag === 'cut').length} cut ·{' '}
                                {(source.lines ?? []).filter((l) => l.tag === 'fold').length} fold
                            </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                            Enable tagging, then click any line on the canvas to switch it between Cut (solid) and Fold (dashed).
                        </p>
                        <button
                            type="button"
                            aria-pressed={lineTaggingMode}
                            onClick={() => setLineTaggingMode(!lineTaggingMode)}
                            className={cn(
                                'mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition',
                                lineTaggingMode
                                    ? 'bg-rose-600 text-white shadow-sm'
                                    : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                            )}
                        >
                            <Scissors className="size-3.5" />
                            {lineTaggingMode ? 'Tagging active (click lines)' : 'Tag cut / fold lines'}
                        </button>
                    </div>
                )}
            </section>

            {params && (
                <section>
                    <SectionTitle
                        aside={
                            <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
                                {(['mm', 'in'] as const).map((u) => (
                                    <button
                                        key={u}
                                        type="button"
                                        onClick={() => switchUnit(u)}
                                        className={cn(
                                            'rounded-md px-2.5 py-0.5 transition',
                                            params.unit === u ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                                        )}
                                    >
                                        {u}
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        Inside size
                    </SectionTitle>
                    <div className="grid grid-cols-2 gap-2.5">
                        {FIELDS.map((f) => (
                            <DimensionInput
                                key={f.key}
                                label={f.label}
                                short={f.short}
                                value={params[f.key]}
                                unit={params.unit}
                                onCommit={(v) => updateParams({ [f.key]: v })}
                            />
                        ))}
                    </div>
                    {params.construction === 'rigid' && (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                            <div className="mb-2.5 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">Rigid construction</div>
                            <div className="grid grid-cols-2 gap-2.5">
                                {RIGID_FIELDS.map((f) => (
                                    <DimensionInput
                                        key={f.key}
                                        label={f.label}
                                        value={Number(params.rigid?.[f.key] ?? f.fallback(params))}
                                        unit={params.unit}
                                        onCommit={(v) =>
                                            updateParams({
                                                rigid: { boardThickness: params.thickness, turnIn: 18, ...params.rigid, [f.key]: v },
                                            })
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                    {errors.length > 0 && (
                        <ul className="mt-3 space-y-1 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                            {errors.map((e) => (
                                <li key={e}>{e}</li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            <section>
                <SectionTitle>Board material</SectionTitle>
                <div className="grid grid-cols-4 gap-2">
                    {materialOptions(params?.construction).map((m) => {
                        const active = material === m.value;
                        return (
                            <button
                                key={m.value}
                                type="button"
                                onClick={() => setMaterial(m.value)}
                                className="group flex flex-col items-center gap-1.5"
                            >
                                <span
                                    className={cn(
                                        'size-11 rounded-full border shadow-inner transition',
                                        active ? 'ring-2 ring-violet-500 ring-offset-2' : 'border-slate-200 group-hover:scale-105',
                                        m.value === 'transparent' &&
                                            'bg-[repeating-conic-gradient(#e2e8f0_0%_25%,#fff_0%_50%)] bg-[length:10px_10px]',
                                    )}
                                    style={m.value === 'transparent' ? undefined : { backgroundColor: MATERIAL_COLORS[m.value].outside }}
                                />
                                <span className={cn('text-[11px]', active ? 'font-semibold text-slate-900' : 'text-slate-500')}>{m.label}</span>
                            </button>
                        );
                    })}
                    {/* Any other material value is a custom board colour (#rrggbb). */}
                    <label className="group flex cursor-pointer flex-col items-center gap-1.5">
                        <span
                            className={cn(
                                'relative flex size-11 items-center justify-center rounded-full border transition',
                                material.startsWith('#') ? 'ring-2 ring-violet-500 ring-offset-2' : 'border-slate-200 group-hover:scale-105',
                            )}
                            style={{
                                background: material.startsWith('#')
                                    ? material
                                    : 'conic-gradient(#f43f5e, #f59e0b, #10b981, #3b82f6, #8b5cf6, #f43f5e)',
                            }}
                        >
                            {!material.startsWith('#') && <Palette className="size-4 text-white drop-shadow" />}
                            <input
                                type="color"
                                aria-label="Custom board colour"
                                value={material.startsWith('#') ? material : '#e5e7eb'}
                                onChange={(e) => setMaterial(e.target.value)}
                                className="absolute inset-0 cursor-pointer opacity-0"
                            />
                        </span>
                        <span className={cn('text-[11px]', material.startsWith('#') ? 'font-semibold text-slate-900' : 'text-slate-500')}>
                            Custom
                        </span>
                    </label>
                </div>
            </section>
        </div>
    );
}
