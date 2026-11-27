import { fromMm, isStyleSupported, round, toMm } from '@/lib/dieline';
import { MATERIAL_OPTIONS } from '@/lib/three/materials';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/useEditorStore';
import type { BoxParams } from '@/types/design';
import { useEffect, useState } from 'react';
import type { ProductItem } from './types';

type Props = {
    products: ProductItem[];
    params: BoxParams | null;
    errors: string[];
    onPickProduct: (product: ProductItem) => void;
};

type DimKey = 'length' | 'width' | 'depth' | 'thickness';

const FIELDS: { key: DimKey; label: string }[] = [
    { key: 'length', label: 'Length' },
    { key: 'width', label: 'Width' },
    { key: 'depth', label: 'Depth' },
    { key: 'thickness', label: 'Board' },
];

/** A number input that only commits on blur / Enter, so typing does not flood the undo history. */
function DimensionInput({ label, value, unit, onCommit }: { label: string; value: number; unit: string; onCommit: (v: number) => void }) {
    const [text, setText] = useState(String(value));
    useEffect(() => setText(String(value)), [value]);

    const commit = () => {
        const n = Number(text);
        if (Number.isFinite(n) && n !== value) onCommit(n);
        else setText(String(value));
    };

    return (
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            {label}
            <div className="flex items-center rounded-md border border-slate-200 bg-white focus-within:border-slate-400">
                <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className="w-full min-w-0 bg-transparent px-2 py-1.5 text-sm text-slate-900 outline-none"
                />
                <span className="pr-2 text-[11px] text-slate-400">{unit}</span>
            </div>
        </label>
    );
}

export default function BoxSettings({ products, params, errors, onPickProduct }: Props) {
    const updateParams = useEditorStore((s) => s.updateParams);
    const material = useEditorStore((s) => s.design.material);
    const setMaterial = useEditorStore((s) => s.setMaterial);

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
        <div className="flex flex-col gap-5">
            <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Box style</h3>
                <div className="grid grid-cols-2 gap-2">
                    {products.map((product) => {
                        const active = params?.style === product.style;
                        const ready = isStyleSupported(product.default_params.style);
                        return (
                            <button
                                key={product.id}
                                type="button"
                                onClick={() => onPickProduct(product)}
                                className={cn(
                                    'rounded-lg border px-2.5 py-2 text-left text-xs transition',
                                    active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 hover:bg-slate-100',
                                )}
                            >
                                <div className="font-medium">{product.name}</div>
                                <div className={cn('mt-0.5 text-[10px]', active ? 'text-slate-300' : 'text-slate-500')}>
                                    {product.construction}
                                    {!ready && ' · soon'}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </section>

            {params && (
                <section>
                    <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Inside size</h3>
                        <div className="flex rounded-md bg-slate-100 p-0.5 text-[11px] font-medium">
                            {(['mm', 'in'] as const).map((u) => (
                                <button
                                    key={u}
                                    type="button"
                                    onClick={() => switchUnit(u)}
                                    className={cn('rounded px-2 py-0.5', params.unit === u ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500')}
                                >
                                    {u}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {FIELDS.map((f) => (
                            <DimensionInput
                                key={f.key}
                                label={f.label}
                                value={params[f.key]}
                                unit={params.unit}
                                onCommit={(v) => updateParams({ [f.key]: v })}
                            />
                        ))}
                    </div>
                    {errors.length > 0 && (
                        <ul className="mt-2 space-y-1 rounded-md bg-rose-50 p-2 text-xs text-rose-700">
                            {errors.map((e) => (
                                <li key={e}>{e}</li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Material</h3>
                <div className="flex flex-wrap gap-2">
                    {MATERIAL_OPTIONS.map((m) => (
                        <button
                            key={m.value}
                            type="button"
                            onClick={() => setMaterial(m.value)}
                            className={cn(
                                'rounded-md border px-3 py-1.5 text-xs font-medium',
                                material === m.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:bg-slate-50',
                            )}
                        >
                            {m.label}
                        </button>
                    ))}
                    {/* Any other value of `material` is a custom board colour (#rrggbb). */}
                    <label
                        className={cn(
                            'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
                            material.startsWith('#') ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:bg-slate-50',
                        )}
                    >
                        <input
                            type="color"
                            aria-label="Custom board colour"
                            value={material.startsWith('#') ? material : '#e5e7eb'}
                            onChange={(e) => setMaterial(e.target.value)}
                            className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                        Custom
                    </label>
                </div>
            </section>
        </div>
    );
}
