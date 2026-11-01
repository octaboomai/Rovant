/**
 * Rovant — REST API backend contribution
 *
 * Endpoints:
 *   GET /o1/health              — liveness check
 *   GET /o1/check               — full environment scan (all tools)
 *   GET /o1/check/:id           — single tool check
 *   GET /o1/install-stream      — SSE install log stream
 *   GET /o1/ros/topics          — live ROS 2 topic list
 *   GET /o1/xacro-expand?path=  — expand xacro → URDF (server-side)
 *
 * Security: execFile used instead of shell=true; PATH restricted for installs.
 */
import { injectable } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { Application, Request, Response, NextFunction } from 'express';
import { execFile as execFileCb, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os   from 'os';
import * as fs   from 'fs';

const execFile = promisify(execFileCb);

/** True when the IDE runs on Windows. ROS 2 lives inside WSL there. */
const IS_WIN = process.platform === 'win32';

/** Shell used to run ROS snippets: WSL's bash on Windows, /bin/bash elsewhere. */
const ROS_SHELL = IS_WIN ? 'wsl.exe' : '/bin/bash';

/** argv for running a bash snippet in the ROS environment (WSL on Windows). */
function rosShellArgs(snippet: string): string[] {
    return IS_WIN ? ['-e', 'bash', '-lc', snippet] : ['-c', snippet];
}

export interface CheckResult {
    id:      string;
    label:   string;
    found:   boolean;
    version: string;
}

interface ToolDef {
    id:    string;
    label: string;
    /** Shell command — executed via bash -c with ROS sourced */
    cmd:   string;
}

const TOOL_DEFS: ToolDef[] = [
    { id: 'ros2',      label: 'ROS 2 Humble',        cmd: 'ros2 --version' },
    { id: 'colcon',    label: 'colcon',               cmd: 'colcon --version' },
    { id: 'rosdep',    label: 'rosdep',               cmd: 'rosdep --version' },
    { id: 'cmake',     label: 'CMake',                cmd: 'cmake --version' },
    { id: 'docker',    label: 'Docker Engine',        cmd: 'docker --version' },
    { id: 'git',       label: 'Git',                  cmd: 'git --version' },
    { id: 'clangd',    label: 'clangd (C++ LSP)',     cmd: 'clangd --version' },
    { id: 'pyright',   label: 'pyright (Python LSP)', cmd: 'pyright --version' },
    { id: 'pymavlink', label: 'pymavlink',            cmd: 'python3 -c "import pymavlink; print(pymavlink.__version__)"' },
    { id: 'pyulog',    label: 'pyulog',               cmd: 'python3 -c "import pyulog; print(pyulog.__version__)"' },
    { id: 'numpy',     label: 'numpy',                cmd: 'python3 -c "import numpy; print(numpy.__version__)"' },
    { id: 'rosbridge', label: 'rosbridge-suite',      cmd: 'ros2 pkg xml rosbridge_server 2>/dev/null | grep -m1 -o "<version>[^<]*" | cut -d">" -f2' },
];

/** Allowed workspace roots for xacro-expand — prevents path traversal */

/** Roots the xacro endpoint may read from. On Windows a project can live on any
 *  drive, so allow the existing drive roots as well as the home directory. */
const WORKSPACE_ROOTS: string[] = IS_WIN
    ? [os.homedir(), ...['C', 'D', 'E', 'F', 'G'].map(d => `${d}:\\`).filter(r => fs.existsSync(r))]
    : ['/workspace', '/home/o1user', os.homedir()];

/** Restricted PATH used for the install script — prevents hijacking via env */
const SAFE_PATH = [
    '/usr/local/bin', '/usr/bin', '/bin',
    '/usr/local/sbin', '/usr/sbin', '/sbin',
    '/snap/bin',
].join(':');

@injectable()
export class O1RestContribution implements BackendApplicationContribution {

    configure(app: Application): void {

        // ── Optional API token middleware ────────────────────────────────────
        app.use('/o1', (req: Request, res: Response, next: NextFunction) => {
            const token = process.env['IDE_API_TOKEN'];
            if (!token) { next(); return; }
            const bearer = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');
            const query  = String(req.query['token'] ?? '');
            if (bearer === token || query === token) { next(); return; }
            res.status(401).json({ error: 'Unauthorized' });
        });

        // ── GET /o1/health ───────────────────────────────────────────────────
        app.get('/o1/health', (_req: Request, res: Response) => {
            res.json({ status: 'ok', version: process.env['npm_package_version'] ?? 'unknown', ts: Date.now() });
        });

        // ── GET /o1/check — parallel, safe ────────────────────────────────────
        app.get('/o1/check', async (_req: Request, res: Response) => {
            const results = await Promise.all(TOOL_DEFS.map(t => this.runCheck(t)));
            res.json(results);
        });

        // ── GET /o1/check/:id ────────────────────────────────────────────────
        app.get('/o1/check/:id', async (req: Request, res: Response) => {
            const id   = String(req.params['id'] ?? '');
            const tool = TOOL_DEFS.find(t => t.id === id);
            if (!tool) {
                res.status(404).json({ error: `Unknown tool: ${id}` });
                return;
            }
            res.json(await this.runCheck(tool));
        });

        // ── GET /o1/install-stream — SSE, restricted env ─────────────────────
        app.get('/o1/install-stream', (req: Request, res: Response) => {
            res.setHeader('Content-Type',    'text/event-stream');
            res.setHeader('Cache-Control',   'no-cache');
            res.setHeader('Connection',      'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();

            const send = (line: string, type = 'log') =>
                res.write(`data: ${JSON.stringify({ type, line })}\n\n`);

            const scriptName = IS_WIN ? 'install-toolchain-windows.ps1' : 'install-ros.sh';
            // In a packaged app __dirname is inside app.asar, where scripts/ does not
            // exist. The scripts are shipped as an extra resource, so resolve against
            // process.resourcesPath and only fall back to the repo layout in dev.
            const scriptPath = (process as any).resourcesPath
                ? path.join((process as any).resourcesPath, 'scripts', scriptName)
                : path.resolve(__dirname, '..', '..', '..', 'scripts', scriptName);

            send('Starting Rovant toolchain installer…', 'info');
            send(`Script: ${scriptPath}`, 'cmd');

            // Windows: run the PowerShell script. Linux: run the shell script directly.
            const proc = IS_WIN
                ? spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
                    shell: false,
                    env: process.env,
                })
                : spawn(scriptPath, [], {
                    shell: false,
                    env: {
                        HOME:   os.homedir(),
                        USER:   os.userInfo().username,
                        PATH:   SAFE_PATH,
                        DEBIAN_FRONTEND: 'noninteractive',
                    },
                });

            proc.stdout.on('data', (d: Buffer) =>
                d.toString().split('\n').filter(Boolean).forEach(l => send(l, 'log'))
            );
            proc.stderr.on('data', (d: Buffer) =>
                d.toString().split('\n').filter(Boolean).forEach(l => send(l, 'warn'))
            );
            proc.on('close',  code => { send(`Exit code: ${code}`, code === 0 ? 'done' : 'error'); res.end(); });
            proc.on('error',  err  => { send(`Spawn error: ${err.message}`, 'error'); res.end(); });

            req.on('close', () => { if (!proc.killed) proc.kill('SIGTERM'); });
        });

        // ── GET /o1/ros/topics ───────────────────────────────────────────────
        app.get('/o1/ros/topics', async (_req: Request, res: Response) => {
            try {
                const { stdout } = await execFile(
                    ROS_SHELL,
                    rosShellArgs('source /opt/ros/humble/setup.bash 2>/dev/null && ros2 topic list -t'),
                    { timeout: 5000 }
                );
                const topics = stdout.trim().split('\n')
                    .filter(Boolean)
                    .filter(l => !l.startsWith('/rosout') && !l.startsWith('/parameter'))
                    .map(line => {
                        const m = line.match(/^(.+?)\s+\[(.+?)\]$/);
                        return m ? { name: m[1], type: m[2] } : { name: line, type: 'unknown' };
                    });
                res.json({ topics });
            } catch {
                res.json({ topics: [], error: 'ROS 2 not available or no nodes running' });
            }
        });

        // ── GET /o1/xacro-expand?path=<abs> — expand xacro → URDF XML ────────
        // BUG FIX: Re-added endpoint removed in new version but still called by
        // urdf-viewer-widget.ts. Uses execFile (not exec) to prevent injection.
        app.get('/o1/xacro-expand', async (req: Request, res: Response) => {
            const rawPath = String(req.query['path'] ?? '').trim();
            if (!rawPath) {
                res.status(400).json({ error: 'Missing ?path= parameter' });
                return;
            }

            // Resolve and validate: must be under an allowed workspace root
            const resolved = path.resolve(rawPath);
            const allowed  = WORKSPACE_ROOTS.some(r => resolved.startsWith(r));
            if (!allowed) {
                res.status(403).json({ error: 'Path outside allowed workspace' });
                return;
            }

            if (!fs.existsSync(resolved)) {
                res.status(404).json({ error: `File not found: ${resolved}` });
                return;
            }

            try {
                // Use execFile (not exec) — no shell interpolation possible
                const { stdout } = await execFile(
                    ROS_SHELL,
                    // Escape single quotes: a filename like robot's_arm.xacro would
                    // otherwise close the quote and corrupt the command.
                    rosShellArgs(`source /opt/ros/humble/setup.bash 2>/dev/null; ros2 run xacro xacro '${resolved.replace(/'/g, "'\\''")}' 2>&1`),
                    { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }
                );

                if (!stdout.trim().startsWith('<?xml')) {
                    res.status(422).json({ error: stdout.substring(0, 500) || 'xacro produced no output' });
                    return;
                }

                res.setHeader('Content-Type', 'application/xml');
                res.send(stdout);
            } catch (err: any) {
                const msg = (err.stderr || err.stdout || err.message || '').substring(0, 500);
                res.status(422).json({ error: `xacro failed: ${msg}` });
            }
        });
    }

    /** Runs a single tool check safely. Returns CheckResult — never throws. */
    private async runCheck(tool: ToolDef): Promise<CheckResult> {
        const { id, label, cmd } = tool;
        try {
            const { stdout } = await execFile(
                ROS_SHELL,
                rosShellArgs(`source /opt/ros/humble/setup.bash 2>/dev/null; ${cmd} 2>&1`),
                { timeout: 8000 }
            );
            const version = stdout.trim().split('\n')[0]?.substring(0, 80) ?? 'installed';
            return { id, label, found: true, version: version || 'installed' };
        } catch {
            return { id, label, found: false, version: 'not found' };
        }
    }
}
