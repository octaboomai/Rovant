import { ContainerModule } from '@theia/core/shared/inversify';
import { TaskContribution } from '@theia/task/lib/browser/task-contribution';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { DebugAdapterContribution } from '@theia/debug/lib/common/debug-model';
import { RosBuildTaskProvider } from './ros-build-tasks';
import { O1RestContribution } from './rovant-rest-contribution';
import { PythonDebugAdapterContribution } from './python-debug-adapter';

export default new ContainerModule(bind => {
    // Feature 2: Python debugging — Theia ships no python debug adapter, so Run/F5
    // would otherwise produce no output. Backed by debugpy's DAP server.
    bind(DebugAdapterContribution).to(PythonDebugAdapterContribution).inSingletonScope();

    // Feature 5: colcon / CMake build tasks
    bind(RosBuildTaskProvider).toSelf().inSingletonScope();
    bind(TaskContribution).toService(RosBuildTaskProvider);

    // Toolchain REST API + optional auth middleware
    bind(O1RestContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(O1RestContribution);
});
