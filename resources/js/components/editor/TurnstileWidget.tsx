import { usePage } from '@inertiajs/react';
import { useEffect, useRef } from 'react';

type TurnstileApi = {
    render: (
        el: HTMLElement,
        options: {
            sitekey: string;
            callback: (token: string) => void;
            'expired-callback'?: () => void;
            'error-callback'?: () => void;
            theme?: 'light' | 'dark' | 'auto';
            size?: 'normal' | 'flexible' | 'compact';
        },
    ) => string;
    remove: (widgetId: string) => void;
};

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

let scriptRequest: Promise<void> | null = null;

/** Cloudflare's script, loaded once and only on sites that have Turnstile keys. */
function loadTurnstile(): Promise<void> {
    scriptRequest ??= new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
            scriptRequest = null;
            reject(new Error('Could not load the security check.'));
        };
        document.head.appendChild(script);
    });
    return scriptRequest;
}

/** The public Turnstile key shared by Laravel (HandleInertiaRequests); null = no check. */
export function useTurnstileSiteKey(): string | null {
    return (usePage().props as { turnstileSiteKey?: string | null }).turnstileSiteKey ?? null;
}

/**
 * Cloudflare Turnstile on the Share / Quote forms. Hands its one-time token to `onToken`
 * (null when it expires or fails). Change `resetKey` after a failed submit: a token works once.
 */
export default function TurnstileWidget({
    siteKey,
    onToken,
    resetKey = 0,
}: {
    siteKey: string;
    onToken: (token: string | null) => void;
    resetKey?: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;

    useEffect(() => {
        let widgetId: string | undefined;
        let alive = true;
        onTokenRef.current(null);
        loadTurnstile()
            .then(() => {
                if (!alive || !ref.current || !window.turnstile) return;
                widgetId = window.turnstile.render(ref.current, {
                    sitekey: siteKey,
                    callback: (token) => onTokenRef.current(token),
                    'expired-callback': () => onTokenRef.current(null),
                    'error-callback': () => onTokenRef.current(null),
                    theme: 'light',
                    size: 'flexible',
                });
            })
            .catch(() => onTokenRef.current(null));
        return () => {
            alive = false;
            if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
        };
    }, [siteKey, resetKey]);

    return <div ref={ref} className="min-h-[65px]" />;
}
