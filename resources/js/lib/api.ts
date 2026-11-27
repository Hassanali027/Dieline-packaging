import type { Design } from '@/types/design';

/**
 * Small fetch wrapper for the editor's JSON endpoints (routes/web.php, prefix /api).
 * They use the web session, so requests send cookies and Laravel's XSRF token.
 */

export class ApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly errors: Record<string, string[]> = {},
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

function xsrfToken(): string | null {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('X-Requested-With', 'XMLHttpRequest');
    const token = xsrfToken();
    if (token) headers.set('X-XSRF-TOKEN', token);
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

    const response = await fetch(url, { credentials: 'same-origin', ...init, headers });
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new ApiError(body.message ?? `Request failed (${response.status})`, response.status, body.errors ?? {});
    }
    return body as T;
}

export type UploadedAsset = {
    id: number;
    url: string;
    thumbnail_url: string | null;
    type: string;
    name: string | null;
    mime: string | null;
    size: number | null;
    width: number | null;
    height: number | null;
};

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_ACCEPT = 'image/png,image/jpeg,image/svg+xml,.svg';

export function listUploads(): Promise<{ data: UploadedAsset[] }> {
    return api('/api/uploads');
}

export type SavedDesign = { id: number; name: string; data: Design; updated_at: string };

/** Creates the design the first time (no id), updates it afterwards. */
export function saveDesign(id: number | null, name: string, data: Design): Promise<{ data: SavedDesign }> {
    return api(id ? `/api/designs/${id}` : '/api/designs', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify({ name, data }),
    });
}

export type ShareContact = { customer_name: string; customer_email: string; customer_phone: string };
export type ShareLink = { token: string; url: string; expires_at: string };

/** Freezes a copy of the design behind an expiring read-only link (/s/{token}). */
export function createShare(design: Design, contact: ShareContact): Promise<{ data: ShareLink }> {
    return api('/api/share', { method: 'POST', body: JSON.stringify({ ...contact, design }) });
}

export function uploadImage(file: File): Promise<{ data: UploadedAsset }> {
    const form = new FormData();
    form.append('file', file);
    return api('/api/uploads', { method: 'POST', body: form });
}
