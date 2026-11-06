/**
 * Safe access to the Monaco editor API.
 *
 * Theia exposes `monaco` on the global scope, but two things bite here:
 *
 *  1. Not every Theia build exposes the full `editor` namespace on that global —
 *     `monaco.languages` can be present while `monaco.editor` is not.
 *  2. A contribution's `onStart` can run before the editor API is attached.
 *
 * Previously each contribution called `monaco.editor.getModels()` directly. When the
 * namespace was missing that threw, or — worse — surfaced a notification to the user
 * ("monaco.editor.getModels is not available") for something that is not their problem.
 *
 * Everything that touches models now goes through this module, so a missing or
 * not-yet-ready API is a silent no-op with a debug log, never a thrown error and
 * never user-visible.
 */

export interface MonacoEditorApi {
    getModels(): any[];
    setModelLanguage(model: any, languageId: string): void;
}

function editorApi(): MonacoEditorApi | undefined {
    const m = typeof monaco !== 'undefined' ? (monaco as any) : undefined;
    if (!m || !m.editor) return undefined;
    if (typeof m.editor.getModels !== 'function') return undefined;
    if (typeof m.editor.setModelLanguage !== 'function') return undefined;
    return m.editor as MonacoEditorApi;
}

/** True when the model API is usable right now. */
export function isMonacoReady(): boolean {
    return editorApi() !== undefined;
}

/**
 * Run `cb` as soon as the Monaco editor API exists.
 * Retries for ~10 s (40 × 250 ms) then gives up quietly.
 */
export function whenMonacoReady(cb: () => void, attempts = 40, delayMs = 250): void {
    if (isMonacoReady()) {
        cb();
        return;
    }
    let left = attempts;
    const tick = (): void => {
        if (isMonacoReady()) {
            cb();
            return;
        }
        if (--left <= 0) {
            console.debug('[Rovant] Monaco editor API unavailable; language sweep skipped.');
            return;
        }
        setTimeout(tick, delayMs);
    };
    setTimeout(tick, delayMs);
}

/**
 * Force the right language onto already-open models and return how many changed.
 * Matches on exact file name first (CMakeLists.txt, Dockerfile), then extension.
 * Never throws.
 */
export function applyModelLanguages(map: Record<string, string>): number {
    const api = editorApi();
    if (!api) return 0;

    let applied = 0;
    try {
        for (const model of api.getModels()) {
            const path = String(model?.uri?.path ?? '').toLowerCase();
            if (!path) continue;

            const slash = path.lastIndexOf('/');
            const base = slash >= 0 ? path.slice(slash + 1) : path;

            let id = map[base];
            if (!id) {
                const dot = path.lastIndexOf('.');
                if (dot < 0) continue;
                id = map[path.slice(dot)];
            }
            if (id && model.getLanguageId() !== id) {
                api.setModelLanguage(model, id);
                applied++;
            }
        }
    } catch (err) {
        console.debug('[Rovant] language sweep skipped', err);
    }
    return applied;
}
