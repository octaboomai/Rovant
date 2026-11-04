# Rovant — Product Roadmap
**Last updated:** 2026-10-16 | **Maintainer:** octaboomai

---

## Immediate — Critical Fixes (Week 1)

| # | Task | Priority | Owner |
|---|---|---|---|
| C-1 | Fix shell injection in `/rovant/install-stream` | P0 🔴 | Backend |
| C-2 | Add `/rovant/health` endpoint | P0 🔴 | Backend |
| C-3 | Add PR lint + TypeScript type-check CI workflow | P0 🔴 | DevOps |
| C-4 | Add unit tests for `detectToolchain()` | P0 🔴 | QA |
| C-5 | Add `http.get` socket timeout in `waitForPort` | P0 🔴 | Electron |
| C-6 | Replace `Promise.all` in detectToolchain (8× speedup) | P0 🔴 | Electron |
| C-7 | Add URL validation in ROS Topics Widget | P0 🔴 | Extension |

---

## Quick Wins (Weeks 2–3)

| # | Task | Value | Effort |
|---|---|---|---|
| Q-1 | SECURITY.md + Dependabot config | Security | 1h |
| Q-2 | CodeQL scanning workflow | Security | 1h |
| Q-3 | Add Sentry crash reporting (opt-in) | Stability | 3h |
| Q-4 | `/rovant/ros/topics` — filter system topics | UX | 1h |
| Q-5 | URDF viewer — cache parsed result per file | Performance | 2h |
| Q-6 | Add loading state to ROS Topics Widget | UX | 1h |
| Q-7 | Log rotation for Theia backend stdout | Stability | 1h |
| Q-8 | Add `CONTRIBUTING.md` | Community | 2h |
| Q-9 | JSDoc all public functions | Maintainability | 4h |
| Q-10 | Snap Store manifest (`snapcraft.yaml`) | Distribution | 3h |

---

## Month 1 — Stability + AI Layer Foundation

### v0.2.0 — AI Diagnostic Engine (Month 3–4 of original roadmap)

| Feature | Description |
|---|---|
| **Anomaly detection** | Battery drain, IMU drift, motor asymmetry, vibration FFT running on live telemetry |
| **Telemetry-to-code mapping** | AST parsing maps source code variables → MAVLink/ROS topics |
| **AI chat panel** | Context-aware sidebar chat using Claude Sonnet API |
| **Code review for robotics** | PID stability check, topic rate mismatch, safety bypass detection |
| **Flight log comparison** | Diff two `.bin` / `.ulg` files, AI highlights behavioural changes |

**Monetization trigger:** This is the paywall. Free tier gets telemetry. Pro gets AI.

---

## Month 2 — Deploy Pipeline

### v0.3.0 — One-Click Deploy

| Feature | Description |
|---|---|
| WiFi deploy | SSH + rsync from IDE to Raspberry Pi / Jetson |
| Deploy-aware AI | Watches telemetry post-deploy, flags regressions |
| Mission runner | YAML test missions, MAVSDK execution, AI analysis |
| Basic fleet view | N robots in grid, batch deploy |

---

## Month 3 — Full Studio

### v0.4.0 — Full Studio

| Feature | Description |
|---|---|
| PID tuning assistant | FFT analysis → gain suggestions → one-click redeploy |
| Pre-flight safety check | Battery, GPS, IMU calibration, geofence, failsafe |
| Gazebo integration | Headless sim in Docker, streamed to IDE panel |
| DGCA compliance | India-specific flight log format, logbook, no-fly zones |
| Multi-ROS distro | Jazzy, Iron, Rolling support (currently Humble only) |

---

## Distribution Targets

| Channel | Target Date | Status |
|---|---|---|
| GitHub Releases (.deb, .AppImage, .exe) | v0.1.0 launch | ✅ CI ready |
| Snap Store | v0.1.1 | 🔜 Manifest needed |
| winget (Windows Package Manager) | v0.1.1 | 🔜 PR to microsoft/winget-pkgs |
| Flatpak (Flathub) | v0.2.0 | 🔜 Manifest needed |
| Ubuntu PPA | v0.2.0 | 🔜 Needs signing key |

---

## Revenue Model Targets

| Tier | Price | Month 6 Target | MRR |
|---|---|---|---|
| Community | Free | 2,000 installs | $0 |
| Pro | $25/mo (₹499/mo) | 150 users | $3,750 |
| Team | $75/user/mo | 10 teams × 3 | $2,250 |
| Enterprise | Custom | 2 pilots | ~$5,000 |
| **Total** | | | **~$11,000** |

---

## Technical Debt Paydown Schedule

| Sprint | Debt Item |
|---|---|
| S1 | Shell injection fix, health endpoint, PR CI |
| S2 | Test coverage to 40%, JSDoc, SECURITY.md |
| S3 | Test coverage to 80%, Sentry integration |
| S4 | Snap/winget distribution, log rotation |
