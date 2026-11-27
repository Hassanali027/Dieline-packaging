import { ensureFont, GOOGLE_FONTS, SYSTEM_FONTS } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { surfaceObjects, useEditorStore, type ZOrderMove } from '@/store/useEditorStore';
import type { CanvasObject } from '@/types/design';
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    ArrowDown,
    ArrowDownToLine,
    ArrowUp,
    ArrowUpToLine,
    Bold,
    Copy,
    Group as GroupIcon,
    Italic,
    Lock,
    LockOpen,
    Trash2,
    TriangleAlert,
    Ungroup,
} from 'lucide-react';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import ColorPicker from './ColorPicker';
import type { CanvasController } from './DielineCanvas';
import { imageDpi, LOW_PRINT_DPI, MIN_PRINT_DPI, MM_PER_PT, objectSize, scaleForSize } from './objects';

const round = (v: number, p = 1) => Math.round(v * 10 ** p) / 10 ** p;

function IconButton({
    label,
    active,
    disabled,
    onClick,
    children,
}: {
    label: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'flex size-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent',
                active && 'bg-slate-900 text-white hover:bg-slate-800 hover:text-white',
            )}
        >
            {children}
        </button>
    );
}

/** Number box that commits on blur / Enter (one undo step instead of one per keystroke). */
function NumberField({
    label,
    value,
    suffix,
    onCommit,
    width = 'w-14',
}: {
    label: string;
    value: number;
    suffix?: string;
    onCommit: (v: number) => void;
    width?: string;
}) {
    const [text, setText] = useState(String(value));
    useEffect(() => setText(String(value)), [value]);
    const commit = () => {
        const n = Number(text);
        if (Number.isFinite(n) && n !== value) onCommit(n);
        else setText(String(value));
    };
    return (
        <label className="flex items-center gap-1 text-[11px] text-slate-500" title={label}>
            {label}
            <span className="flex items-center rounded border border-slate-200 bg-white focus-within:border-slate-400">
                <input
                    type="number"
                    step="any"
                    value={text}
                    aria-label={label}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className={cn('bg-transparent px-1.5 py-1 text-xs text-slate-900 outline-none', width)}
                />
                {suffix && <span className="pr-1.5 text-[10px] text-slate-400">{suffix}</span>}
            </span>
        </label>
    );
}

/** Colour control: live while picking, one undo step per pick (see ColorPicker). */
function ColorField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
    return <ColorPicker label={label} value={value} onChange={onCommit} />;
}

const Divider = () => <div className="mx-1 h-6 w-px bg-slate-200" />;

export default function SelectionToolbar({ controller }: { controller: RefObject<CanvasController | null> }) {
    const side = useEditorStore((s) => s.activeSide);
    const selectedIds = useEditorStore((s) => s.selectedObjectIds);
    const objects = useEditorStore((s) => surfaceObjects(s.design, s.activePart, s.activeSide));
    const updateObjects = useEditorStore((s) => s.updateObjects);
    const removeObjects = useEditorStore((s) => s.removeObjects);
    const duplicateObjects = useEditorStore((s) => s.duplicateObjects);
    const moveObjects = useEditorStore((s) => s.moveObjects);

    const selected = objects.filter((o) => selectedIds.includes(o.id));
    if (!selected.length) return null;

    const single: CanvasObject | null = selected.length === 1 ? selected[0] : null;
    const allLocked = selected.every((o) => o.locked);
    const ids = selected.map((o) => o.id);
    const set = (props: Record<string, unknown>) =>
        updateObjects(
            side,
            ids.map((id) => ({ id, props })),
        );
    const setOne = (o: CanvasObject, props: Record<string, unknown>) => updateObjects(side, [{ id: o.id, props }]);
    const move = (m: ZOrderMove) => moveObjects(side, ids, m);

    const p = single?.props ?? {};
    const isText = single?.type === 'text';
    const isLine = single?.type === 'shape' && p.shape === 'line';
    const isShape = single?.type === 'shape' && !isLine;
    const isIcon = single?.type === 'icon';
    const size = single ? objectSize(single) : null;
    const opacity = Number(selected[0].props.opacity ?? 1);
    const dpi = single?.type === 'image' ? imageDpi(single) : null;

    return (
        // One scrollable row on a narrow canvas; wraps into centred rows once the canvas is roomy.
        <div className="editor-glass pointer-events-auto flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/60 px-2.5 py-2 shadow-xl ring-1 shadow-slate-900/10 ring-slate-900/5 [scrollbar-width:thin] @2xl:max-w-[46rem] @2xl:flex-wrap @2xl:justify-center @2xl:overflow-visible [&>*]:shrink-0">
            {isText && single && (
                <>
                    <select
                        aria-label="Font"
                        value={String(p.fontFamily ?? 'Arial')}
                        onChange={async (e) => {
                            const family = e.target.value;
                            // Load first so Fabric lays the text out with the real font.
                            await ensureFont(family, String(p.fontWeight ?? 'normal'));
                            setOne(single, { fontFamily: family });
                        }}
                        className="h-7 rounded border border-slate-200 bg-white px-1 text-xs"
                    >
                        <optgroup label="Standard">
                            {SYSTEM_FONTS.map((f) => (
                                <option key={f.family} value={f.family}>
                                    {f.family}
                                </option>
                            ))}
                        </optgroup>
                        <optgroup label="Google Fonts">
                            {GOOGLE_FONTS.map((f) => (
                                <option key={f.family} value={f.family}>
                                    {f.family}
                                </option>
                            ))}
                        </optgroup>
                    </select>
                    <NumberField
                        label="Size"
                        suffix="pt"
                        value={round(Number(p.fontSize ?? 4) / MM_PER_PT)}
                        onCommit={(v) => v > 0 && setOne(single, { fontSize: v * MM_PER_PT })}
                        width="w-10"
                    />
                    <IconButton
                        label="Bold"
                        active={String(p.fontWeight) === 'bold'}
                        onClick={async () => {
                            const weight = p.fontWeight === 'bold' ? 'normal' : 'bold';
                            await ensureFont(String(p.fontFamily ?? 'Arial'), weight);
                            setOne(single, { fontWeight: weight });
                        }}
                    >
                        <Bold className="size-4" />
                    </IconButton>
                    <IconButton
                        label="Italic"
                        active={p.fontStyle === 'italic'}
                        onClick={() => setOne(single, { fontStyle: p.fontStyle === 'italic' ? 'normal' : 'italic' })}
                    >
                        <Italic className="size-4" />
                    </IconButton>
                    {(['left', 'center', 'right'] as const).map((a) => (
                        <IconButton
                            key={a}
                            label={`Align ${a}`}
                            active={(p.textAlign ?? 'center') === a}
                            onClick={() => setOne(single, { textAlign: a })}
                        >
                            {a === 'left' ? (
                                <AlignLeft className="size-4" />
                            ) : a === 'center' ? (
                                <AlignCenter className="size-4" />
                            ) : (
                                <AlignRight className="size-4" />
                            )}
                        </IconButton>
                    ))}
                    <ColorField label="Colour" value={String(p.fill ?? '#000000')} onCommit={(v) => setOne(single, { fill: v })} />
                    <label className="flex items-center gap-1 text-[11px] text-slate-500" title="Bend the text along an arc (0 = straight)">
                        Curve
                        <input
                            type="range"
                            aria-label="Curve"
                            min={-100}
                            max={100}
                            step={1}
                            value={Number(p.curve ?? 0)}
                            onChange={(e) => setOne(single, { curve: Number(e.target.value) })}
                            className="h-1.5 w-20 accent-violet-600"
                        />
                        <span className="w-7 text-right tabular-nums">{Number(p.curve ?? 0)}</span>
                    </label>
                    {Number(p.curve ?? 0) !== 0 && (
                        // Curved text cannot be edited on the canvas, so its words are edited here.
                        <input
                            type="text"
                            aria-label="Curved text"
                            value={String(p.text ?? '')}
                            onChange={(e) => setOne(single, { text: e.target.value })}
                            className="h-7 w-32 rounded border border-slate-200 bg-white px-1.5 text-xs"
                        />
                    )}
                    <Divider />
                </>
            )}

            {isIcon && single && (
                <>
                    <ColorField label="Colour" value={String(p.fill ?? '#0f172a')} onCommit={(v) => setOne(single, { fill: v })} />
                    <Divider />
                </>
            )}

            {isShape && single && (
                <>
                    <ColorField label="Fill" value={String(p.fill ?? '#6366f1')} onCommit={(v) => setOne(single, { fill: v })} />
                    <ColorField
                        label="Stroke"
                        value={String(p.stroke || '#000000')}
                        onCommit={(v) => setOne(single, { stroke: v, strokeWidth: Number(p.strokeWidth) || 0.5 })}
                    />
                    <NumberField
                        label="Width"
                        suffix="mm"
                        value={round(Number(p.strokeWidth ?? 0), 2)}
                        onCommit={(v) => v >= 0 && setOne(single, { strokeWidth: v })}
                        width="w-10"
                    />
                    <select
                        aria-label="Stroke style"
                        value={Array.isArray(p.strokeDashArray) ? ((p.strokeDashArray as number[])[0] > 1 ? 'dashed' : 'dotted') : 'solid'}
                        onChange={(e) =>
                            setOne(single, {
                                strokeDashArray: e.target.value === 'dashed' ? [4, 2] : e.target.value === 'dotted' ? [0.6, 1.2] : null,
                            })
                        }
                        className="h-7 rounded border border-slate-200 bg-white px-1 text-xs"
                    >
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                        <option value="dotted">Dotted</option>
                    </select>
                    {p.shape === 'rect' && (
                        <NumberField
                            label="Radius"
                            suffix="mm"
                            value={round(Number(p.rx ?? 0))}
                            onCommit={(v) => v >= 0 && setOne(single, { rx: v })}
                            width="w-10"
                        />
                    )}
                    <Divider />
                </>
            )}

            {isLine && single && (
                <>
                    <ColorField label="Colour" value={String(p.stroke ?? '#000000')} onCommit={(v) => setOne(single, { stroke: v })} />
                    <NumberField
                        label="Thickness"
                        suffix="mm"
                        value={round(Number(p.strokeWidth ?? 1), 2)}
                        onCommit={(v) => v > 0 && setOne(single, { strokeWidth: v })}
                        width="w-10"
                    />
                    <Divider />
                </>
            )}

            {single && size && !isLine && (
                <>
                    <NumberField
                        label="W"
                        suffix="mm"
                        value={round(size.width)}
                        onCommit={(v) => v > 0 && setOne(single, scaleForSize(single, { width: v }))}
                    />
                    <NumberField
                        label="H"
                        suffix="mm"
                        value={round(size.height)}
                        onCommit={(v) => v > 0 && setOne(single, scaleForSize(single, { height: v }))}
                    />
                </>
            )}
            {dpi !== null && (
                <span
                    title={
                        dpi < LOW_PRINT_DPI
                            ? 'Very low resolution (< 150 DPI): this image will print pixelated. Make it smaller or upload a higher-res file.'
                            : dpi < MIN_PRINT_DPI
                              ? 'Below 300 DPI this image may print blurry. Make it smaller or upload a larger file.'
                              : 'Good print resolution'
                    }
                    className={cn(
                        'flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium tabular-nums',
                        dpi < LOW_PRINT_DPI
                            ? 'bg-rose-50 text-rose-700'
                            : dpi < MIN_PRINT_DPI
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700',
                    )}
                >
                    {dpi < MIN_PRINT_DPI && <TriangleAlert className="size-3.5" />}
                    {dpi} DPI
                </span>
            )}
            {single && (
                <NumberField
                    label="Rotate"
                    suffix="°"
                    value={round(Number(p.angle ?? 0))}
                    onCommit={(v) => setOne(single, { angle: ((v % 360) + 360) % 360 })}
                    width="w-11"
                />
            )}

            {single && single.type !== 'pattern' && (
                <select
                    aria-label="Emboss or deboss"
                    title="Raised (emboss) or pressed in (deboss) — shown in 3D"
                    value={single.effect ?? 'none'}
                    onChange={(e) => updateObjects(side, [{ id: single.id, effect: e.target.value as CanvasObject['effect'] }])}
                    className="h-7 rounded border border-slate-200 bg-white px-1 text-xs"
                >
                    <option value="none">No effect</option>
                    <option value="emboss">Emboss</option>
                    <option value="deboss">Deboss</option>
                </select>
            )}

            <label className="flex items-center gap-1 text-[11px] text-slate-500" title="Opacity">
                Opacity
                <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    defaultValue={opacity}
                    key={`${ids.join()}-${opacity}`}
                    aria-label="Opacity"
                    onPointerUp={(e) => set({ opacity: Number((e.target as HTMLInputElement).value) })}
                    onKeyUp={(e) => set({ opacity: Number((e.target as HTMLInputElement).value) })}
                    className="w-16 accent-slate-900"
                />
            </label>

            <Divider />
            <IconButton label="Bring forward" onClick={() => move('forward')}>
                <ArrowUp className="size-4" />
            </IconButton>
            <IconButton label="Send backward" onClick={() => move('backward')}>
                <ArrowDown className="size-4" />
            </IconButton>
            <IconButton label="Bring to front" onClick={() => move('front')}>
                <ArrowUpToLine className="size-4" />
            </IconButton>
            <IconButton label="Send to back" onClick={() => move('back')}>
                <ArrowDownToLine className="size-4" />
            </IconButton>
            <Divider />
            {selected.length > 1 && (
                <IconButton label="Group (Ctrl+G)" onClick={() => controller.current?.group()}>
                    <GroupIcon className="size-4" />
                </IconButton>
            )}
            {single?.type === 'group' && (
                <IconButton label="Ungroup (Ctrl+Shift+G)" onClick={() => controller.current?.ungroup()}>
                    <Ungroup className="size-4" />
                </IconButton>
            )}
            <IconButton
                label={allLocked ? 'Unlock' : 'Lock'}
                active={allLocked}
                onClick={() =>
                    updateObjects(
                        side,
                        ids.map((id) => ({ id, locked: !allLocked })),
                    )
                }
            >
                {allLocked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
            </IconButton>
            <IconButton label="Duplicate (Ctrl+D)" onClick={() => duplicateObjects(side, ids)}>
                <Copy className="size-4" />
            </IconButton>
            <IconButton
                label="Delete (Del)"
                disabled={allLocked}
                onClick={() =>
                    removeObjects(
                        side,
                        selected.filter((o) => !o.locked).map((o) => o.id),
                    )
                }
            >
                <Trash2 className="size-4" />
            </IconButton>
        </div>
    );
}
