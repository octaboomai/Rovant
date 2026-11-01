import { injectable, inject } from '@theia/core/shared/inversify';
import { QuickInputService } from '@theia/core/lib/browser/quick-input/quick-input-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import URI from '@theia/core/lib/common/uri';

/**
 * FEATURE 8: Project templates / scaffolding
 */

// ── Template file contents (must be declared before class uses them) ──────

const VSCODE_SETTINGS = `{
  "ros.distro": "humble",
  "clangd.arguments": ["--background-index", "--clang-tidy"],
  "python.languageServer": "Pylance",
  "editor.formatOnSave": true,
  "cmake.configureOnOpen": true
}`;

const COLCON_META = `{
  "names": {},
  "defaults": {
    "cmake-args": ["-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON"]
  }
}`;

function cmakeLists(pkg: string): string {
    return `cmake_minimum_required(VERSION 3.8)
project(${pkg})
if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()
find_package(ament_cmake REQUIRED)
find_package(rclpy REQUIRED)
ament_python_install_package(src/\${PROJECT_NAME})
install(DIRECTORY launch config urdf DESTINATION share/\${PROJECT_NAME} OPTIONAL)
ament_package()`;
}

function packageXml(pkg: string, desc: string): string {
    return `<?xml version="1.0"?>
<package format="3">
  <name>${pkg}</name><version>0.1.0</version>
  <description>${desc}</description>
  <maintainer email="dev@o1.ide">Developer</maintainer>
  <license>MIT</license>
  <depend>rclpy</depend><depend>std_msgs</depend>
  <depend>sensor_msgs</depend><depend>geometry_msgs</depend>
  <export><build_type>ament_cmake</build_type></export>
</package>`;
}

const ATTITUDE_CONTROLLER_PY = `#!/usr/bin/env python3
"""PX4 attitude controller node — Rovant template"""
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import PoseStamped, Twist

class AttitudeController(Node):
    def __init__(self):
        super().__init__('attitude_controller')
        self.declare_parameter('kp_roll',  0.5)
        self.declare_parameter('ki_roll',  0.01)
        self.declare_parameter('kd_roll',  0.1)
        self.sub = self.create_subscription(PoseStamped, '/mavros/local_position/pose', self.cb, 10)
        self.pub = self.create_publisher(Twist, '/mavros/setpoint_velocity/cmd_vel', 10)
        self.get_logger().info('AttitudeController ready')

    def cb(self, msg: PoseStamped):
        cmd = Twist()
        kp = self.get_parameter('kp_roll').value
        cmd.angular.x = kp * (0.0 - msg.pose.orientation.x)
        self.pub.publish(cmd)

def main(args=None):
    rclpy.init(args=args)
    rclpy.spin(AttitudeController())
    rclpy.shutdown()
`;

const PX4_PARAMS_YAML = `attitude_controller:\n  ros__parameters:\n    kp_roll: 0.5\n    ki_roll: 0.01\n    kd_roll: 0.1\n`;
const DRONE_LAUNCH_PY = `from launch import LaunchDescription\nfrom launch_ros.actions import Node\ndef generate_launch_description():\n    return LaunchDescription([Node(package='drone_controller', executable='attitude_controller', output='screen')])\n`;

const MISSION_PLANNER_PY = `#!/usr/bin/env python3
"""ArduPilot mission planner — Rovant template"""
import rclpy
from rclpy.node import Node

class MissionPlanner(Node):
    def __init__(self):
        super().__init__('mission_planner')
        self.declare_parameter('connection', 'udpin:0.0.0.0:14550')
        self.get_logger().info('MissionPlanner ready')

def main(args=None):
    rclpy.init(args=args)
    rclpy.spin(MissionPlanner())
    rclpy.shutdown()
`;
const ARDUPILOT_PARAMS_YAML = `mission_planner:\n  ros__parameters:\n    connection: udpin:0.0.0.0:14550\n`;
const FW_LAUNCH_PY = `from launch import LaunchDescription\nfrom launch_ros.actions import Node\ndef generate_launch_description():\n    return LaunchDescription([Node(package='fw_controller', executable='mission_planner', output='screen')])\n`;

const GROUND_ROBOT_PY = `#!/usr/bin/env python3
"""Differential-drive ground robot — Rovant template"""
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist

class RobotController(Node):
    def __init__(self):
        super().__init__('robot_controller')
        self.pub = self.create_publisher(Twist, '/cmd_vel', 10)
        self.get_logger().info('RobotController ready')

def main(args=None):
    rclpy.init(args=args)
    rclpy.spin(RobotController())
    rclpy.shutdown()
`;
const NAV2_PARAMS_YAML = `bt_navigator:\n  ros__parameters:\n    use_sim_time: false\n    global_frame: map\n`;
const NAV2_LAUNCH_PY = `from launch import LaunchDescription\nfrom launch_ros.actions import Node\ndef generate_launch_description():\n    return LaunchDescription([Node(package='ground_robot', executable='robot_controller', output='screen')])\n`;

const ROBOT_URDF = `<?xml version="1.0"?>
<robot name="ground_robot">
  <link name="base_link">
    <visual><geometry><box size="0.3 0.2 0.1"/></geometry></visual>
  </link>
  <link name="left_wheel">
    <visual><geometry><cylinder radius="0.05" length="0.04"/></geometry></visual>
  </link>
  <link name="right_wheel">
    <visual><geometry><cylinder radius="0.05" length="0.04"/></geometry></visual>
  </link>
  <joint name="left_wheel_joint" type="continuous">
    <parent link="base_link"/><child link="left_wheel"/>
    <origin xyz="0 0.12 -0.05" rpy="1.5708 0 0"/><axis xyz="0 0 1"/>
  </joint>
  <joint name="right_wheel_joint" type="continuous">
    <parent link="base_link"/><child link="right_wheel"/>
    <origin xyz="0 -0.12 -0.05" rpy="1.5708 0 0"/><axis xyz="0 0 1"/>
  </joint>
</robot>`;

const DETECTOR_PY = `#!/usr/bin/env python3
"""Jetson vision node — Rovant template"""
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image

class Detector(Node):
    def __init__(self):
        super().__init__('detector')
        self.sub = self.create_subscription(Image, '/camera/image_raw', self.cb, 10)
        self.get_logger().info('Detector ready')
    def cb(self, msg: Image): pass

def main(args=None):
    rclpy.init(args=args)
    rclpy.spin(Detector())
    rclpy.shutdown()
`;
const CAMERA_PARAMS_YAML = `detector:\n  ros__parameters:\n    camera_topic: /camera/image_raw\n`;
const VISION_LAUNCH_PY  = `from launch import LaunchDescription\nfrom launch_ros.actions import Node\ndef generate_launch_description():\n    return LaunchDescription([Node(package='vision_node', executable='detector', output='screen')])\n`;

const MAVLINK_BRIDGE_PY = `#!/usr/bin/env python3
"""Raspberry Pi MAVLink bridge — Rovant template"""
import rclpy
from rclpy.node import Node
from std_msgs.msg import String
import json, threading

class Bridge(Node):
    def __init__(self):
        super().__init__('mavlink_bridge')
        self.declare_parameter('serial_port', '/dev/ttyAMA0')
        self.declare_parameter('baud_rate',    57600)
        self.pub = self.create_publisher(String, '/mavlink/telemetry', 10)
        self.get_logger().info('MAVLink bridge ready')

def main(args=None):
    rclpy.init(args=args)
    rclpy.spin(Bridge())
    rclpy.shutdown()
`;
const BRIDGE_PARAMS_YAML = `mavlink_bridge:\n  ros__parameters:\n    serial_port: /dev/ttyAMA0\n    baud_rate: 57600\n`;
const BRIDGE_LAUNCH_PY  = `from launch import LaunchDescription\nfrom launch_ros.actions import Node\ndef generate_launch_description():\n    return LaunchDescription([Node(package='mavlink_bridge', executable='bridge', output='screen')])\n`;

// ── Template definitions ─────────────────────────────────────────────────

export interface RosTemplate {
    id: string;
    label: string;
    description: string;
    detail: string;
    files: Record<string, string>;
}

export const ROS_TEMPLATES: RosTemplate[] = [
    {
        id: 'px4-quadcopter',
        label: 'PX4 Quadcopter',
        description: 'Drone workspace targeting PX4 autopilot',
        detail: 'MAVLink, attitude control node, PID parameters',
        files: {
            'src/drone_controller/__init__.py': '',
            'src/drone_controller/attitude_controller.py': ATTITUDE_CONTROLLER_PY,
            'config/px4_params.yaml': PX4_PARAMS_YAML,
            'launch/drone_launch.py': DRONE_LAUNCH_PY,
            'CMakeLists.txt': cmakeLists('drone_controller'),
            'package.xml': packageXml('drone_controller', 'PX4 quadcopter controller'),
            'colcon.meta': COLCON_META,
            '.vscode/settings.json': VSCODE_SETTINGS,
        }
    },
    {
        id: 'ardupilot-fixed-wing',
        label: 'ArduPilot Fixed-Wing',
        description: 'Fixed-wing aircraft with ArduPilot',
        detail: 'pymavlink, waypoint mission planner',
        files: {
            'src/fw_controller/__init__.py': '',
            'src/fw_controller/mission_planner.py': MISSION_PLANNER_PY,
            'config/ardupilot_params.yaml': ARDUPILOT_PARAMS_YAML,
            'launch/fw_launch.py': FW_LAUNCH_PY,
            'CMakeLists.txt': cmakeLists('fw_controller'),
            'package.xml': packageXml('fw_controller', 'ArduPilot fixed-wing controller'),
            'colcon.meta': COLCON_META,
            '.vscode/settings.json': VSCODE_SETTINGS,
        }
    },
    {
        id: 'ros2-ground-robot',
        label: 'ROS 2 Ground Robot',
        description: 'Differential-drive robot with Nav2',
        detail: 'Navigation2, SLAM toolbox, URDF, move_base',
        files: {
            'src/ground_robot/__init__.py': '',
            'src/ground_robot/robot_controller.py': GROUND_ROBOT_PY,
            'config/nav2_params.yaml': NAV2_PARAMS_YAML,
            'urdf/robot.urdf': ROBOT_URDF,
            'launch/nav2_launch.py': NAV2_LAUNCH_PY,
            'CMakeLists.txt': cmakeLists('ground_robot'),
            'package.xml': packageXml('ground_robot', 'ROS 2 ground robot with Nav2'),
            'colcon.meta': COLCON_META,
            '.vscode/settings.json': VSCODE_SETTINGS,
        }
    },
    {
        id: 'jetson-vision-node',
        label: 'Jetson Vision Node',
        description: 'Computer vision pipeline on Jetson',
        detail: 'image_transport, OpenCV, camera calibration',
        files: {
            'src/vision_node/__init__.py': '',
            'src/vision_node/detector.py': DETECTOR_PY,
            'config/camera_params.yaml': CAMERA_PARAMS_YAML,
            'launch/vision_launch.py': VISION_LAUNCH_PY,
            'CMakeLists.txt': cmakeLists('vision_node'),
            'package.xml': packageXml('vision_node', 'Jetson camera vision pipeline'),
            'colcon.meta': COLCON_META,
            '.vscode/settings.json': VSCODE_SETTINGS,
        }
    },
    {
        id: 'rpi-mavlink-bridge',
        label: 'Raspberry Pi MAVLink Bridge',
        description: 'Companion computer MAVLink bridge',
        detail: 'pymavlink serial/UDP bridge, telemetry forwarder',
        files: {
            'src/mavlink_bridge/__init__.py': '',
            'src/mavlink_bridge/bridge.py': MAVLINK_BRIDGE_PY,
            'config/bridge_params.yaml': BRIDGE_PARAMS_YAML,
            'launch/bridge_launch.py': BRIDGE_LAUNCH_PY,
            'CMakeLists.txt': cmakeLists('mavlink_bridge'),
            'package.xml': packageXml('mavlink_bridge', 'Raspberry Pi MAVLink bridge'),
            'colcon.meta': COLCON_META,
            '.vscode/settings.json': VSCODE_SETTINGS,
        }
    },
];

// ── Contribution class ───────────────────────────────────────────────────

@injectable()
export class TemplatesContribution {
    @inject(QuickInputService) protected readonly quickInput: QuickInputService;
    @inject(MessageService)    protected readonly messageService: MessageService;
    @inject(WorkspaceService)  protected readonly workspaceService: WorkspaceService;
    @inject(FileService)       protected readonly fileService: FileService;

    async newProject(): Promise<void> {
        const items = ROS_TEMPLATES.map(t => ({
            label:       t.label,
            description: t.description,
            detail:      t.detail,
            template:    t,
        }));

        const selected = await this.quickInput.showQuickPick(
            items,
            { placeholder: 'Select a ROS 2 project template…', title: 'Rovant — New ROS 2 Project' }
        );
        if (!selected) return;

        const item = selected as typeof items[0];
        const name = await this.quickInput.input({
            prompt:       'Project folder name',
            value:        item.template.id,
            placeHolder:  'my_ros2_project',
        });
        if (!name) return;

        const roots = this.workspaceService.tryGetRoots();
        if (!roots.length) { this.messageService.error('Open a folder first'); return; }

        const base = roots[0].resource;
        let created = 0;

        for (const [relPath, content] of Object.entries(item.template.files)) {
            try {
                const uri = base.resolve(name).resolve(relPath);
                await this.fileService.create(new URI(uri.toString()), content, { fromUserGesture: true, overwrite: false });
                created++;
            } catch { /* skip if already exists */ }
        }

        this.messageService.info(`Created "${name}" — ${created} files from "${item.template.label}" template`);
    }
}
