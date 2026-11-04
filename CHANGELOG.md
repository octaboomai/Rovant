# Changelog — Rovant

## v0.1.0 — Initial Release

### Features
- Live ROS 2 telemetry viewer via rosbridge WebSocket
- URDF / Xacro 3D model preview (Three.js)
- `.msg` / `.srv` / `.action` syntax highlighting and autocomplete
- colcon, CMake, rosdep build tasks (13 registered)
- ROS 2 + Python attach-to-process debug configs (auto-written)
- Project templates: PX4 Quadcopter, ArduPilot Fixed-Wing, ROS2 Ground Robot, Jetson Vision Node, RPi MAVLink Bridge
- Toolchain installer with real environment checks (/rovant/check REST API)
- Rovant brand theme (dark, cyan accent) + animated splash screen
- System tray: minimize to tray, reopen from tray
- Auto-updater via GitHub Releases (electron-updater)
- First-run Python package setup (pymavlink, pyulog, numpy)
- Bundled: clangd 18 (C++ IntelliSense), pyright (Python IntelliSense)
- Offline vendor assets: Three.js r128, roslibjs 1.3.0

### Platforms
- Ubuntu 22.04 LTS (x64, arm64) — `.deb` + `.AppImage`
- Windows 10 / 11 (x64) — `.exe` (NSIS) + `.msi`
