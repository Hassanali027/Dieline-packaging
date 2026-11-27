import { useEditorStore } from '@/store/useEditorStore';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

/**
 * Colour swatch with our own picker (the browser's native picker opens wherever the browser
 * likes, usually right over the artwork being recoloured).
 *
 * - Opens to the LEFT of the swatch, so the selected object in the middle of the canvas stays
 *   visible while picking.
 * - The colour changes live while dragging, and the whole pick is ONE undo step: history is
 *   paused while the picker is open and the change is recorded once when it closes.
 */

const PRESETS = ['#0f172a', '#ffffff', '#64748b', '#dc2626', '#ea580c', '#f59e0b', '#16a34a', '#0d9488', '#2563eb', '#4f46e5', '#7c3aed', '#db2777'];

type Hsv = { h: number; s: number; v: number };

function hexToHsv(hex: string): Hsv {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    const n = m ? parseInt(m[1], 16) : 0;
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    let h = 0;
    if (d) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
    }
    return { h, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
    const f = (n: number) => {
        const k = (n + h / 60) % 6;
        return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
    };
    return `#${[f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

/** Pointer drag inside an element, reporting the position as 0..1 fractions. */
function useDrag(onMove: (x: number, y: number) => void) {
    const ref = useRef<HTMLDivElement>(null);
    const move = (e: PointerEvent | ReactPointerEvent) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        onMove(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
    };
    const onPointerDown = (e: ReactPointerEvent) => {
        e.preventDefault();
        move(e);
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };
    return { ref, onPointerDown };
}

export default function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
    const [open, setOpen] = useState(false);
    const swatch = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
    const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
    const [hexText, setHexText] = useState(value);
    const original = useRef(value);
    const latest = useRef(value);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const apply = (next: Hsv) => {
        setHsv(next);
        const hex = hsvToHex(next);
        setHexText(hex);
        latest.current = hex;
        onChangeRef.current(hex);
    };

    const show = () => {
        original.current = isHex(value) ? value : '#000000';
        latest.current = original.current;
        setHsv(hexToHsv(original.current));
        setHexText(original.current);
        useEditorStore.temporal.getState().pause();
        setOpen(true);
    };

    const close = () => {
        setOpen(false);
        const temporal = useEditorStore.temporal.getState();
        const final = latest.current;
        if (final.toLowerCase() !== original.current.toLowerCase()) {
            // Put the start colour back unrecorded, then record start → final as one step.
            onChangeRef.current(original.current);
            temporal.resume();
            onChangeRef.current(final);
        } else {
            temporal.resume();
        }
    };
    const closeRef = useRef(close);
    closeRef.current = close;

    // Place the panel to the left of the swatch, bottoms aligned, kept on screen.
    useLayoutEffect(() => {
        if (!open || !swatch.current || !panel.current) return;
        const s = swatch.current.getBoundingClientRect();
        const p = panel.current.getBoundingClientRect();
        const left = Math.max(8, s.left - p.width - 12);
        const top = Math.max(8, Math.min(window.innerHeight - p.height - 8, s.bottom - p.height));
        setPos({ left, top });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            const t = e.target as Node;
            if (!panel.current?.contains(t) && !swatch.current?.contains(t)) closeRef.current();
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
        window.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);

    // Never leave history paused if the swatch disappears while open (e.g. deselecting).
    useEffect(() => () => void (open && useEditorStore.temporal.getState().resume()), [open]);

    const sv = useDrag((x, y) => apply({ ...hsv, s: x, v: 1 - y }));
    const hue = useDrag((x) => apply({ ...hsv, h: x * 360 }));
    const shown = isHex(value) ? value : '#000000';

    return (
        <label className="flex items-center gap-1 text-[11px] text-slate-500" title={label}>
            {label}
            <button
                ref={swatch}
                type="button"
                aria-label={label}
                aria-expanded={open}
                onClick={() => (open ? close() : show())}
                className="h-7 w-8 rounded border border-slate-200 bg-white p-0.5"
            >
                <span className="block size-full rounded-sm" style={{ backgroundColor: shown }} />
            </button>
            {open &&
                createPortal(
                    <div
                        ref={panel}
                        role="dialog"
                        aria-label={`${label} picker`}
                        className="fixed z-[100] w-56 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-900/20"
                        style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
                    >
                        <div
                            ref={sv.ref}
                            onPointerDown={sv.onPointerDown}
                            className="relative h-32 cursor-crosshair touch-none rounded-lg"
                            style={{
                                backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
                                backgroundImage: 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
                            }}
                        >
                            <span
                                className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/30"
                                style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
                            />
                        </div>
                        <div
                            ref={hue.ref}
                            onPointerDown={hue.onPointerDown}
                            className="relative mt-2.5 h-3 cursor-pointer touch-none rounded-full"
                            style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
                        >
                            <span
                                className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/30"
                                style={{ left: `${(hsv.h / 360) * 100}%` }}
                            />
                        </div>
                        <div className="mt-2.5 grid grid-cols-6 gap-1.5">
                            {PRESETS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    aria-label={`Use ${c}`}
                                    onClick={() => apply(hexToHsv(c))}
                                    className="aspect-square rounded-md border border-slate-200 transition hover:scale-110"
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                            <span className="size-7 shrink-0 rounded-md border border-slate-200" style={{ backgroundColor: hsvToHex(hsv) }} />
                            <input
                                aria-label="Hex colour"
                                value={hexText}
                                onChange={(e) => {
                                    const v = e.target.value.trim();
                                    setHexText(v);
                                    const hex = v.startsWith('#') ? v : `#${v}`;
                                    if (isHex(hex)) apply(hexToHsv(hex));
                                }}
                                className="h-7 w-full rounded-md border border-slate-200 px-2 font-mono text-xs uppercase"
                            />
                        </div>
                    </div>,
                    document.body,
                )}
        </label>
    );
}
