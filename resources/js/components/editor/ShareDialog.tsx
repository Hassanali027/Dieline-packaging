import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ApiError, createShare, type ShareContact, type ShareLink } from '@/lib/api';
import { useEditorStore } from '@/store/useEditorStore';
import { Check, Copy, Loader2, Share2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import TurnstileWidget, { useTurnstileSiteKey } from './TurnstileWidget';

const EMPTY: ShareContact = { customer_name: '', customer_email: '', customer_phone: '' };

/** "Share design": asks for contact details, then shows the expiring read-only link. */
export default function ShareDialog() {
    const [open, setOpen] = useState(false);
    const [contact, setContact] = useState<ShareContact>(EMPTY);
    const [link, setLink] = useState<ShareLink | null>(null);
    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [copied, setCopied] = useState(false);
    const siteKey = useTurnstileSiteKey();
    const [captcha, setCaptcha] = useState<string | null>(null);
    const [captchaRound, setCaptchaRound] = useState(0);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setErrors({});
        try {
            const { data } = await createShare(useEditorStore.getState().design, contact, captcha);
            setLink(data);
        } catch (err) {
            const apiError = err as ApiError;
            const fieldErrors = Object.fromEntries(Object.entries(apiError.errors ?? {}).map(([k, v]) => [k, v[0]]));
            setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: apiError.message });
            // A Turnstile token works once: get a fresh one for the next try.
            if (siteKey) setCaptchaRound((n) => n + 1);
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!link) return;
        await navigator.clipboard?.writeText(link.url).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const field = (key: keyof ShareContact, label: string, type = 'text', autoComplete?: string) => (
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            {label}
            <input
                type={type}
                required
                autoComplete={autoComplete}
                value={contact[key]}
                onChange={(e) => setContact({ ...contact, [key]: e.target.value })}
                className="rounded-md border border-slate-200 px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
            {errors[key] && <span className="text-[11px] text-rose-600">{errors[key]}</span>}
        </label>
    );

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (!o) {
                    setLink(null);
                    setErrors({});
                }
            }}
        >
            <DialogTrigger asChild>
                <button
                    type="button"
                    className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                    <Share2 className="size-4" />
                    Share
                </button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl border-slate-200 bg-white text-slate-900 sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold text-slate-900">Share this design</DialogTitle>
                    <DialogDescription className="text-slate-500">
                        Anyone with the link can view a copy of the design (read-only) for 30 days.
                    </DialogDescription>
                </DialogHeader>
                {link ? (
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                            <input
                                readOnly
                                value={link.url}
                                aria-label="Share link"
                                className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none"
                                onFocus={(e) => e.target.select()}
                            />
                            <button
                                type="button"
                                onClick={copy}
                                className="flex items-center gap-1 rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white"
                            >
                                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        <p className="text-xs text-slate-500">Expires {new Date(link.expires_at).toLocaleDateString()}.</p>
                    </div>
                ) : (
                    <form onSubmit={submit} className="flex flex-col gap-3">
                        {field('customer_name', 'Your name', 'text', 'name')}
                        {field('customer_email', 'Email', 'email', 'email')}
                        {field('customer_phone', 'Phone', 'tel', 'tel')}
                        {errors.form && <p className="text-xs text-rose-600">{errors.form}</p>}
                        {siteKey && <TurnstileWidget siteKey={siteKey} onToken={setCaptcha} resetKey={captchaRound} />}
                        {errors.turnstile_token && <p className="text-xs text-rose-600">{errors.turnstile_token}</p>}
                        <button
                            type="submit"
                            disabled={busy || (!!siteKey && !captcha)}
                            className="mt-1 flex items-center justify-center gap-2 rounded-md bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                            {busy && <Loader2 className="size-4 animate-spin" />}
                            Create link
                        </button>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
