/**
 * Resolve the IDE backend's base URL.
 *
 * The frontend cannot assume it is served by the backend. In the packaged app
 * the renderer's document base can resolve to a `file://` path, and then a
 * relative `fetch('/rovant/check')` becomes `file:///C:/rovant/check`:
 *
 *   /C:/rovant/check:1  Failed to load resource: net::ERR_FILE_NOT_FOUND
 *
 * which surfaced as "Check failed: Failed to fetch". The Electron main process
 * knows the real port, so ask it once and cache the answer.
 */

let cached: string | null = null;

interface RovantBridgeLike {
    getPlatform?: () => Promise<{ backendUrl?: string } & Record<string, unknown>>;
}

export async function backendBaseUrl(): Promise<string> {
    if (cached !== null) return cached;

    try {
        const bridge = (window as unknown as { Rovant?: RovantBridgeLike }).Rovant;
        const platform = await bridge?.getPlatform?.();
        const url = platform?.backendUrl;
        if (typeof url === 'string' && url) {
            cached = url.replace(/\/+$/, '');
            return cached;
        }
    } catch {
        // Not running in Electron, or the IPC call failed — fall through.
    }

    // Served by the backend (browser / dev): a relative path is correct.
    cached = '';
    return cached;
}

/** Build an absolute URL for a backend route, e.g. '/rovant/check'. */
export async function backendRoute(path: string): Promise<string> {
    const base = await backendBaseUrl();
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}${suffix}`;
}
