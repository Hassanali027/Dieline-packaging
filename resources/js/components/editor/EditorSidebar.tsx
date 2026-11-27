import { cn } from '@/lib/utils';
import { useEditorStore, type EditorTab } from '@/store/useEditorStore';
import { Lightbulb, Package, QrCode, Shapes, Type, Upload, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const TABS: { id: EditorTab; label: string; title: string; hint: string; icon: LucideIcon; comingIn?: string }[] = [
    { id: 'box', label: 'Box', title: 'Box setup', hint: 'Style, size and board', icon: Package },
    { id: 'uploads', label: 'Uploads', title: 'Uploads', hint: 'Your logos and artwork', icon: Upload },
    { id: 'elements', label: 'Elements', title: 'Elements', hint: 'Shapes to build with', icon: Shapes },
    { id: 'text', label: 'Text', title: 'Text', hint: 'Headings, combos, quick text', icon: Type },
    {
        id: 'inspirations',
        label: 'Ideas',
        title: 'Ideas',
        hint: 'Ready-made looks',
        icon: Lightbulb,
        comingIn: 'Ready-made design ideas arrive after the MVP.',
    },
    {
        id: 'qr',
        label: 'QR',
        title: 'QR & barcodes',
        hint: 'Scannable codes',
        icon: QrCode,
        comingIn: 'QR codes and 9 barcode formats arrive in Sprint 3 (Week 6–7).',
    },
];

/** Dark tool rail plus the panel of the active tool. Tools without a panel say when they arrive. */
export default function EditorSidebar({ panels }: { panels: Partial<Record<EditorTab, ReactNode>> }) {
    const activeTab = useEditorStore((s) => s.activeTab);
    const setActiveTab = useEditorStore((s) => s.setActiveTab);
    const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];
    const panel = panels[tab.id];

    return (
        <aside className="flex h-full shrink-0">
            <nav className="flex w-[76px] flex-col items-center gap-1.5 bg-slate-950 py-4" aria-label="Editor tools">
                {TABS.map(({ id, label, icon: Icon }) => {
                    const active = activeTab === id;
                    return (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setActiveTab(id)}
                            aria-pressed={active}
                            className={cn(
                                'group relative flex w-[60px] flex-col items-center gap-1 rounded-2xl py-2.5 text-[10.5px] font-medium transition',
                                active ? 'text-white' : 'text-slate-400 hover:text-white',
                            )}
                        >
                            {active && <span className="absolute top-1/2 -left-2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-violet-400" />}
                            <span
                                className={cn(
                                    'flex size-10 items-center justify-center rounded-xl transition',
                                    active
                                        ? 'bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-900/50'
                                        : 'bg-white/[0.04] group-hover:bg-white/10',
                                )}
                            >
                                <Icon className="size-[19px]" strokeWidth={active ? 2.2 : 1.8} />
                            </span>
                            {label}
                        </button>
                    );
                })}
            </nav>
            <div className="flex w-[300px] flex-col border-r border-slate-200/80 bg-white">
                <div className="border-b border-slate-100 px-5 pt-5 pb-4">
                    <h2 className="text-[15px] font-bold tracking-tight text-slate-900">{tab.title}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">{tab.hint}</p>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
                    {panel ?? (
                        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-8 text-center">
                            <span className="flex size-11 items-center justify-center rounded-2xl bg-white text-violet-500 shadow-sm">
                                <tab.icon className="size-5" />
                            </span>
                            <p className="text-xs leading-relaxed text-slate-500">{tab.comingIn}</p>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}
