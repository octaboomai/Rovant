import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry, MAIN_MENU_BAR } from '@theia/core/lib/common/menu';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { MessageService } from '@theia/core/lib/common/message-service';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { TaskService } from '@theia/task/lib/browser/task-service';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { TaskScope } from '@theia/task/lib/common/task-protocol';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { UrdfViewerWidget } from './urdf-viewer/urdf-viewer-widget';
import { RosTopicsWidget } from './ros-topics/ros-topics-widget';
import { ToolchainInstallerWidget } from './toolchain/toolchain-installer';
import { TemplatesContribution } from './templates/templates-contribution';

export namespace O1Commands {
    export const OPEN_URDF_VIEWER:      Command = { id: 'o1.openUrdfViewer',     label: 'Open URDF Viewer'       };
    export const OPEN_ROS_TOPICS:       Command = { id: 'o1.openRosTopics',      label: 'Open ROS Topics'        };
    export const OPEN_TOOLCHAIN:        Command = { id: 'o1.openToolchain',      label: 'ROS 2 Toolchain Setup'  };
    export const NEW_ROS_PROJECT:       Command = { id: 'o1.newRosProject',      label: 'New ROS 2 Project…'     };
    export const PREVIEW_URDF_CURRENT:  Command = { id: 'o1.previewCurrentUrdf', label: 'Preview Current URDF'   };
}

export namespace O1Menus {
    export const ROS_MENU = [...MAIN_MENU_BAR, 'ros'];
}

@injectable()
export class O1CommandContribution
    implements CommandContribution, FrontendApplicationContribution, KeybindingContribution {

    @inject(ApplicationShell)       protected readonly shell:         ApplicationShell;
    @inject(WidgetManager)          protected readonly widgetManager: WidgetManager;
    @inject(MessageService)         protected readonly messageService: MessageService;
    @inject(TemplatesContribution)  protected readonly templates:     TemplatesContribution;
    @inject(EditorManager)          protected readonly editorManager: EditorManager;
    @inject(TaskService)            protected readonly taskService:   TaskService;
    @inject(CommandRegistry)        protected readonly commandRegistry: CommandRegistry;

    /** FIX: auto-open URDF viewer when a .urdf or .xacro file is opened */
    onStart(): void {
        // #6 — open a terminal on launch so users can see they have a shell.
        // Deferred so it does not compete with the shell finishing its layout.
        setTimeout(() => {
            this.commandRegistry.executeCommand('terminal:new').catch(() => { /* terminal optional */ });
        }, 1500);

        this.editorManager.onCreated(editorWidget => {
            const uri = editorWidget.getResourceUri();
            if (!uri) return;
            const ext = uri.path.ext.toLowerCase();
            if (ext !== '.urdf' && ext !== '.xacro') return;

            // Slight delay so the editor has finished loading
            setTimeout(() => this.autoPreviewUrdf(editorWidget, uri, ext), 600);
        });
    }

    private async autoPreviewUrdf(
        editorWidget: any,
        uri: any,
        ext: string
    ): Promise<void> {
        const viewer = await this.widgetManager.getOrCreateWidget<UrdfViewerWidget>(UrdfViewerWidget.ID);
        this.shell.addWidget(viewer, { area: 'main', mode: 'split-right' });

        if (ext === '.xacro') {
            // For xacro: pass the file path to the backend for expansion
            await viewer.loadXacro(uri.path.toString(), uri.path.base);
        } else {
            // For urdf: read from the editor buffer
            const content = editorWidget.editor?.document?.getText?.() || '';
            if (content) {
                await viewer.loadUrdf(content, uri.path.base);
            }
        }
    }

    /** #3 — run the file in the current editor in a terminal. */
    async runCurrentFile(): Promise<void> {
        const uri = this.editorManager.currentEditor?.getResourceUri();
        if (!uri) {
            this.messageService.warn('Open a file first, then run it.');
            return;
        }
        const file = uri.path.fsPath();
        // Prefer the real platform; userAgent is only a fallback because Electron
        // lets the app override it and Theia sometimes does.
        const isWin = (typeof process !== 'undefined' && (process as any)?.platform === 'win32')
            || (typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent));
        const ext = uri.path.ext.toLowerCase();

        // C/C++ must be compiled before it can run. Do it for the user in one step
        // (gcc/g++, -g so breakpoints work later) and then execute the binary.
        const cLike = ['.c', '.cc', '.cpp', '.cxx', '.c++'].includes(ext);
        const cxxLike = ['.cc', '.cpp', '.cxx', '.c++'].includes(ext);

        // A missing tool otherwise fails with a bare shell error, or nothing at all.
        const notFound = (tool: string): string => cLike
            ? `${tool} was not found. Windows needs WSL 2 with g++ installed. Linux: sudo apt install build-essential.`
            : `${tool} was not found on PATH. Install Python 3 from python.org and restart Rovant.`;

        let command: string;
        if (cLike) {
            const compiler = cxxLike ? 'g++' : 'gcc';
            const out = `${file}.out`;
            if (isWin) {
                // ROS toolchain lives in WSL, so compile there with a WSL path.
                // C:\dir\file -> /mnt/c/dir/file ; a POSIX path is left as-is.
                const wsl = (p: string): string => {
                    const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
                    const posix = m ? `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}`
                                    : p.replace(/\\/g, '/');
                    // Escape single quotes for the bash single-quote context it lands in.
                    return posix.replace(/'/g, "'\\''");
                };
                // The compiler lives inside WSL, so check it there — not on the Windows PATH.
                const inner = `command -v ${compiler} >/dev/null 2>&1 || { echo '${notFound(compiler)}'; exit 1; }; `
                    + `${compiler} -g -O0 '${wsl(file)}' -o '${wsl(out)}' && '${wsl(out)}'`;
                command = `wsl.exe bash -lc "${inner}"`;
            } else {
                command = `command -v ${compiler} >/dev/null 2>&1 || { echo "${notFound(compiler)}"; exit 1; }; `
                    + `${compiler} -g -O0 "${file}" -o "${out}" && "${out}"`;
            }
        } else if (ext === '.py') {
            const py = isWin ? 'python' : 'python3';
            // Windows task shells are cmd.exe (node's default), where '||' is valid.
            command = isWin
                ? `where ${py} >nul 2>&1 || (echo ${notFound(py)} & exit /b 1) && ${py} "${file}"`
                : `command -v ${py} >/dev/null 2>&1 || { echo "${notFound(py)}"; exit 1; }; ${py} "${file}"`;
        } else {
            command = `"${file}"`;
        }
        // Tell the user exactly what will run, and what to check if nothing appears.
        // (Deliberately NOT a shell-level existence check: `||` breaks on PowerShell 5.1,
        //  so a wrong guess would replace a clear message with a syntax error.)
        const interpreter = cLike
            ? (cxxLike ? 'g++' : 'gcc')
            : (ext === '.py' ? (isWin ? 'python' : 'python3') : null);
        if (interpreter) {
            const hint = cLike && isWin
                ? 'C/C++ compiles inside WSL — WSL 2 with g++ must be installed.'
                : `If no output appears, ${interpreter} may not be on your PATH.`;
            this.messageService.info(`Running ${uri.path.base} with ${interpreter}. ${hint}`);
        }

        try {
            await this.taskService.runTask({
                type: 'shell',
                _scope: TaskScope.Workspace,
                label: `Rovant: run ${uri.path.base}`,
                command,
                options: { cwd: uri.path.dir.fsPath() },
                // Keep the terminal open after exit. Without this a fast script
                // (print + exit in ~80ms) flashes past and the output is lost.
                presentation: { reveal: 'always', panel: 'new', focus: true, close: false },
            } as any);
        } catch (err: any) {
            this.messageService.error(`Could not run ${uri.path.base}: ${err?.message ?? err}`);
        }
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybinding({ command: 'o1.runCurrentFile', keybinding: 'ctrl+r', when: 'editorFocus' });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand({ id: 'o1.runCurrentFile', label: 'Run Current File in Terminal' }, {
            execute: () => this.runCurrentFile()
        });
        registry.registerCommand(O1Commands.OPEN_URDF_VIEWER, {
            execute: () => this.openWidget(UrdfViewerWidget.ID)
        });
        registry.registerCommand(O1Commands.OPEN_ROS_TOPICS, {
            execute: () => this.openWidget(RosTopicsWidget.ID)
        });
        registry.registerCommand(O1Commands.OPEN_TOOLCHAIN, {
            execute: () => this.openWidget(ToolchainInstallerWidget.ID)
        });
        registry.registerCommand(O1Commands.NEW_ROS_PROJECT, {
            execute: () => this.templates.newProject()
        });
        registry.registerCommand(O1Commands.PREVIEW_URDF_CURRENT, {
            execute: () => this.previewCurrentUrdf()
        });
    }

    private async openWidget(id: string): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget(id);
        this.shell.addWidget(widget, { area: 'main' });
        await this.shell.activateWidget(widget.id);
    }

    private async previewCurrentUrdf(): Promise<void> {
        const widget = this.shell.currentWidget;
        if (!widget) { this.messageService.warn('No active editor'); return; }
        const uri = (widget as any).getResourceUri?.();
        if (!uri) { this.messageService.warn('No file open'); return; }
        const ext = uri.path.ext.toLowerCase();
        if (ext !== '.urdf' && ext !== '.xacro') {
            this.messageService.warn('Active file is not a .urdf or .xacro file');
            return;
        }
        const viewer = await this.widgetManager.getOrCreateWidget<UrdfViewerWidget>(UrdfViewerWidget.ID);
        this.shell.addWidget(viewer, { area: 'main' });
        await this.shell.activateWidget(viewer.id);
        if (ext === '.xacro') {
            await viewer.loadXacro(uri.path.toString(), uri.path.base);
        } else {
            const content = (widget as any).editor?.document?.getText?.() || '';
            if (content) await viewer.loadUrdf(content, uri.path.base);
        }
    }
}

@injectable()
export class O1MenuContribution implements MenuContribution {
    registerMenus(registry: MenuModelRegistry): void {
        registry.registerSubmenu(O1Menus.ROS_MENU, 'ROS 2');
        registry.registerMenuAction(O1Menus.ROS_MENU, { commandId: O1Commands.NEW_ROS_PROJECT.id,      order: '1' });
        registry.registerMenuAction(O1Menus.ROS_MENU, { commandId: O1Commands.OPEN_TOOLCHAIN.id,       order: '2' });
        registry.registerMenuAction(O1Menus.ROS_MENU, { commandId: O1Commands.OPEN_URDF_VIEWER.id,     order: '3' });
        registry.registerMenuAction(O1Menus.ROS_MENU, { commandId: O1Commands.OPEN_ROS_TOPICS.id,      order: '4' });
        registry.registerMenuAction(O1Menus.ROS_MENU, { commandId: O1Commands.PREVIEW_URDF_CURRENT.id, order: '5' });
        registry.registerMenuAction(O1Menus.ROS_MENU, { commandId: 'o1.runCurrentFile',            order: '6' });
        // #3 — also under the Run menu. Theia does not expose a RUN constant in
        // CommonMenus, so use the menu id directly; harmless if it is not present.
        registry.registerMenuAction(['3_run'], { commandId: 'o1.runCurrentFile', order: '0' });
    }
}
