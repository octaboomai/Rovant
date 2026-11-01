import { injectable } from '@theia/core/shared/inversify';
import { DebugAdapterContribution, DebugAdapterExecutable } from '@theia/debug/lib/common/debug-model';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';

/**
 * Provides the `python` debug type for Rovant.
 *
 * Theia ships no Python debug adapter, so without this a `"type": "python"`
 * launch/attach configuration has nothing to execute and Run / F5 silently
 * produces no output. debugpy ships a Debug-Adapter-Protocol server which we
 * start as `python -m debugpy.adapter`.
 *
 * The `debugpy` Python package must be available on PATH (install once with
 * `pip3 install debugpy`, or from the ROS 2 Toolchain panel).
 */
@injectable()
export class PythonDebugAdapterContribution implements DebugAdapterContribution {

    readonly type = 'python';
    readonly label = 'Python (debugpy)';
    readonly languages = ['python'];

    provideDebugAdapterExecutable(_config: DebugConfiguration): DebugAdapterExecutable {
        // Prefer an explicit interpreter if the user set one, else the platform default.
        const python = process.env['O1_PYTHON']
            ?? (process.platform === 'win32' ? 'python' : 'python3');
        return {
            command: python,
            args: ['-m', 'debugpy.adapter'],
        };
    }
}
