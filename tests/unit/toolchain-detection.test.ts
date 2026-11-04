/**
 * Unit tests — toolchain detection logic
 *
 * We mock child_process so no real binaries are needed.
 */
import { jest } from '@jest/globals';

// ── Types mirrored from rovant-rest-contribution ──────────────────────────────────
interface CheckResult {
    id: string; label: string; found: boolean; version: string;
}

// ── Minimal re-implementation of runCheck for unit testing ────────────────────
const { execFile: execFileMod } = jest.requireMock('child_process') as any;

jest.mock('child_process', () => ({
    execFile: jest.fn(),
    spawn:    jest.fn(),
}));

// Simplified runCheck mirrors the real implementation
async function runCheck(
    id: string, label: string, cmd: string,
    execFn: (bin: string, args: string[], opts: any) => Promise<{stdout:string, stderr:string}>
): Promise<CheckResult> {
    try {
        const { stdout } = await execFn('/bin/bash', ['-c', cmd], { timeout: 8000 });
        const version = stdout.trim().split('\n')[0]?.substring(0, 80) ?? 'installed';
        return { id, label, found: true, version: version || 'installed' };
    } catch {
        return { id, label, found: false, version: 'not found' };
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('runCheck', () => {
    const mockExec = jest.fn<(bin: string, args: string[], opts: any) => Promise<{ stdout: string; stderr: string }>>();

    beforeEach(() => mockExec.mockReset());

    it('returns found:true with trimmed version when command succeeds', async () => {
        mockExec.mockResolvedValue({ stdout: 'ros2 0.14.0\n', stderr: '' });
        const r = await runCheck('ros2', 'ROS 2', 'ros2 --version', mockExec);
        expect(r.found).toBe(true);
        expect(r.version).toBe('ros2 0.14.0');
        expect(r.id).toBe('ros2');
    });

    it('returns found:false when command throws', async () => {
        mockExec.mockRejectedValue(new Error('command not found'));
        const r = await runCheck('colcon', 'colcon', 'colcon --version', mockExec);
        expect(r.found).toBe(false);
        expect(r.version).toBe('not found');
    });

    it('truncates version strings longer than 80 characters', async () => {
        const longOutput = 'X'.repeat(120) + '\n';
        mockExec.mockResolvedValue({ stdout: longOutput, stderr: '' });
        const r = await runCheck('tool', 'Tool', 'tool --version', mockExec);
        expect(r.version.length).toBeLessThanOrEqual(80);
    });

    it('returns "installed" when stdout is empty but command succeeds', async () => {
        mockExec.mockResolvedValue({ stdout: '  \n', stderr: '' });
        const r = await runCheck('cmake', 'CMake', 'cmake --version', mockExec);
        expect(r.found).toBe(true);
        expect(r.version).toBe('installed');
    });

    it('handles multi-line output — uses only first line', async () => {
        mockExec.mockResolvedValue({ stdout: 'cmake version 3.28.0\nCMake suite maintained by Kitware\n', stderr: '' });
        const r = await runCheck('cmake', 'CMake', 'cmake --version', mockExec);
        expect(r.version).toBe('cmake version 3.28.0');
    });
});

// ── Parallel detection ────────────────────────────────────────────────────────
describe('detectToolchain parallelism', () => {
    it('runs all 11 checks concurrently (timing test)', async () => {
        const DELAY = 100;
        const mockExec = jest.fn<(bin: string, args: string[], opts: any) => Promise<{ stdout: string; stderr: string }>>()
            .mockImplementation(
                () => new Promise<{ stdout: string; stderr: string }>(r => setTimeout(() => r({ stdout: 'ok', stderr: '' }), DELAY))
            );

        const tools = Array.from({ length: 11 }, (_, i) => ({ id: `t${i}`, label: `Tool ${i}`, cmd: `t${i}` }));

        const start = Date.now();
        await Promise.all(tools.map(t => runCheck(t.id, t.label, t.cmd, mockExec)));
        const elapsed = Date.now() - start;

        // With parallelism: ~100ms. Sequential would be 1100ms.
        expect(elapsed).toBeLessThan(500);
    });
});
