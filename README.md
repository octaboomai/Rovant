# Rovant

> **The IDE that reads your drone's mind.**
> Zero-setup ROS 2 robotics IDE for Ubuntu and Windows.

[![Release](https://img.shields.io/github/v/release/octaboomai/Rovant)](https://github.com/octaboomai/Rovant/releases/latest)
[![Version](https://img.shields.io/badge/version-0.1.2-0fdfff)](https://github.com/octaboomai/Rovant/releases/tag/v0.1.2)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

---

## Download

**Latest release: Rovant v0.1.2**

| Platform | Format | Install |
|---|---|---|
| **Ubuntu / Debian** | `.deb` | `sudo apt install ./rovant-*.deb` |
| **Any Linux** | `.AppImage` | `chmod +x rovant-*.AppImage && ./rovant-*.AppImage` |
| **Windows 10/11** | `.exe` | Run the installer |

→ **[⬇ Download Rovant v0.1.2 — latest release](https://github.com/octaboomai/Rovant/releases/latest)**

### Windows: browser blocked the download?

The Windows installer is **not code-signed**, so Chrome / Edge and Windows SmartScreen may block it or warn that it "isn't commonly downloaded". If that happens, download it directly with PowerShell — open a Windows PowerShell window and paste this:

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri "https://github.com/octaboomai/Rovant/releases/download/v0.1.2/rovant-0.1.2-windows-x64.exe" -OutFile "$env:USERPROFILE\Downloads\rovant-0.1.2-windows-x64.exe"
```

Then run the file from your Downloads folder. Windows may still show a SmartScreen prompt for an unsigned app — choose **More info → Run anyway**.

---

## What's bundled (nothing to install separately)

- ROS 2 Humble detection + guided install
- **clangd 18** — bundled for C++; editor intelligence (completion, go-to-definition) arrives with language-server wiring in the next release
- **pyright** — bundled for Python; same caveat as clangd above
- **pymavlink + pyulog + numpy** — installed automatically on first launch
- Three.js + roslibjs — offline, no CDN needed

---

## Features

- Live ROS 2 telemetry via rosbridge WebSocket
- URDF / Xacro 3D model viewer
- `.msg` / `.srv` / `.action` syntax + autocomplete
- colcon + CMake build tasks
- Python + C++ attach-to-process debugging
- Project templates (PX4, ArduPilot, Nav2, Jetson, RPi)
- Toolchain environment checker
- System tray, auto-updater, window state persistence

---

## Development

```bash
git clone https://github.com/octaboomai/Rovant
cd rovant
yarn install
yarn workspace rovant-extension build
yarn workspace rovant-app build       # dev build
yarn workspace rovant-app start       # run in Electron

# Production package
yarn dist:linux    # → dist/*.deb + dist/*.AppImage
yarn dist:windows  # → dist/*.exe
```

---

## Release

```bash
git tag v0.2.0
git push origin v0.2.0
# GitHub Actions builds and publishes automatically
```

---

## Known limitations (v0.1 beta)

Please read this before filing an issue. It is deliberately blunt.

- **No code intelligence yet.** clangd and pyright ship inside the app but are not wired as language servers, so there is no autocomplete, go-to-definition or inline diagnostics yet. Syntax highlighting and language detection for 13 languages does work.
- **No C++ debugger.** Python debugging requires `debugpy` (`pip install debugpy`), which the Windows toolchain setup installs for you.
- **ROS 2 on Windows runs through WSL.** Install WSL 2 and ROS 2 Humble inside it first — the IDE shells out via `wsl.exe`. On Ubuntu, use the ROS 2 Toolchain panel's "Install / repair".
- **Builds are not code-signed.** Windows SmartScreen will warn on first run. Use the PowerShell download command above and verify the SHA-256 shown on the release page.
- **Tested on Ubuntu 22.04 and Windows 11 only.** Other distributions and versions may work but are untested.

---

## License

Apache 2.0 © octaboomai
