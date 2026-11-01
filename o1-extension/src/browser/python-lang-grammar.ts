import { injectable } from '@theia/core/shared/inversify';
import { LanguageGrammarDefinitionContribution } from '@theia/monaco/lib/browser/textmate/textmate-contribution';
import { TextmateRegistry } from '@theia/monaco/lib/browser/textmate/textmate-registry';

/** Force the language onto already-open models: Theia assigns a language when an
 *  editor is created, so a file opened before registration (or restored from the
 *  previous session) stays "plaintext" forever. Re-apply it by extension. */
function applyModelLanguages(map: Record<string, string>): void {
    try {
        for (const model of monaco.editor.getModels()) {
            const p = model.uri.path.toLowerCase();
            const dot = p.lastIndexOf('.');
            if (dot < 0) continue;
            const id = map[p.slice(dot)];
            if (id && model.getLanguageId() !== id) {
                monaco.editor.setModelLanguage(model, id);
            }
        }
    } catch (err) {
        console.error('[Rovant] could not apply model languages', err);
    }
}

const PY_EXT: Record<string, string> = { '.py': 'python', '.pyw': 'python', '.pyi': 'python' };


/**
 * FEATURE: Python language support (.py / .pyw / .pyi)
 *
 * Theia ships no Python language, so without this a `.py` file opens as *plain text*:
 * no syntax highlighting, and no language id for a language server (pyright) to attach
 * to. Registering the language here fixes both.
 */
@injectable()
export class PythonLangGrammarContribution implements LanguageGrammarDefinitionContribution {
    readonly PYTHON_LANGUAGE_ID = 'python';

    registerTextmateLanguage(_registry: TextmateRegistry): void {
        // Guarded: this runs during frontend startup, and an exception here would
        // leave the whole IDE stuck on its loading spinner.
        try {
            this.register();
        } catch (err) {
            console.error('[Rovant] python language registration failed', err);
        }
    }

    private register(): void {
        monaco.languages.register({
            id: this.PYTHON_LANGUAGE_ID,
            extensions: ['.py', '.pyw', '.pyi'],
            aliases: ['Python', 'python', 'py'],
            mimetypes: ['text/x-python'],
        });

        monaco.languages.setMonarchTokensProvider(this.PYTHON_LANGUAGE_ID, PYTHON_MONARCH);
        monaco.languages.setLanguageConfiguration(this.PYTHON_LANGUAGE_ID, PYTHON_CONFIGURATION);

        monaco.languages.registerCompletionItemProvider(this.PYTHON_LANGUAGE_ID, {
            provideCompletionItems(model, position) {
                const word = model.getWordUntilPosition(position);
                const range: monaco.IRange = {
                    startLineNumber: position.lineNumber,
                    endLineNumber:   position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn:   word.endColumn,
                };
                const suggest = (items: string[], kind: monaco.languages.CompletionItemKind) =>
                    items.map(label => ({ label, kind, insertText: label, range }));
                return {
                    suggestions: [
                        ...suggest(PYTHON_KEYWORDS, monaco.languages.CompletionItemKind.Keyword),
                        ...suggest(PYTHON_BUILTINS, monaco.languages.CompletionItemKind.Function),
                    ],
                };
            }
        });
    }
}

const PYTHON_KEYWORDS = [
    'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
    'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import',
    'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
    'True', 'try', 'while', 'with', 'yield', 'match', 'case',
];

const PYTHON_BUILTINS = [
    'abs', 'all', 'any', 'bool', 'bytes', 'callable', 'chr', 'dict', 'dir', 'divmod',
    'enumerate', 'eval', 'filter', 'float', 'format', 'frozenset', 'getattr', 'globals',
    'hasattr', 'hash', 'help', 'hex', 'id', 'input', 'int', 'isinstance', 'issubclass',
    'iter', 'len', 'list', 'locals', 'map', 'max', 'min', 'next', 'object', 'oct', 'open',
    'ord', 'pow', 'print', 'range', 'repr', 'reversed', 'round', 'set', 'setattr', 'slice',
    'sorted', 'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip', 'self', 'cls',
];

const PYTHON_MONARCH: monaco.languages.IMonarchLanguage = {
    defaultToken: '',
    tokenPostfix: '.python',

    keywords: PYTHON_KEYWORDS,
    builtins: PYTHON_BUILTINS,

    tokenizer: {
        root: [
            [/#.*$/, 'comment'],
            [/@[A-Za-z_]\w*/, 'annotation'],
            [/[rRbBuUfF]{0,2}"""/, { token: 'string.quote', next: '@docstring' }],
            [/[rRbBuUfF]{0,2}'''/, { token: 'string.quote', next: '@docstringSingle' }],
            [/[rRbBuUfF]{0,2}"/, { token: 'string.quote', next: '@stringDouble' }],
            [/[rRbBuUfF]{0,2}'/, { token: 'string.quote', next: '@stringSingle' }],
            [/\b\d+(\.\d+)?([eE][+-]?\d+)?[jJ]?\b/, 'number'],
            [/\b[A-Za-z_]\w*(?=\s*\()/, 'identifier'],
            [/\b[A-Za-z_]\w*\b/, {
                cases: {
                    '@keywords': 'keyword',
                    '@builtins': 'type.identifier',
                    '@default': 'identifier',
                }
            }],
            [/[{}()\[\]]/, '@brackets'],
            [/[=><!~?:&|+\-*/^%]+/, 'operator'],
            [/\s+/, 'white'],
        ],
        docstring: [
            [/[^"]+/, 'string'],
            [/"""/, { token: 'string.quote', next: '@pop' }],
        ],
        docstringSingle: [
            [/[^']+/, 'string'],
            [/'''/, { token: 'string.quote', next: '@pop' }],
        ],
        stringDouble: [
            [/[^\\"]+/, 'string'],
            [/\\./, 'string.escape'],
            [/"/, { token: 'string.quote', next: '@pop' }],
        ],
        stringSingle: [
            [/[^\\']+/, 'string'],
            [/\\./, 'string.escape'],
            [/'/, { token: 'string.quote', next: '@pop' }],
        ],
    },
};

const PYTHON_CONFIGURATION: monaco.languages.LanguageConfiguration = {
    comments: { lineComment: '#' },
    brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
    ],
    autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
    ],
    surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
    ],
    indentationRules: {
        increaseIndentPattern: /^\s*(class|def|if|elif|else|for|while|try|except|finally|with|match|case)\b.*:\s*(#.*)?$/,
        decreaseIndentPattern: /^\s*(elif|else|except|finally|case)\b/,
    },
    onEnterRules: [
        {
            beforeText: /^\s*(class|def|if|elif|else|for|while|try|except|finally|with|match|case)\b.*:\s*(#.*)?$/,
            action: { indentAction: 1 as monaco.languages.IndentAction },
        },
    ],
};
