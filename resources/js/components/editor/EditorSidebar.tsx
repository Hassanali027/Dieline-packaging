import { cn } from '@/lib/utils';
import { useEditorStore, type EditorTab } from '@/store/useEditorStore';
import { Lightbulb, Package, QrCode, Shapes, Type, Upload, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const TABS: { id: EditorTab; label: string; icon: LucideIcon; comingIn?: string }[] = [
    { id: 'box', label: 'Box', icon: Package },
    { id: 'uploads', label: 'Uploads', icon: Upload },
    { id: 'elements', label: 'Elements', icon: Shapes },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'inspirations', label: 'Ideas', icon: Lightbulb, comingIn: 'Ready-made design ideas, after the MVP.' },
    { id: 'qr', label: 'QR', icon: QrCode, comingIn: 'Sprint 3 (Week 6–7): QR codes and 9 barcode formats.' },
];

/** Left tool rail plus the panel of the active tab. Tabs without a panel show what is coming. */
export default function EditorSidebar({ panels }: { panels: Partial<Record<EditorTab, ReactNode>> }) {
    const activeTab = useEditorStore((s) => s.activeTab);
    const setActiveTab = useEditorStore((s) => s.setActiveTab);
    const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];
    const panel = panels[tab.id];

    return (
        <aside className="flex h-full shrink-0 border-r border-slate-200 bg-white">
            <nav className="flex w-16 flex-col items-center gap-1 border-r border-slate-100 py-3" aria-label="Editor tools">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setActiveTab(id)}
                        aria-pressed={activeTab === id}
                        className={cn(
                            'flex w-14 flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium transition',
                            activeTab === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                        )}
                    >
                        <Icon className="size-5" />
                        {label}
                    </button>
                ))}
            </nav>
            <div className="flex w-72 flex-col overflow-y-auto p-4">
                <h2 className="mb-4 text-sm font-semibold text-slate-900">{tab.label}</h2>
                {panel ?? (
                    <div className="rounded-lg border border-dashed border-slate-300 p-4 text-xs leading-relaxed text-slate-500">{tab.comingIn}</div>
                )}
            </div>
        </aside>
    );
}
