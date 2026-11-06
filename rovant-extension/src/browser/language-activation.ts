import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';

import { applyModelLanguages, whenMonacoReady } from './monaco-safe';

/**
 * Re-apply the correct language to already-open editors.
 *
 * Theia decides a model's language when the model is created. A file opened before
 * the grammars register — or restored from the previous session — keeps `plaintext`
 * for the rest of the session. This sweep corrects that, and runs again shortly
 * after each editor is created.
 *
 * Diagnostics go to the console only. An earlier version surfaced a notification
 * reading "monaco.editor.getModels is not available", which told the user about an
 * internal timing detail they can do nothing about.
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

const MAP: Record<string, string> = { ...EXT_TO_LANGUAGE, ...NAME_TO_LANGUAGE };

@injectable()
export class LanguageActivationContribution implements FrontendApplicationContribution {

    @inject(EditorManager) protected readonly editorManager!: EditorManager;

    onStart(): void {
        // Wait for the editor API rather than assuming it is attached at startup.
        whenMonacoReady(() => {
            const applied = applyModelLanguages(MAP);
            if (applied > 0) {
                console.info(`[Rovant] applied a language to ${applied} restored editor(s)`);
            }
        });

        // Re-sweep shortly after any editor is created, once its model exists.
        this.editorManager.onCreated(() => {
            setTimeout(() => applyModelLanguages(MAP), 300);
        });
    }
}
