/**
 * Shared utilities for Rovant electron main process
 */
import * as http from 'http';
import * as net  from 'net';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(execCb);

/** Shared list of ROS 2 distros checked everywhere */
export const ROS_DISTROS = ['jazzy', 'humble', 'iron', 'rolling', 'foxy'] as const;
export type RosDistro = typeof ROS_DISTROS[number];

/** Port the Theia backend listens on internally */
export const THEIA_DEFAULT_PORT = 3001;

/** How long to wait for Theia backend to accept connections */
export const THEIA_START_TIMEOUT_MS = 45_000;

/** Interval between Theia readiness checks */
export const THEIA_POLL_INTERVAL_MS = 600;

/**
 * Waits for a TCP port to accept connections.
 * Uses a per-attempt socket timeout so a firewalled port doesn't hang.
 */
export async function waitForPort(port: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const ready = await new Promise<boolean>(resolve => {
            const req = http.get(
                { hostname: '127.0.0.1', port, path: '/', timeout: 800 },
                res => { res.resume(); resolve(true); }
            );
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.on('error',   () => resolve(false));
        });
        if (ready) return;
        await new Promise(r => setTimeout(r, THEIA_POLL_INTERVAL_MS));
    }
    throw new Error(`Port ${port} did not open within ${timeoutMs / 1000}s`);
}

/**
 * Finds a free TCP port starting at `preferred`, trying up to 20 ports.
 */
export async function findFreePort(preferred: number): Promise<number> {
    for (let p = preferred; p < preferred + 20; p++) {
        const free = await new Promise<boolean>(resolve => {
            const s = net.createServer();
            s.listen(p, '127.0.0.1', () => s.close(() => resolve(true)));
            s.on('error', () => resolve(false));
        });
        if (free) return p;
    }
    return preferred;
}

/**
 * Safe exec with timeout. Returns { stdout, stderr } or throws.
 */
export async function safeExec(
    cmd: string,
    opts: { timeout?: number; shell?: string } = {}
): Promise<{ stdout: string; stderr: string }> {
    return execAsync(cmd, {
        timeout: opts.timeout ?? 8000,
        shell: opts.shell ?? (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'),
    });
}

/**
 * Validates a WebSocket URL string.
 */
export function isValidWsUrl(url: string): boolean {
    try {
        const u = new URL(url);
        return u.protocol === 'ws:' || u.protocol === 'wss:';
    } catch {
        return false;
    }
}
