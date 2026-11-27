import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ApiError, submitQuote, type QuoteRequest } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/useEditorStore';
import type { BoxParams } from '@/types/design';
import { CheckCircle2, Loader2, ReceiptText } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

type Construction = 'folding' | 'corrugated' | 'rigid';

/** Material choices per construction. Rigid boxes add chipboard, wrap paper and insert (Sprint 3). */
const BOARDS: Record<Construction, string[]> = {
    folding: ['300gsm SBS', '350gsm SBS', '400gsm SBS', '350gsm Kraft'],
    corrugated: ['E-flute', 'B-flute', 'Double wall (BC-flute)'],
    rigid: ['1.5 mm chipboard', '2 mm chipboard', '2.5 mm chipboard', '3 mm chipboard'],
};
const WRAP_PAPERS = ['Art paper 157gsm', 'Kraft paper', 'Linen', 'Leatherette', 'Textured / specialty'];
const INSERTS = ['None', 'Foam', 'EVA', 'Cardboard', 'Velvet / satin tray'];
const FINISHES: Record<Construction, string[]> = {
    folding: ['Matte lamination', 'Gloss lamination', 'Soft-touch', 'Gold foil', 'Silver foil', 'Spot UV'],
    corrugated: ['Matte lamination', 'Gloss lamination', 'Spot UV'],
    rigid: ['Matte lamination', 'Gloss lamination', 'Soft-touch', 'Gold foil', 'Silver foil', 'Spot UV', 'Emboss', 'Deboss'],
};

export type QuotePreviews = { outside?: string; inside?: string };

type Props = {
    params: BoxParams | null;
    /** PNG data URLs of the printed sheets, attached so the factory sees the artwork. */
    getPreviews: () => QuotePreviews;
};

function boardFor(params: BoxParams | null, construction: Construction): string {
    if (construction === 'rigid') {
        const mm = params?.rigid?.boardThickness ?? params?.thickness ?? 2;
        return BOARDS.rigid.find((b) => b.startsWith(`${mm} mm`)) ?? `${mm} mm chipboard`;
    }
    return BOARDS[construction][1] ?? BOARDS[construction][0];
}

const input =
    'w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100';

function Field({ label, error, children, className }: { label: string; error?: string; children: ReactNode; className?: string }) {
    return (
        <label className={cn('flex flex-col gap-1.5', className)}>
            <span className="text-[11px] font-semibold text-slate-600">{label}</span>
            {children}
            {error && <span className="text-[11px] text-rose-600">{error}</span>}
        </label>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">{title}</legend>
            {children}
        </fieldset>
    );
}

export default function QuoteDialog({ params, getPreviews }: Props) {
    const designId = useEditorStore((s) => s.designMeta.id);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState<number | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [form, setForm] = useState<QuoteRequest & { attachPreviews: boolean }>(() => blank(params));

    // Fresh box details every time the dialog opens; contact details are kept.
    const openWith = () => {
        const b = blank(params);
        setForm((f) => ({
            ...b,
            customer_name: f.customer_name,
            customer_email: f.customer_email,
            customer_phone: f.customer_phone,
            company_name: f.company_name,
        }));
        setErrors({});
        setDone(null);
    };

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
    const construction = (form.construction ?? 'folding') as Construction;
    const rigid = construction === 'rigid';

    const changeConstruction = (c: Construction) =>
        setForm((f) => ({
            ...f,
            construction: c,
            board_thickness: boardFor(params, c),
            paper: c === 'rigid' ? (f.paper ?? WRAP_PAPERS[0]) : undefined,
            insert_type: c === 'rigid' ? (f.insert_type ?? INSERTS[0]) : undefined,
            finishes: (f.finishes ?? []).filter((x) => FINISHES[c].includes(x)),
        }));

    const toggleFinish = (name: string) =>
        set('finishes', form.finishes?.includes(name) ? form.finishes.filter((f) => f !== name) : [...(form.finishes ?? []), name]);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setErrors({});
        try {
            const { attachPreviews, ...request } = form;
            const previews = attachPreviews ? getPreviews() : {};
            const { data } = await submitQuote({
                ...request,
                design_id: designId,
                outside_png: previews.outside,
                inside_png: previews.inside,
                paper: rigid ? request.paper : undefined,
                insert_type: rigid ? request.insert_type : undefined,
            });
            setDone(data.id);
        } catch (err) {
            const apiError = err as ApiError;
            if (apiError.status === 429) {
                setErrors({ form: 'Too many requests. Please wait a minute and try again.' });
            } else {
                const fieldErrors = Object.fromEntries(Object.entries(apiError.errors ?? {}).map(([k, v]) => [k, v[0]]));
                setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: apiError.message });
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (o) openWith();
                setOpen(o);
            }}
        >
            <DialogTrigger asChild>
                <button
                    type="button"
                    className="flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                    <ReceiptText className="size-4" />
                    Get quote
                </button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border-slate-200 bg-white text-slate-900 sm:max-w-2xl">
                {done ? (
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                        <span className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                            <CheckCircle2 className="size-8" />
                        </span>
                        <DialogTitle className="text-lg text-slate-900">Request #{done} sent</DialogTitle>
                        <DialogDescription className="text-slate-500">
                            We emailed a confirmation to {form.customer_email}. Our team will reply with a price shortly.
                        </DialogDescription>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="mt-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
                        >
                            Back to the editor
                        </button>
                    </div>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-lg font-bold text-slate-900">Get a quote</DialogTitle>
                            <DialogDescription className="text-slate-500">
                                Size and board come from your design. Add the quantity and finishing, we reply by email.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={submit} className="flex flex-col gap-6">
                            <Section title="Your box">
                                <div className="grid grid-cols-4 gap-3">
                                    {(['length', 'width', 'depth'] as const).map((k) => (
                                        <Field key={k} label={`${k[0].toUpperCase()}${k.slice(1)} (${form.unit})`} error={errors[k]}>
                                            <input
                                                type="number"
                                                step="any"
                                                min={0}
                                                required
                                                value={form[k]}
                                                onChange={(e) => set(k, Number(e.target.value))}
                                                className={input}
                                            />
                                        </Field>
                                    ))}
                                    <Field label="Quantity" error={errors.quantity}>
                                        <input
                                            type="number"
                                            min={1}
                                            step={1}
                                            required
                                            value={form.quantity}
                                            onChange={(e) => set('quantity', Number(e.target.value))}
                                            className={input}
                                        />
                                    </Field>
                                </div>
                                <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                                    {(['folding', 'corrugated', 'rigid'] as const).map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => changeConstruction(c)}
                                            className={cn(
                                                'flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition',
                                                construction === c ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                                            )}
                                        >
                                            {c === 'rigid' ? 'Rigid (chipboard)' : c}
                                        </button>
                                    ))}
                                </div>
                                <div className={cn('grid gap-3', rigid ? 'grid-cols-3' : 'grid-cols-1')}>
                                    <Field label={rigid ? 'Chipboard' : 'Board'} error={errors.board_thickness}>
                                        <select
                                            value={form.board_thickness}
                                            onChange={(e) => set('board_thickness', e.target.value)}
                                            className={input}
                                        >
                                            {[...new Set([form.board_thickness ?? '', ...BOARDS[construction]])].filter(Boolean).map((b) => (
                                                <option key={b}>{b}</option>
                                            ))}
                                        </select>
                                    </Field>
                                    {rigid && (
                                        <>
                                            <Field label="Wrap paper" error={errors.paper}>
                                                <select value={form.paper} onChange={(e) => set('paper', e.target.value)} className={input}>
                                                    {WRAP_PAPERS.map((p) => (
                                                        <option key={p}>{p}</option>
                                                    ))}
                                                </select>
                                            </Field>
                                            <Field label="Insert" error={errors.insert_type}>
                                                <select
                                                    value={form.insert_type}
                                                    onChange={(e) => set('insert_type', e.target.value)}
                                                    className={input}
                                                >
                                                    {INSERTS.map((p) => (
                                                        <option key={p}>{p}</option>
                                                    ))}
                                                </select>
                                            </Field>
                                        </>
                                    )}
                                </div>
                                <div>
                                    <div className="mb-2 text-[11px] font-semibold text-slate-600">Finishes</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {FINISHES[construction].map((f) => {
                                            const on = form.finishes?.includes(f);
                                            return (
                                                <button
                                                    key={f}
                                                    type="button"
                                                    aria-pressed={on}
                                                    onClick={() => toggleFinish(f)}
                                                    className={cn(
                                                        'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                                                        on
                                                            ? 'border-violet-500 bg-violet-50 text-violet-700'
                                                            : 'border-slate-200 text-slate-600 hover:border-slate-300',
                                                    )}
                                                >
                                                    {f}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </Section>

                            <Section title="Contact">
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Name" error={errors.customer_name}>
                                        <input
                                            required
                                            autoComplete="name"
                                            value={form.customer_name}
                                            onChange={(e) => set('customer_name', e.target.value)}
                                            className={input}
                                        />
                                    </Field>
                                    <Field label="Company (optional)" error={errors.company_name}>
                                        <input
                                            autoComplete="organization"
                                            value={form.company_name ?? ''}
                                            onChange={(e) => set('company_name', e.target.value)}
                                            className={input}
                                        />
                                    </Field>
                                    <Field label="Email" error={errors.customer_email}>
                                        <input
                                            required
                                            type="email"
                                            autoComplete="email"
                                            value={form.customer_email}
                                            onChange={(e) => set('customer_email', e.target.value)}
                                            className={input}
                                        />
                                    </Field>
                                    <Field label="Phone" error={errors.customer_phone}>
                                        <input
                                            required
                                            type="tel"
                                            autoComplete="tel"
                                            value={form.customer_phone}
                                            onChange={(e) => set('customer_phone', e.target.value)}
                                            className={input}
                                        />
                                    </Field>
                                </div>
                                <Field label="Notes (optional)" error={errors.notes}>
                                    <textarea
                                        rows={3}
                                        maxLength={2000}
                                        value={form.notes ?? ''}
                                        onChange={(e) => set('notes', e.target.value)}
                                        className={cn(input, 'resize-none')}
                                    />
                                </Field>
                                <label className="flex items-center gap-2 text-xs text-slate-600">
                                    <input
                                        type="checkbox"
                                        checked={form.attachPreviews}
                                        onChange={(e) => set('attachPreviews', e.target.checked)}
                                        className="size-4 accent-violet-600"
                                    />
                                    Attach my artwork (outside and inside sheets){designId ? ' and the saved design' : ''}
                                </label>
                            </Section>

                            {errors.form && <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{errors.form}</p>}
                            {(errors.outside_png || errors.inside_png) && (
                                <p className="text-xs text-rose-600">{errors.outside_png ?? errors.inside_png}</p>
                            )}

                            <button
                                type="submit"
                                disabled={busy}
                                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-violet-500 to-violet-700 text-sm font-semibold text-white shadow-md shadow-violet-500/30 disabled:opacity-60"
                            >
                                {busy && <Loader2 className="size-4 animate-spin" />}
                                Send quote request
                            </button>
                        </form>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function blank(params: BoxParams | null): QuoteRequest & { attachPreviews: boolean } {
    const construction = (params?.construction ?? 'folding') as Construction;
    return {
        customer_name: '',
        customer_email: '',
        customer_phone: '',
        company_name: '',
        length: params?.length ?? 0,
        width: params?.width ?? 0,
        depth: params?.depth ?? 0,
        unit: params?.unit ?? 'mm',
        quantity: 500,
        construction,
        board_thickness: boardFor(params, construction),
        paper: construction === 'rigid' ? WRAP_PAPERS[0] : undefined,
        insert_type: construction === 'rigid' ? INSERTS[0] : undefined,
        finishes: [],
        notes: '',
        attachPreviews: true,
    };
}
