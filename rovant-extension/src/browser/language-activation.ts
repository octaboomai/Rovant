import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';

import * as monaco from '@theia/monaco-editor-core';
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


    /**
     * Make sure Monaco knows these language ids. Idempotent: an id that is
     * already registered (by our grammar contributions or by a bundled
     * extension) is left alone.
     */
    private ensureLanguages(): void {
        const wanted: Array<{ id: string; extensions: string[]; aliases?: string[] }> = [
            { id: 'python',   extensions: ['.py', '.pyw', '.pyi'],                          aliases: ['Python', 'py'] },
            { id: 'cpp',      extensions: ['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.ino'], aliases: ['C', 'C++'] },
            { id: 'cmake',    extensions: ['.cmake'],                                       aliases: ['CMake'] },
            { id: 'xml',      extensions: ['.xml', '.urdf', '.xacro', '.launch', '.sdf', '.world', '.srdf'], aliases: ['XML'] },
            { id: 'yaml',     extensions: ['.yaml', '.yml'],                                aliases: ['YAML'] },
            { id: 'markdown', extensions: ['.md', '.markdown'],                             aliases: ['Markdown'] },
            { id: 'shell',    extensions: ['.sh', '.bash', '.zsh'],                         aliases: ['Shell'] },
            { id: 'makefile', extensions: ['.mk'],                                          aliases: ['Makefile'] },
            { id: 'ini',      extensions: ['.ini', '.cfg', '.conf'],                        aliases: ['INI'] },
            { id: 'dockerfile', extensions: ['.dockerfile'],                                aliases: ['Dockerfile'] },
            { id: 'ros-msg',  extensions: ['.msg'],                                         aliases: ['ROS Message'] },
            { id: 'ros-srv',  extensions: ['.srv'],                                         aliases: ['ROS Service'] },
            { id: 'ros-action', extensions: ['.action'],                                    aliases: ['ROS Action'] },
        ];

        let known: string[] = [];
        try {
            known = monaco.languages.getLanguages().map(l => l.id);
        } catch {
            // getLanguages unavailable — fall through and attempt registration.
        }

        for (const lang of wanted) {
            if (known.includes(lang.id)) continue;
            try {
                monaco.languages.register({ id: lang.id, extensions: lang.extensions, aliases: lang.aliases });
            } catch (err) {
                console.warn(`[Rovant] could not register language ${lang.id}`, err);
            }
        }
    }

    onStart(): void {
        // Register the language ids first, unconditionally.
        //
        // The grammars in the other contributions go through
        // LanguageGrammarDefinitionContribution, and when that path fails the
        // language simply does not exist. The symptom is not an obvious error:
        // a .py file opens as "Plain Text", and the bundled Python extension
        // fails with "Cannot set configuration for unknown language python".
        // Declaring the ids here means extension→language mapping always works,
        // even if grammar registration has a bad day.
        this.ensureLanguages();

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
