import { extractPart, fromMm, generateDieline, isStyleSupported, round, toMm } from '@/lib/dieline';
import { MATERIAL_COLORS, MATERIAL_OPTIONS } from '@/lib/three/materials';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/useEditorStore';
import type { BoxParams, DielineResult } from '@/types/design';
import { Clock3, Palette } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
    const miniParts = result.parts?.length ? result.parts.map((part) => extractPart(result, part)) : [result];
    const isDrawerBox = result.parts?.includes('drawer') && result.parts.includes('sleeve');
    const gap = result.parts?.length ? (isDrawerBox ? Math.max(55, result.overallSize.width * 0.3) : Math.max(18, result.overallSize.width * 0.08)) : 0;
    const W = miniParts.reduce((sum, part) => sum + part.overallSize.width, 0) + gap * (miniParts.length - 1);
    const H = Math.max(...miniParts.map((part) => part.overallSize.height));
    // The preview uses non-scaling SVG strokes, so a small millimetre-based viewBox
    // inset can be less than one screen pixel and clip the outer cut edge. Keep a
    // visible gutter around the entire net, especially the final part on the right.
    const padding = Math.max(24, Math.max(W, H) * 0.03);
    let x = 0;
    return (
        <svg viewBox={`${-padding} ${-padding} ${W + padding * 2} ${H + padding * 2}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
            {miniParts.map((part, index) => {
                const offset = x;
                x += part.overallSize.width + gap;
                const y = (H - part.overallSize.height) / 2;
                return <g key={result.parts?.[index] ?? 'main'} transform={`translate(${offset} ${y})`}>
                    {part.panels.map((panel) => <polygon key={panel.id} points={panel.polygon.map((q) => `${q.x},${q.y}`).join(' ')} className={active ? 'fill-violet-500/10' : 'fill-white'} />)}
                    {part.creasePaths.map((d, i) => <path key={i} d={d} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={0.8} strokeDasharray="2 2" className={active ? 'stroke-violet-400' : 'stroke-slate-300'} />)}
                    <path d={part.cutPath} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={1.2} className={active ? 'stroke-violet-600' : 'stroke-slate-500'} />
                </g>;
            })}
        </svg>
    );
}

export default function BoxSettings({ products, params, errors, onPickProduct }: Props) {
    const updateParams = useEditorStore((s) => s.updateParams);
    const material = useEditorStore((s) => s.design.material);
    const setMaterial = useEditorStore((s) => s.setMaterial);

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
                    {MATERIAL_OPTIONS.map((m) => {
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
