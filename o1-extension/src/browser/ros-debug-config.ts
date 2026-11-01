import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';

/**
 * FEATURE 2: Attach-to-node debugging
 * Writes a .vscode/launch.json with pre-built ROS 2 debug configurations
 * into every workspace that doesn't already have one.
 */
@injectable()
export class RosDebugConfigContribution implements FrontendApplicationContribution {
    @inject(FileService)       protected readonly fileService: FileService;
    @inject(WorkspaceService)  protected readonly workspaceService: WorkspaceService;

    async onStart(): Promise<void> {
        // DELIBERATELY DISABLED for the 0.1 beta.
        //
        // The generated configurations need debugpy (Python) and lldb-dap (C++)
        // inside the workspace, neither of which ships yet. Pressing F5 produced
        // "Timed out waiting for launcher to connect" and opened an unrelated
        // source file, which reads as the IDE misbehaving.
        //
        // Shipping no debug configuration is honest; shipping one that fails with
        // a red error is not. Debugging returns in 0.2 once the adapters land.
        if (1 as number) { return; }

        // Wait for workspace to be ready
        await this.workspaceService.ready;
        const roots = this.workspaceService.tryGetRoots();
        if (!roots.length) return;

        for (const root of roots) {
            await this.ensureLaunchJson(root.resource);
        }
    }

    private async ensureLaunchJson(rootUri: URI): Promise<void> {
        const launchUri = rootUri.resolve('.vscode/launch.json');
        const exists = await this.fileService.exists(launchUri);
        if (exists) return;           // Don't overwrite existing configs

        const content = JSON.stringify(ROS_LAUNCH_JSON, null, 2);
        try {
            await this.fileService.create(launchUri, content, { fromUserGesture: false });
        } catch { /* ignore if .vscode dir not writable */ }
    }
}

/** Default ROS 2 debug configurations written to every new workspace */
const IS_WIN_UI = (typeof process !== 'undefined' && (process as any)?.platform === 'win32')
    || (typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent));

/** On Windows ROS 2 lives inside WSL, so /opt/ros paths do not exist on the
 *  Windows filesystem and must not be injected into a Windows debug session. */
const ROS_ENV_FULL = IS_WIN_UI
    ? { ROS_DOMAIN_ID: '0' }
    : {
        ROS_DOMAIN_ID: '0',
        AMENT_PREFIX_PATH: '/opt/ros/humble',
        PYTHONPATH: '/opt/ros/humble/lib/python3.10/site-packages',
    };
const ROS_ENV_MIN = IS_WIN_UI
    ? { ROS_DOMAIN_ID: '0' }
    : { ROS_DOMAIN_ID: '0', AMENT_PREFIX_PATH: '/opt/ros/humble' };

const ROS_LAUNCH_JSON = {
    version: '0.2.0',
    inputs: [
        {
            id:          'rosNodeProcess',
            type:        'pickProcess',
            description: 'Select the ROS node process to attach to',
        }
    ],
    configurations: [
        {
            // NOTE: F5 / Run uses the FIRST configuration. Keep a *launch* config
            // first so "Run" executes the current file instead of attaching to a
            // node that isn't there (which produced no output).
            name:        'Python: Run current file',
            type:        'python',
            request:     'launch',
            program:     '${file}',
            cwd:         '${workspaceFolder}',
            justMyCode:  false,
            env: {
                ROS_DOMAIN_ID: '0',
            },
        },
        {
            name:        'ROS 2: Attach to Python node',
            type:        'python',
            request:     'attach',
            connect:     { host: 'localhost', port: 5678 },
            justMyCode:  false,
            pathMappings: [{ localRoot: '${workspaceFolder}', remoteRoot: '${workspaceFolder}' }],
            // Launch node with: python -m debugpy --listen 5678 --wait-for-client your_node.py
        },
        {
            name:        'ROS 2: Attach to C++ node (GDB)',
            type:        'cppdbg',
            request:     'attach',
            program:     '${workspaceFolder}/build/${workspaceFolderBasename}/${workspaceFolderBasename}',
            processId:   '${input:rosNodeProcess}',
            MIMode:      'gdb',
            miDebuggerPath: '/usr/bin/gdb',
            environment: Object.entries(ROS_ENV_MIN).map(([name, value]) => ({ name, value })),
            setupCommands: [
                { text: '-enable-pretty-printing',              ignoreFailures: true },
                { text: '-gdb-set disassembly-flavor intel',    ignoreFailures: true },
            ],
        },
        {
            name:    'ROS 2: Launch + debug Python node',
            type:    'python',
            request: 'launch',
            program: '${file}',
            justMyCode: false,
            env: ROS_ENV_FULL,
        },
        {
            name:           'ROS 2: Build then debug',
            type:           'python',
            request:        'launch',
            preLaunchTask:  'ros2: colcon build (this package)',
            program:        '${file}',
            justMyCode:     false,
            env: ROS_ENV_MIN,
        },
    ]
};
