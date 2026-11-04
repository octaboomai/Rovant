import { injectable } from '@theia/core/shared/inversify';
import { LanguageGrammarDefinitionContribution } from '@theia/monaco/lib/browser/textmate/textmate-contribution';
import { TextmateRegistry } from '@theia/monaco/lib/browser/textmate/textmate-registry';

/**
 * FEATURE 4: .msg / .srv / .action highlighting + IntelliSense
 */
@injectable()
export class RosLangGrammarContribution implements LanguageGrammarDefinitionContribution {
    readonly MSG_LANGUAGE_ID    = 'ros-msg';
    readonly SRV_LANGUAGE_ID    = 'ros-srv';
    readonly ACTION_LANGUAGE_ID = 'ros-action';

    registerTextmateLanguage(registry: TextmateRegistry): void {
        // Register language IDs
        monaco.languages.register({ id: this.MSG_LANGUAGE_ID,    extensions: ['.msg'],    aliases: ['ROS Message', 'ros-msg']  });
        monaco.languages.register({ id: this.SRV_LANGUAGE_ID,    extensions: ['.srv'],    aliases: ['ROS Service', 'ros-srv']  });
        monaco.languages.register({ id: this.ACTION_LANGUAGE_ID, extensions: ['.action'], aliases: ['ROS Action',  'ros-action'] });

        // TextMate grammar scope → content mapping
        const scopes: Record<string, string> = {
            'source.ros.msg':    this.MSG_LANGUAGE_ID,
            'source.ros.srv':    this.SRV_LANGUAGE_ID,
            'source.ros.action': this.ACTION_LANGUAGE_ID,
        };

        for (const [scope, langId] of Object.entries(scopes)) {
            const capturedScope = scope;
            registry.registerTextmateGrammarScope(capturedScope, {
                async getGrammarDefinition() {
                    return {
                        format: 'json' as const,
                        content: {
                            scopeName: capturedScope,
                            patterns: [
                                { include: '#comment'    },
                                { include: '#separator'  },
                                { include: '#constant'   },
                                { include: '#type-field' },
                            ],
                            repository: {
                                comment: {
                                    name: 'comment.line.number-sign.ros',
                                    match: '#.*$'
                                },
                                separator: {
                                    name: 'keyword.operator.ros',
                                    match: '^---$'
                                },
                                constant: {
                                    match: '^(\\w+)\\s+(\\w+)\\s*=\\s*(.+)$',
                                    captures: {
                                        '1': { name: 'storage.type.ros' },
                                        '2': { name: 'variable.other.constant.ros' },
                                        '3': { name: 'constant.other.ros' },
                                    }
                                },
                                'type-field': {
                                    match: '^((?:bool|int8|int16|int32|int64|uint8|uint16|uint32|uint64|float32|float64|string|time|duration|byte|char|\\w+\\/\\w+)(?:\\[\\d*\\])?)\\s+(\\w+)',
                                    captures: {
                                        '1': { name: 'storage.type.ros' },
                                        '2': { name: 'variable.other.member.ros' },
                                    }
                                }
                            }
                        }
                    };
                }
            });
            registry.mapLanguageIdToTextmateGrammar(langId, capturedScope);
        }

        // Monarch tokenizer fallback for editors that don't use TextMate
        const monarchTokens: monaco.languages.IMonarchLanguage = {
            defaultToken: '',
            tokenizer: {
                root: [
                    [/#.*$/, 'comment'],
                    [/^---$/, 'keyword.operator'],
                    [/\b(bool|int8|int16|int32|int64|uint8|uint16|uint32|uint64|float32|float64|string|time|duration|byte|char)\b/, 'keyword.type'],
                    [/\d+(\.\d+)?/, 'number'],
                    [/"[^"]*"/, 'string'],
                    [/\w+/, 'identifier'],
                ]
            }
        };

        const primitives = [
            'bool','int8','int16','int32','int64','uint8','uint16','uint32','uint64',
            'float32','float64','string','time','duration','byte','char','Header',
        ];

        for (const langId of [this.MSG_LANGUAGE_ID, this.SRV_LANGUAGE_ID, this.ACTION_LANGUAGE_ID]) {
            monaco.languages.setMonarchTokensProvider(langId, monarchTokens);
            monaco.languages.setLanguageConfiguration(langId, {
                comments: { lineComment: '#' },
                brackets: [['[', ']']],
                autoClosingPairs: [{ open: '[', close: ']' }],
            });
            monaco.languages.registerCompletionItemProvider(langId, {
                provideCompletionItems(model, position) {
                    const word = model.getWordUntilPosition(position);
                    const range: monaco.IRange = {
                        startLineNumber: position.lineNumber,
                        endLineNumber:   position.lineNumber,
                        startColumn: word.startColumn,
                        endColumn:   word.endColumn,
                    };
                    return {
                        suggestions: primitives.map(p => ({
                            label:      p,
                            kind:       monaco.languages.CompletionItemKind.Keyword,
                            insertText: p,
                            range,
                        }))
                    };
                }
            });
        }
    }
}
