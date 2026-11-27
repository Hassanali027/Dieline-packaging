import { router } from '@inertiajs/react';

/**
 * Changes the address bar without a server visit.
 *
 * Plain history.replaceState is not enough on an Inertia page: Inertia keeps its own copy of
 * the page URL in the history state and writes it back (e.g. when it saves scroll positions),
 * which silently restored the old address. router.replace updates both.
 */
export function replaceUrl(url: string | URL): void {
    const next = new URL(url, window.location.href);
    const href = `${next.pathname}${next.search}${next.hash}`;
    router.replace({ url: href, preserveState: true, preserveScroll: true });
}

/** Same as replaceUrl, changing only the path (query such as ?design= is kept). */
export function replacePath(pathname: string): void {
    const url = new URL(window.location.href);
    url.pathname = pathname;
    replaceUrl(url);
}
