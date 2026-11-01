import { injectable } from '@theia/core/shared/inversify';
import { TaskContribution, TaskProvider, TaskProviderRegistry } from '@theia/task/lib/browser/task-contribution';
import { TaskConfiguration, TaskScope } from '@theia/task/lib/common/task-protocol';

/**
 * FEATURE 5: launch.py + CMake + colcon build tasks
 */
@injectable()
export class RosBuildTaskProvider implements TaskContribution, TaskProvider {

    /** Called by Theia to register this provider */
    registerProviders(providers: TaskProviderRegistry): void {
        providers.register('ros2', this);
        providers.register('shell', this);  // also expose as shell tasks
    }

    async provideTasks(): Promise<TaskConfiguration[]> {
        return [
            // Plain "run and see the output" — no debug adapter required.
            this.make('Rovant: run current Python file', 'python3 "${file}"'),

            this.make('ros2: colcon build',
                'colcon build --symlink-install',
                { kind: 'build', isDefault: true }),

            this.make('ros2: colcon build (release)',
                'colcon build --cmake-args -DCMAKE_BUILD_TYPE=Release'),

            this.make('ros2: colcon build (this package)',
                'colcon build --symlink-install --packages-select ${workspaceFolderBasename}'),

            this.make('ros2: colcon test',
                'colcon test', { kind: 'test', isDefault: true }),

            this.make('ros2: colcon test-result',
                'colcon test-result --verbose'),

            this.make('ros2: clean workspace',
                'rm -rf build install log'),

            this.make('ros2: rosdep install',
                'rosdep install --from-paths src --ignore-src -r -y'),

            this.make('ros2: source workspace',
                'source /opt/ros/humble/setup.bash && source install/setup.bash'),

            this.make('ros2: list nodes',   'ros2 node list'),
            this.make('ros2: list topics',  'ros2 topic list -v'),
            this.make('ros2: doctor',       'ros2 doctor --report'),

            this.make('cmake: configure',
                'cmake -B build -DCMAKE_BUILD_TYPE=Debug -DCMAKE_EXPORT_COMPILE_COMMANDS=ON'),

            this.make('cmake: build',
                'cmake --build build --parallel'),
        ];
    }

    private make(
        label: string,
        command: string,
        group?: { kind: string; isDefault: boolean }
    ): TaskConfiguration {
        return {
            type: 'shell',
            _scope: TaskScope.Workspace,
            label,
            command,
            options: {
                cwd: '${workspaceFolder}',
                // ROS 2 lives inside WSL on Windows, so injecting /opt/ros paths
                // (and a ':' PATH separator) into a Windows shell breaks every task.
                env: process.platform === 'win32'
                    ? { ROS_DOMAIN_ID: '0' }
                    : {
                        ROS_DOMAIN_ID:     '0',
                        AMENT_PREFIX_PATH: '/opt/ros/humble',
                        PATH: '/opt/ros/humble/bin:${env:PATH}',
                    }
            },
            problemMatcher: ['$gcc'],
            ...(group ? { group } : {}),
        } as unknown as TaskConfiguration;
    }
}
