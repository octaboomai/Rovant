# Architecture Report — Rovant
**Generated:** 2026-10-16 | **Auditor:** AI Engineering Team | **Repo:** octaboomai/rovant

---

## 1. System Overview

Rovant is a **native desktop IDE** for drone and robotics engineers, built on Eclipse Theia wrapped in Electron. It targets Ubuntu Linux (x64, arm64) and Windows 10/11 (x64).

```
┌─────────────────────────────────────────────────────────────┐
│                     Rovant Desktop App                       │
│                                                             │
│  ┌─────────────────┐      ┌──────────────────────────────┐  │
│  │  Electron Shell │      │     Theia IDE (Browser UI)   │  │
│  │  electron-main  │─────▶│  Monaco Editor + Extensions  │  │
│  │  (Node.js 18)   │      │  React Webviews (widgets)    │  │
│  └────────┬────────┘      └──────────────────────────────┘  │
│           │                                                  │
│           │ spawns                                           │
│           ▼                                                  │
│  ┌─────────────────┐      ┌──────────────────────────────┐  │
│  │  Theia Backend  │      │     Rovant Extension Layer       │  │
│  │  (Node.js HTTP  │◀────▶│  - ROS Topics Widget         │  │
│  │   port 3001)    │      │  - URDF 3D Viewer            │  │
│  │  REST + WS      │      │  - Toolchain Installer       │  │
│  └────────┬────────┘      │  - Build Tasks (colcon)      │  │
│           │               │  - Project Templates         │  │
│           │               │  - Debug Configs             │  │
│           │               └──────────────────────────────┘  │
└───────────┼─────────────────────────────────────────────────┘
            │
            ▼ connects to
┌───────────────────────────┐   ┌───────────────────────────┐
│  User's ROS 2 System      │   │  Flight Controller        │
│  rosbridge_websocket:9090 │   │  MAVLink UDP:14550        │
│  ROS topics / nodes       │   │  Serial: /dev/ttyUSB0     │
└───────────────────────────┘   └───────────────────────────┘
```

---

## 2. Component Inventory

### 2.1 Electron Shell (`o1-app/src/`)
| File | Role | Lines |
|---|---|---|
| `electron-main.ts` | Process manager, window lifecycle, IPC, auto-updater | ~350 |
| `preload.ts` | Secure IPC bridge (contextBridge) | ~30 |
| `splash.html` | Branded loading screen | ~60 |

### 2.2 Theia Extension (`o1-extension/src/`)
**Browser-side (renderer process):**
| Module | Responsibility |
|---|---|
| `o1-commands.ts` | Menu commands + keyboard shortcuts |
| `o1-frontend-module.ts` | Dependency injection bindings |
| `o1-branding.ts` | Logo, CSS theme, favicon injection |
| `ros-topics/ros-topics-widget.ts` | Live ROS 2 topic viewer via rosbridge WebSocket |
| `urdf-viewer/urdf-viewer-widget.ts` | 3D URDF/Xacro model preview (Three.js) |
| `toolchain/toolchain-installer.ts` | Environment checker + installer UI |
| `templates/templates-contribution.ts` | 5 project scaffolding templates |
| `ros-debug-config.ts` | Auto-generates `.vscode/launch.json` |
| `ros-lang-grammar.ts` | `.msg/.srv/.action` TextMate grammar |

**Node-side (backend process):**
| Module | Responsibility |
|---|---|
| `o1-rest-contribution.ts` | REST API: `/o1/check`, `/o1/install-stream`, `/o1/ros/topics` |
| `o1-backend-module.ts` | InversifyJS DI bindings for backend |
| `ros-build-tasks.ts` | 13 colcon/CMake/ROS 2 task providers |

### 2.3 Build & Packaging
| File | Purpose |
|---|---|
| `electron-builder.config.js` | Packages `.deb`, `.AppImage`, `.exe`, `.msi` |
| `.github/workflows/release.yml` | CI/CD — builds on tag push |
| `package.json` | Workspace root + yarn workspaces |

### 2.4 Runtime Dependencies (Bundled)
| Asset | Size | Purpose |
|---|---|---|
| clangd 18 | ~50 MB | C++ IntelliSense — no host install needed |
| pyright | ~30 MB | Python IntelliSense — npm bundled |
| three.min.js (r128) | ~600 KB | URDF 3D rendering — offline |
| roslib.min.js (1.3.0) | ~80 KB | rosbridge client — offline |

---

## 3. Data Flow

### 3.1 ROS 2 Topic Viewer
```
User's Robot (rosbridge:9090)
    → WebSocket → RosTopicsWidget (browser)
    → DOM render → Live topic list + message subscribe
```

### 3.2 Toolchain Check
```
ToolchainInstallerWidget (browser)
    → fetch GET /o1/check
    → O1RestContribution (node backend)
    → exec("ros2 --version", "clangd --version", ...)
    → JSON result → UI status rows
```

### 3.3 Install Stream
```
ToolchainInstallerWidget
    → EventSource /o1/install-stream
    → O1RestContribution streams stdout/stderr
    → SSE lines → log UI rows
```

### 3.4 Electron ↔ Theia
```
Electron main spawns → Theia backend (port 3001)
    → BrowserWindow loads http://127.0.0.1:3001
    → Theia frontend loads in Chromium renderer
    → IPC via contextBridge (preload.ts)
    → ipcMain.handle("Rovant:detect-toolchain") → exec checks
```

---

## 4. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Desktop shell | Electron | 29.x |
| IDE framework | Eclipse Theia | 1.76.0 |
| UI renderer | Chromium (via Electron) | — |
| Code editor | Monaco Editor (via Theia) | — |
| 3D viewer | Three.js | r128 |
| ROS bridge client | roslibjs | 1.3.0 |
| Language | TypeScript | 5.3.x |
| Runtime | Node.js | 18.x |
| Packaging | electron-builder | 24.x |
| Auto-updater | electron-updater | 6.x |
| DI framework | InversifyJS (via Theia) | — |

---

## 5. External Interfaces

| Interface | Protocol | Direction | Purpose |
|---|---|---|---|
| rosbridge | WebSocket | bidirectional | ROS 2 topic pub/sub |
| MAVLink | UDP:14550 / Serial | in | Drone telemetry (future) |
| GitHub Releases | HTTPS | out | Auto-update check |
| `/o1/check` | HTTP GET | internal | Toolchain detection |
| `/o1/install-stream` | SSE | internal | Install log streaming |

---

## 6. Architecture Risks

| Risk | Severity | Notes |
|---|---|---|
| Theia 1.76.0 hardcoded | Medium | Should be a version range in CI |
| Single THEIA_PORT=3001 | Medium | Port conflicts not fully tested |
| No persistent telemetry store | High | All data in memory, lost on restart |
| No authentication on REST endpoints | Medium | `/o1/install-stream` runs shell — local only but worth noting |
| WSL2 ROS path hardcoded to humble | Medium | Multiple distro support partial |
| No plugin marketplace for o1-specific extensions | Low | Future gap |
