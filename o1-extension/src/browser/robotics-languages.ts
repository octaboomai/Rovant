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

/** extension -> language id for the model sweep (built lazily; ROBOTICS_LANGUAGES
 *  is declared further down this file). */
function extToLanguage(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const spec of ROBOTICS_LANGUAGES) {
        for (const ext of spec.extensions) map[ext.toLowerCase()] = spec.id;
    }
    return map;
}


/**
 * FEATURE: languages used in robotics / drone development.
 *
 * Theia's bundled Monaco (`@theia/monaco-editor-core`) is a trimmed build with **no**
 * basic languages, so without this a `.cmake`, `.yaml`, `.urdf`, `.launch`, `CMakeLists.txt`
 * … all open as *plain text*. Python is registered separately in `python-lang-grammar.ts`.
 *
 * Covered here: C/C++ · CMake · YAML · XML (URDF / xacro / launch / SDF) · Markdown ·
 * Shell · Makefile · Dockerfile · INI · Lua · Rust · Protocol Buffers.
 */
@injectable()
export class RoboticsLanguagesContribution implements LanguageGrammarDefinitionContribution {

    registerTextmateLanguage(_registry: TextmateRegistry): void {
        // Never let language registration take the IDE down: a failure here runs
        // during frontend startup and would otherwise leave the app on its spinner.
        try {
            this.registerAll();
        } catch (err) {
            console.error('[Rovant] language registration failed', err);
        }
    }

    private registerAll(): void {
        const alreadyRegistered = new Set(monaco.languages.getLanguages().map(l => l.id));
        for (const spec of ROBOTICS_LANGUAGES) {
            if (alreadyRegistered.has(spec.id)) {
                continue;   // never double-register an id Monaco already knows
            }
            try {
                monaco.languages.register({
                    id: spec.id,
                    extensions: spec.extensions,
                    filenames: spec.filenames,
                    aliases: spec.aliases,
                    mimetypes: spec.mimetypes,
                });
                monaco.languages.setMonarchTokensProvider(spec.id, spec.monarch);
                if (spec.configuration) {
                    monaco.languages.setLanguageConfiguration(spec.id, spec.configuration);
                }
            } catch (err) {
                // Skip just this language; keep the rest of the IDE working.
                console.error('[Rovant] could not register language', spec.id, err);
            }
        }
    }
}

interface LangSpec {
    id: string;
    extensions: string[];
    filenames?: string[];
    aliases: string[];
    mimetypes?: string[];
    monarch: monaco.languages.IMonarchLanguage;
    configuration?: monaco.languages.LanguageConfiguration;
}

const C_LIKE: monaco.languages.LanguageConfiguration = {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
        { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
        { open: '"', close: '"' }, { open: "'", close: "'" },
    ],
    surroundingPairs: [
        { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' },
        { open: '"', close: '"' }, { open: "'", close: "'" },
    ],
};

const ROBOTICS_LANGUAGES: LangSpec[] = [
    // ── C / C++ ──────────────────────────────────────────────────────────────
    {
        id: 'cpp',
        extensions: ['.c', '.h', '.cc', '.cpp', '.cxx', '.c++', '.hpp', '.hh', '.hxx', '.ino'],
        aliases: ['C', 'C++', 'cpp'],
        mimetypes: ['text/x-c', 'text/x-c++'],
        configuration: C_LIKE,
        monarch: {
            defaultToken: '',
            keywords: ['alignas', 'alignof', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'class',
                'const', 'constexpr', 'continue', 'decltype', 'default', 'delete', 'do', 'double', 'else',
                'enum', 'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'goto', 'if',
                'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept', 'nullptr', 'operator',
                'override', 'final', 'private', 'protected', 'public', 'register', 'return', 'short',
                'signed', 'sizeof', 'static', 'struct', 'switch', 'template', 'this', 'throw', 'true',
                'try', 'typedef', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile',
                'while'],
            tokenizer: {
                root: [
                    [/\/\/.*$/, 'comment'],
                    [/\/\*/, 'comment', '@blockComment'],
                    [/^\s*#\s*\w+/, 'keyword.directive'],
                    [/[rRuU]{0,2}"[^"]*"/, 'string'],
                    [/"/, 'string', '@string'],
                    [/'/, 'string', '@char'],
                    [/\b\d+(\.\d+)?([eE][+-]?\d+)?[fFuUlL]*\b/, 'number'],
                    [/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
                    [/[{}()\[\]]/, '@brackets'],
                    [/[=><!~?:&|+\-*/^%]+/, 'operator'],
                    [/\s+/, 'white'],
                ],
                blockComment: [[/[^*/]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/[*/]/, 'comment']],
                string: [[/[^\\"]+/, 'string'], [/\\./, 'string.escape'], [/"/, 'string', '@pop']],
                char: [[/[^\\']+/, 'string'], [/\\./, 'string.escape'], [/'/, 'string', '@pop']],
            },
        },
    },

    // ── CMake (ROS build system) ─────────────────────────────────────────────
    {
        id: 'cmake',
        extensions: ['.cmake'],
        filenames: ['CMakeLists.txt'],
        aliases: ['CMake'],
        configuration: {
            comments: { lineComment: '#' },
            brackets: [['(', ')'], ['[', ']']],
            autoClosingPairs: [{ open: '(', close: ')' }, { open: '"', close: '"' }],
        },
        monarch: {
            defaultToken: '',
            commands: ['add_compile_options', 'add_custom_command', 'add_custom_target', 'add_definitions',
                'add_dependencies', 'add_executable', 'add_library', 'add_subdirectory', 'add_test',
                'aux_source_directory', 'cmake_minimum_required', 'cmake_policy', 'configure_file',
                'enable_testing', 'execute_process', 'file', 'find_library', 'find_package', 'find_program',
                'include', 'include_directories', 'install', 'list', 'message', 'option', 'project',
                'set', 'set_property', 'string', 'target_compile_definitions', 'target_compile_features',
                'target_compile_options', 'target_include_directories', 'target_link_libraries',
                'target_sources', 'unset'],
            controls: ['if', 'else', 'elseif', 'endif', 'foreach', 'endforeach', 'while', 'endwhile',
                'function', 'endfunction', 'macro', 'endmacro', 'return', 'break', 'continue'],
            tokenizer: {
                root: [
                    [/#.*$/, 'comment'],
                    [/\$\{[^}]*\}/, 'variable'],
                    [/\$ENV\{[^}]*\}/, 'variable'],
                    [/"/, 'string', '@string'],
                    [/\b[A-Za-z_]\w*(?=\s*\()/, {
                        cases: { '@commands': 'type', '@controls': 'keyword.control', '@default': 'identifier' }
                    }],
                    [/\b\d+(\.\d+)*\b/, 'number'],
                    [/[()]/, '@brackets'],
                    [/\w+/, 'identifier'],
                ],
                string: [[/[^\\"]+/, 'string'], [/\\./, 'string.escape'], [/"/, 'string', '@pop']],
            },
        },
    },

    // ── YAML (ROS launch / params / config) ──────────────────────────────────
    {
        id: 'yaml',
        extensions: ['.yaml', '.yml'],
        aliases: ['YAML', 'yaml'],
        configuration: {
            comments: { lineComment: '#' },
            brackets: [['{', '}'], ['[', ']']],
            autoClosingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' },
                { open: '"', close: '"' }, { open: "'", close: "'" }],
        },
        monarch: {
            defaultToken: '',
            tokenizer: {
                root: [
                    [/#.*$/, 'comment'],
                    [/^(---|\.\.\.)\s*$/, 'delimiter'],
                    [/^\s*-\s/, 'keyword'],
                    [/^\s*[\w.\-/]+(?=\s*:(?!:))/, 'type'],
                    [/[|>][-+]?\s*$/, 'string'],
                    [/"/, 'string', '@double'],
                    [/'/, 'string', '@single'],
                    [/\b(true|false|yes|no|on|off|True|False|Null|null|~)\b/, 'keyword'],
                    [/-?\b\d+(\.\d+)?\b/, 'number'],
                    [/[&*!][\w-]*/, 'variable'],
                    [/[\[\]{},]/, '@brackets'],
                    [/:/, 'delimiter'],
                ],
                double: [[/[^\\"]+/, 'string'], [/\\./, 'string.escape'], [/"/, 'string', '@pop']],
                single: [[/[^']+/, 'string'], [/'/, 'string', '@pop']],
            },
        },
    },

    // ── XML: URDF / xacro / launch / SDF / world ─────────────────────────────
    {
        id: 'xml',
        extensions: ['.xml', '.urdf', '.xacro', '.launch', '.sdf', '.world', '.srdf', '.xacro.xml'],
        aliases: ['XML', 'URDF', 'Xacro', 'Launch', 'SDF', 'xml'],
        mimetypes: ['text/xml'],
        configuration: {
            comments: { blockComment: ['<!--', '-->'] },
            brackets: [['<', '>']],
            autoClosingPairs: [{ open: '<', close: '>' }, { open: '"', close: '"' }, { open: "'", close: "'" }],
        },
        monarch: {
            defaultToken: '',
            tokenizer: {
                root: [
                    [/<!--/, 'comment', '@comment'],
                    [/<\?[\s\S]*?\?>/, 'metatag'],
                    [/<!DOCTYPE/, 'metatag', '@doctype'],
                    [/<\/([\w:.\-]+)\s*>/, 'tag'],
                    [/<([\w:.\-]+)/, 'tag'],
                    [/([\w:.\-]+)(?=\s*=)/, 'attribute.name'],
                    [/=/, 'delimiter'],
                    [/"/, 'string', '@attrValue'],
                    [/'/, 'string', '@attrValueSingle'],
                    [/\/>/, 'tag'],
                    [/>/, 'tag'],
                    [/\s+/, 'white'],
                ],
                comment: [[/[^-]+/, 'comment'], [/-->/, 'comment', '@pop'], [/-/, 'comment']],
                doctype: [[/[^>]+/, 'metatag'], [/>/, 'metatag', '@pop']],
                attrValue: [[/[^"]+/, 'string'], [/"/, 'string', '@pop']],
                attrValueSingle: [[/[^']+/, 'string'], [/'/, 'string', '@pop']],
            },
        },
    },

    // ── Markdown ─────────────────────────────────────────────────────────────
    {
        id: 'markdown',
        extensions: ['.md', '.markdown', '.mdx'],
        aliases: ['Markdown', 'markdown'],
        configuration: { comments: { blockComment: ['<!--', '-->'] } },
        monarch: {
            defaultToken: '',
            tokenizer: {
                root: [
                    [/^\s*#{1,6}\s.*$/, 'keyword'],
                    [/^\s*([-*+]|\d+\.)\s/, 'keyword'],
                    [/^\s*>.*$/, 'comment'],
                    [/```.*$/, 'string', '@fence'],
                    [/`[^`]*`/, 'string'],
                    [/\*\*[^*]+\*\*/, 'strong'],
                    [/\*[^*]+\*/, 'emphasis'],
                    [/\[[^\]]*\]\([^)]*\)/, 'string'],
                    [/^\s*([-*_]\s*){3,}$/, 'delimiter'],
                    [/<!--/, 'comment', '@comment'],
                ],
                fence: [[/```.*$/, 'string', '@pop'], [/.*$/, 'string']],
                comment: [[/[^-]+/, 'comment'], [/-->/, 'comment', '@pop'], [/-/, 'comment']],
            },
        },
    },

    // ── Shell (ROS setup / build scripts) ────────────────────────────────────
    {
        id: 'shell',
        extensions: ['.sh', '.bash', '.zsh', '.ksh'],
        filenames: ['.bashrc', '.bash_profile', '.profile', '.zshrc'],
        aliases: ['Shell', 'Bash', 'sh'],
        configuration: {
            comments: { lineComment: '#' },
            brackets: [['{', '}'], ['[', ']'], ['(', ')']],
            autoClosingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' },
                { open: '(', close: ')' }, { open: '"', close: '"' }, { open: "'", close: "'" }],
        },
        monarch: {
            defaultToken: '',
            keywords: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case',
                'esac', 'function', 'in', 'select', 'time', 'return', 'break', 'continue', 'local',
                'export', 'readonly', 'declare', 'source', 'alias', 'unalias', 'set', 'unset', 'shift',
                'trap', 'eval', 'exec', 'exit'],
            builtins: ['echo', 'printf', 'read', 'cd', 'pwd', 'ls', 'cp', 'mv', 'rm', 'mkdir', 'cat',
                'grep', 'sed', 'awk', 'find', 'test', 'true', 'false', 'sleep', 'kill', 'sudo', 'apt',
                'apt-get', 'colcon', 'ros2', 'rosdep', 'source'],
            tokenizer: {
                root: [
                    [/^\s*#!.*$/, 'comment.doc'],
                    [/#.*$/, 'comment'],
                    [/\$\{[^}]*\}/, 'variable'],
                    [/\$[A-Za-z_]\w*/, 'variable'],
                    [/\$[0-9@*#?$!]/, 'variable'],
                    [/"/, 'string', '@double'],
                    [/'/, 'string', '@single'],
                    [/\b[A-Za-z_]\w*(?=\s*\(\))/, 'type'],
                    [/\b[A-Za-z_]\w*/, {
                        cases: { '@keywords': 'keyword', '@builtins': 'predefined', '@default': 'identifier' }
                    }],
                    [/\b\d+\b/, 'number'],
                    [/[{}()\[\]]/, '@brackets'],
                    [/[=><!~?:&|+\-*/^%]+/, 'operator'],
                ],
                double: [[/[^\\"$]+/, 'string'], [/\\./, 'string.escape'], [/\$[A-Za-z_]\w*/, 'variable'],
                    [/\$\{[^}]*\}/, 'variable'], [/"/, 'string', '@pop']],
                single: [[/[^']+/, 'string'], [/'/, 'string', '@pop']],
            },
        },
    },

    // ── Makefile ─────────────────────────────────────────────────────────────
    {
        id: 'makefile',
        extensions: ['.mk', '.mak'],
        filenames: ['Makefile', 'makefile', 'GNUmakefile'],
        aliases: ['Makefile', 'make'],
        configuration: { comments: { lineComment: '#' }, brackets: [['(', ')'], ['{', '}']] },
        monarch: {
            defaultToken: '',
            tokenizer: {
                root: [
                    [/^\s*#.*$/, 'comment'],
                    [/^\t+/, 'white'],
                    [/^\s*[\w./%$()-]+(?=\s*:(?!=))/, 'type'],
                    [/\$\([^)]*\)/, 'variable'],
                    [/\$\{[^}]*\}/, 'variable'],
                    [/\$[@<^?*+]/, 'variable'],
                    [/\b(ifeq|ifneq|ifdef|ifndef|else|endif|include|-include|define|endef|export|unexport|override|vpath)\b/, 'keyword'],
                    [/"([^"\\]|\\.)*"/, 'string'],
                    [/'([^'\\]|\\.)*'/, 'string'],
                    [/\b\d+\b/, 'number'],
                    [/\S+/, 'identifier'],
                ],
            },
        },
    },

    // ── Dockerfile (containerised robotics) ──────────────────────────────────
    {
        id: 'dockerfile',
        extensions: ['.dockerfile'],
        filenames: ['Dockerfile', 'Containerfile'],
        aliases: ['Dockerfile', 'docker'],
        configuration: { comments: { lineComment: '#' } },
        monarch: {
            defaultToken: '',
            instructions: ['FROM', 'RUN', 'CMD', 'LABEL', 'MAINTAINER', 'EXPOSE', 'ENV', 'ADD', 'COPY',
                'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK',
                'SHELL'],
            tokenizer: {
                root: [
                    [/^\s*#.*$/, 'comment'],
                    [/^\s*(ONBUILD)\b/, 'keyword'],
                    [/\b(FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|STOPSIGNAL|HEALTHCHECK|SHELL)\b/,
                        'keyword'],
                    [/\$\{[^}]*\}/, 'variable'],
                    [/\$[A-Za-z_]\w*/, 'variable'],
                    [/"/, 'string', '@double'],
                    [/'/, 'string', '@single'],
                    [/\b\d+\b/, 'number'],
                    [/\S+/, 'identifier'],
                ],
                double: [[/[^\\"$]+/, 'string'], [/\\./, 'string.escape'], [/\$[A-Za-z_]\w*/, 'variable'],
                    [/"/, 'string', '@pop']],
                single: [[/[^']+/, 'string'], [/'/, 'string', '@pop']],
            },
        },
    },

    // ── INI / .cfg / .conf ───────────────────────────────────────────────────
    {
        id: 'ini',
        extensions: ['.ini', '.cfg', '.conf', '.properties'],
        filenames: ['.gitconfig', '.editorconfig'],
        aliases: ['INI', 'ini', 'cfg'],
        configuration: { comments: { lineComment: '#' }, brackets: [['[', ']']] },
        monarch: {
            defaultToken: '',
            tokenizer: {
                root: [
                    [/^\s*[#;].*$/, 'comment'],
                    [/^\s*\[[^\]]*\]/, 'type'],
                    [/^\s*[^=:#]+(?=\s*[=:])/, 'attribute.name'],
                    [/[=:]/, 'delimiter'],
                    [/"/, 'string', '@double'],
                    [/'/, 'string', '@single'],
                    [/\b(true|false|yes|no|on|off)\b/, 'keyword'],
                    [/-?\b\d+(\.\d+)?\b/, 'number'],
                    [/\S+/, 'string'],
                ],
                double: [[/[^"]+/, 'string'], [/"/, 'string', '@pop']],
                single: [[/[^']+/, 'string'], [/'/, 'string', '@pop']],
            },
        },
    },

    // ── Lua (Gazebo / simulation plugins) ────────────────────────────────────
    {
        id: 'lua',
        extensions: ['.lua'],
        aliases: ['Lua', 'lua'],
        configuration: {
            comments: { lineComment: '--', blockComment: ['--[[', ']]'] },
            brackets: [['{', '}'], ['[', ']'], ['(', ')']],
            autoClosingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' },
                { open: '(', close: ')' }, { open: '"', close: '"' }, { open: "'", close: "'" }],
        },
        monarch: {
            defaultToken: '',
            keywords: ['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto',
                'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until',
                'while', 'self'],
            builtins: ['print', 'pairs', 'ipairs', 'type', 'tostring', 'tonumber', 'require', 'error',
                'assert', 'pcall', 'setmetatable', 'getmetatable', 'rawget', 'rawset', 'next', 'select'],
            tokenizer: {
                root: [
                    [/--\[\[/, 'comment', '@blockComment'],
                    [/--.*$/, 'comment'],
                    [/\b\d+(\.\d+)?\b/, 'number'],
                    [/"/, 'string', '@double'],
                    [/'/, 'string', '@single'],
                    [/\b[A-Za-z_]\w*/, {
                        cases: { '@keywords': 'keyword', '@builtins': 'predefined', '@default': 'identifier' }
                    }],
                    [/[{}()\[\]]/, '@brackets'],
                    [/[=><!~?:&|+\-*/^%#]+/, 'operator'],
                ],
                blockComment: [[/[^\]]+/, 'comment'], [/\]\]/, 'comment', '@pop'], [/\]/, 'comment']],
                double: [[/[^\\"]+/, 'string'], [/\\./, 'string.escape'], [/"/, 'string', '@pop']],
                single: [[/[^\\']+/, 'string'], [/\\./, 'string.escape'], [/'/, 'string', '@pop']],
            },
        },
    },

    // ── Rust (ROS 2 rust bindings / embedded) ────────────────────────────────
    {
        id: 'rust',
        extensions: ['.rs'],
        aliases: ['Rust', 'rust'],
        configuration: C_LIKE,
        monarch: {
            defaultToken: '',
            keywords: ['as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else',
                'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod',
                'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super',
                'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while'],
            types: ['bool', 'char', 'f32', 'f64', 'i8', 'i16', 'i32', 'i64', 'i128', 'isize', 'str',
                'u8', 'u16', 'u32', 'u64', 'u128', 'usize', 'String', 'Vec', 'Option', 'Result', 'Box'],
            tokenizer: {
                root: [
                    [/\/\/\/.*$/, 'comment.doc'],
                    [/\/\/.*$/, 'comment'],
                    [/\/\*/, 'comment', '@blockComment'],
                    [/#!?\[[^\]]*\]/, 'annotation'],
                    [/\b\d+(\.\d+)?([eE][+-]?\d+)?[fiu]?(8|16|32|64|128|size)?\b/, 'number'],
                    [/"/, 'string', '@string'],
                    [/'[A-Za-z_]\w*/, 'variable'],
                    [/\b[A-Za-z_]\w*!/, 'predefined'],
                    [/\b[A-Za-z_]\w*/, {
                        cases: { '@keywords': 'keyword', '@types': 'type.identifier', '@default': 'identifier' }
                    }],
                    [/[{}()\[\]]/, '@brackets'],
                    [/[=><!~?:&|+\-*/^%]+/, 'operator'],
                ],
                blockComment: [[/[^*/]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/[*/]/, 'comment']],
                string: [[/[^\\"]+/, 'string'], [/\\./, 'string.escape'], [/"/, 'string', '@pop']],
            },
        },
    },

    // ── Protocol Buffers ─────────────────────────────────────────────────────
    {
        id: 'proto',
        extensions: ['.proto'],
        aliases: ['Protocol Buffers', 'protobuf'],
        configuration: { comments: { lineComment: '//', blockComment: ['/*', '*/'] },
            brackets: [['{', '}'], ['[', ']'], ['(', ')']] },
        monarch: {
            defaultToken: '',
            keywords: ['syntax', 'package', 'import', 'option', 'message', 'enum', 'service', 'rpc',
                'returns', 'repeated', 'optional', 'required', 'oneof', 'reserved', 'extend', 'extensions',
                'stream', 'map'],
            types: ['double', 'float', 'int32', 'int64', 'uint32', 'uint64', 'sint32', 'sint64', 'fixed32',
                'fixed64', 'sfixed32', 'sfixed64', 'bool', 'string', 'bytes'],
            tokenizer: {
                root: [
                    [/\/\/.*$/, 'comment'],
                    [/\/\*/, 'comment', '@blockComment'],
                    [/"/, 'string', '@string'],
                    [/\b\d+(\.\d+)?\b/, 'number'],
                    [/\b[A-Za-z_]\w*/, {
                        cases: { '@keywords': 'keyword', '@types': 'type.identifier', '@default': 'identifier' }
                    }],
                    [/[{}()\[\]]/, '@brackets'],
                    [/[=;]/, 'delimiter'],
                ],
                blockComment: [[/[^*/]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/[*/]/, 'comment']],
                string: [[/[^\\"]+/, 'string'], [/\\./, 'string.escape'], [/"/, 'string', '@pop']],
            },
        },
    },
];
