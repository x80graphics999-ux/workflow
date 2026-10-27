import { useCallback, useEffect, useState } from 'react';

const TOKEN_KEY = 'taskflow.token';

export function getToken() {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setToken(token: string | null) {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch {
        // storage unavailable — session lasts until reload
    }
}

export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
    ) {
        super(message);
    }
}

type Options = { method?: string; body?: unknown; form?: FormData };

async function request(path: string, { method, body, form }: Options = {}) {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`/api${path}`, {
        method: method ?? (body !== undefined || form ? 'POST' : 'GET'),
        headers,
        body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    if (res.status === 401 && token) {
        setToken(null);
        window.location.assign('/login');
    }
    if (!res.ok) {
        const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
        // 413 comes from the host (e.g. Vercel's 4.5 MB request limit), not from our API.
        const fallback = res.status === 413 ? 'The file is too large' : `Request failed (${res.status})`;
        throw new ApiError(data?.error ?? fallback, res.status);
    }
    return res;
}

export async function api<T = unknown>(path: string, options?: Options): Promise<T> {
    const res = await request(path, options);
    return res.headers.get('content-type')?.includes('json') ? res.json() : (null as T);
}

/** Downloads through fetch so the auth header is sent, then hands the file to the browser. */
export async function download(path: string, fallbackName: string) {
    const res = await request(path);
    const disposition = res.headers.get('content-disposition') ?? '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const name = match ? decodeURIComponent(match[1]) : fallbackName;
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function uploadFiles(files: File[], target: { taskId?: string; projectId?: string; clientId?: string }) {
    if (files.length === 0) return;
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    Object.entries(target).forEach(([k, v]) => v && form.append(k, v));
    await api('/attachments', { form });
}

export async function uploadAvatar(file: File) {
    const form = new FormData();
    form.append('avatar', file);
    return api<{ avatarUrl: string }>('/auth/avatar', { form });
}

/** Fetches `path` on mount and whenever it changes. Pass null to skip. */
export function useApi<T>(path: string | null) {
    const [data, setData] = useState<T>();
    const [error, setError] = useState<string>();
    const [loading, setLoading] = useState(!!path);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        if (!path) return;
        let cancelled = false;
        setLoading(true);
        api<T>(path)
            .then((d) => {
                if (cancelled) return;
                setData(d);
                setError(undefined);
            })
            .catch((e: Error) => !cancelled && setError(e.message))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [path, version]);

    const reload = useCallback(() => setVersion((v) => v + 1), []);
    return { data, error, loading, reload, setData };
}

export function query(params: Record<string, string | undefined | null | false>) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && q.set(k, v));
    const s = q.toString();
    return s ? `?${s}` : '';
}
