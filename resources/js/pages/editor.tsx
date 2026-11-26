import { Head } from '@inertiajs/react';
import { useEffect } from 'react';
import { useEditorStore } from '@/store/useEditorStore';
import type { BoxParams } from '@/types/design';

type ProductItem = {
    id: number;
    name: string;
    slug: string;
    style: string;
    construction: 'folding' | 'rigid' | 'corrugated';
    default_params: BoxParams;
    glb_url: string | null;
    thumbnail: string | null;
};

interface EditorPageProps {
    products: ProductItem[];
    activeProduct: ProductItem | null;
}

export default function EditorPage({ products, activeProduct }: EditorPageProps) {
    const { activeSide, foldProgress, design, setActiveSide, setFoldProgress, setSource } = useEditorStore();

    useEffect(() => {
        if (activeProduct?.default_params) {
            setSource({ kind: 'parametric', params: activeProduct.default_params });
        }
    }, [activeProduct, setSource]);

    const params = design.source.kind === 'parametric' ? design.source.params : null;

    return (
        <>
            <Head title={activeProduct ? `${activeProduct.name} — Dieline Editor` : 'Dieline Editor'} />
            <div className="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-900">
                <aside className="flex w-80 flex-col border-r border-slate-200 bg-white p-4">
                    <h1 className="text-lg font-semibold text-slate-900">Dieline Generator</h1>
                    <p className="mt-1 text-xs text-slate-500">
                        {products.length} box templates loaded from MySQL
                    </p>
                    <div className="mt-4 space-y-2 overflow-y-auto">
                        {products.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSource({ kind: 'parametric', params: item.default_params })}
                                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                                    params?.style === item.style
                                        ? 'border-slate-900 bg-slate-900 text-white'
                                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                                }`}
                            >
                                <div className="font-medium">{item.name}</div>
                                <div className="text-xs opacity-75">{item.construction}</div>
                            </button>
                        ))}
                    </div>
                </aside>

                <main className="flex flex-1 flex-col items-center justify-center p-6">
                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-8 py-10 text-center shadow-xs">
                        <p className="text-sm font-medium text-slate-700">2D Dieline Canvas Ready</p>
                        {params && (
                            <p className="mt-2 text-xs text-slate-500">
                                Active Style: <span className="font-semibold">{params.style}</span> —{' '}
                                {params.length} × {params.width} × {params.depth} {params.unit}
                            </p>
                        )}
                    </div>
                </main>

                <aside className="flex w-80 flex-col gap-4 border-l border-slate-200 bg-white p-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                        3D Preview Viewport (R3F + Three.js Ready)
                    </div>
                    <div className="flex gap-2">
                        {(['outside', 'inside'] as const).map((side) => (
                            <button
                                key={side}
                                type="button"
                                onClick={() => setActiveSide(side)}
                                className={`flex-1 rounded-md py-1.5 text-xs font-medium capitalize ${
                                    activeSide === side ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                                }`}
                            >
                                {side}
                            </button>
                        ))}
                    </div>
                    <div>
                        <label className="flex justify-between text-xs font-medium text-slate-600">
                            <span>Fold Progress</span>
                            <span>{Math.round(foldProgress * 100)}%</span>
                        </label>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={foldProgress}
                            onChange={(e) => setFoldProgress(Number(e.target.value))}
                            className="mt-1 w-full"
                        />
                    </div>
                </aside>
            </div>
        </>
    );
}
