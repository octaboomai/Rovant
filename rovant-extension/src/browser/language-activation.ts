import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { MessageService } from '@theia/core/lib/common/message-service';

/**
 * FEATURE: make language detection stick, and REPORT what it did.
 *
 * Theia assigns a language when an editor model is created, so a file opened
 * before the grammars register (or restored from the last session) keeps
 * `plaintext` forever. This re-applies the language by file name/extension.
 *
 * It also shows a one-line startup report, because the previous versions failed
 * silently and there was no way to tell "didn't run" from "ran and did nothing".
 */
const EXT_TO_LANGUAGE: Record<string, string> = {
    '.py': 'python', '.pyw': 'python', '.pyi': 'python',
    '.c': 'cpp', '.h': 'cpp', '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp',
    '.hpp': 'cpp', '.hh': 'cpp', '.hxx': 'cpp', '.ino': 'cpp',
    '.cmake': 'cmake',
    '.yaml': 'yaml', '.yml': 'yaml',
    '.xml': 'xml', '.urdf': 'xml', '.xacro': 'xml', '.launch': 'xml',
    '.sdf': 'xml', '.world': 'xml', '.srdf': 'xml',
    '.md': 'markdown', '.markdown': 'markdown',
    '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
    '.mk': 'makefile',
    '.ini': 'ini', '.cfg': 'ini', '.conf': 'ini',
    '.lua': 'lua',
    '.rs': 'rust',
    '.proto': 'proto',
};

const NAME_TO_LANGUAGE: Record<string, string> = {
    'cmakelists.txt': 'cmake',
    'makefile': 'makefile',
    'gnumakefile': 'makefile',
    'dockerfile': 'dockerfile',
    'containerfile': 'dockerfile',
};

@injectable()
export class LanguageActivationContribution implements FrontendApplicationContribution {

    @inject(EditorManager)   protected readonly editorManager!: EditorManager;
    @inject(MessageService)  protected readonly messages!: MessageService;

    onStart(): void {
        setTimeout(() => this.report(), 2500);
        this.editorManager.onCreated(() => setTimeout(() => this.sweep(false), 300));
    }

    /** Runs once shortly after startup and tells the user exactly what it found. */
    private report(): void {
        const result = this.sweep(false);
        const text = result.detail
            ? `Rovant languages: ${result.detail}`
            : `Rovant languages: ${result.checked} open file(s), ${result.applied} set to a language.`;
        console.info('[Rovant] ' + text);
        // Visible in the UI so the user can report it without opening DevTools.
        this.messages.info(text, { timeout: 15000 });
    }

    private sweep(verbose: boolean): { checked: number; applied: number; detail?: string } {
        const monacoAny = (typeof monaco !== 'undefined' ? monaco : undefined) as any;
        if (!monacoAny || !monacoAny.editor || typeof monacoAny.editor.getModels !== 'function') {
            return { checked: 0, applied: 0, detail: 'monaco.editor.getModels is not available' };
        }
        if (!monacoAny.languages || typeof monacoAny.languages.getLanguages !== 'function') {
            return { checked: 0, applied: 0, detail: 'monaco.languages is not available' };
        }
        try {
            const known: string[] = monacoAny.languages.getLanguages().map((l: any) => l.id);
            const models = monacoAny.editor.getModels();
            let applied = 0;
            for (const model of models) {
                const id = this.languageFor(model.uri.path);
                if (id && model.getLanguageId() !== id) {
                    monacoAny.editor.setModelLanguage(model, id);
                    applied++;
                }
            }
            if (verbose) console.info('[Rovant] languages known to monaco:', known.join(','));
            // If a language we want is NOT registered, say so — that is the real bug.
            const wanted = ['python', 'cpp', 'cmake'];
            const missing = wanted.filter(w => !known.includes(w));
            if (missing.length) {
                return { checked: models.length, applied,
                         detail: `${models.length} file(s), ${applied} set, but monaco does NOT know: ${missing.join(', ')}` };
            }
            return { checked: models.length, applied };
        } catch (err: any) {
            return { checked: 0, applied: 0, detail: 'sweep failed: ' + (err?.message ?? err) };
        }
    }

    private languageFor(path: string): string | undefined {
        const lower = path.toLowerCase();
        const slash = lower.lastIndexOf('/');
        const base = slash >= 0 ? lower.slice(slash + 1) : lower;
        const byName = NAME_TO_LANGUAGE[base];
        if (byName) return byName;
        const dot = lower.lastIndexOf('.');
        if (dot < 0) return undefined;
        return EXT_TO_LANGUAGE[lower.slice(dot)];
    }
}
