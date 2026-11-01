# Code Quality Report — Rovant
**Generated:** 2026-10-16 | **Auditor:** AI Engineering Team

---

## 1. Technical Debt Summary

| Category | Count | Severity |
|---|---|---|
| Missing error boundaries | 4 | High |
| Hardcoded strings (not i18n) | 22 | Low |
| Missing TypeScript return types | 8 | Medium |
| Dead code / unused exports | 3 | Low |
| Async without proper cancellation | 5 | Medium |
| Missing input validation | 6 | High |
| Console.log in production paths | 12 | Low |

---

## 2. Critical Issues

### 2.1 Shell Injection Risk — `/o1/install-stream`
**File:** `src/node/o1-rest-contribution.ts`
**Risk:** HIGH

The install endpoint runs `bash scripts/install-ros.sh` with no parameter validation. While the path is fixed (no user input), the environment is inherited fully. If `PATH` or any env var were manipulated, arbitrary commands could execute.

**Fix:** Use `execFile` instead of `spawn` with `bash`, and sanitize the environment.

```typescript
// BEFORE (risky)
const proc = spawn('bash', [scriptPath], { env: process.env });

// AFTER (safe)
const proc = spawn(scriptPath, [], {
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: process.env['HOME'] },
    shell: false
});
```

### 2.2 Port Polling Without Timeout in `waitForPort`
**File:** `o1-app/src/electron-main.ts`
**Risk:** MEDIUM

The `waitForPort` function has a timeout but the inner `http.get` can hang until OS-level TCP timeout (~2 min) if the port is firewalled rather than closed.

```typescript
// FIX: Add explicit socket timeout
const req = http.get({ hostname: '127.0.0.1', port, path: '/', timeout: 800 }, ...)
req.on('timeout', () => { req.destroy(); resolve(false); });
```

### 2.3 No Error Handling in `firstRunSetup`
**File:** `o1-app/src/electron-main.ts`
**Risk:** MEDIUM

If pip is not found and both install attempts fail, the function silently continues and marks setup as complete. This means on next launch, pip errors are never shown to the user.

**Fix:** Track pip failure and surface it in the Toolchain Installer widget.

### 2.4 Missing Input Sanitization in ROS Topics Widget
**File:** `src/browser/ros-topics/ros-topics-widget.ts`
**Risk:** MEDIUM

The rosbridge URL entered by the user is used directly in `new WebSocket(url)`. A malformed URL can throw an unhandled exception.

```typescript
// ADD: URL validation before WebSocket creation
try { new URL(url); } catch {
    this.showError('Invalid rosbridge URL');
    return;
}
```

---

## 3. Code Duplication

| Pattern | Files | Lines duplicated |
|---|---|---|
| `exec` + timeout wrapper | electron-main.ts, o1-rest-contribution.ts | ~15 |
| Check-result interface | toolchain-installer.ts (inline JS) mirrors o1-rest-contribution.ts | ~20 |
| ROS distro list | detect-ros.sh, install-toolchain-windows.ps1, electron-main.ts | ~5 |
| Error-to-UI pattern | Multiple widgets repeat `.style.color = '#ff7b44'` | ~8 |

**Recommendation:** Extract shared utilities into `o1-extension/src/common/utils.ts`.

---

## 4. Type Safety Gaps

```typescript
// MISSING return type annotations found in:

// 1. electron-main.ts
async function firstRunSetup()        // should be: Promise<void>
function getIconPath()                // should be: string | undefined

// 2. o1-rest-contribution.ts
private async runCheck(id, label, cmd) // params untyped in JS compiled form

// 3. toolchain-installer.ts
// Inline <script> block has no TypeScript — all runtime JS
// Should be extracted to a typed module
```

---

## 5. Dead Code

| File | Dead Symbol | Reason |
|---|---|---|
| `o1-frontend-module.ts` | `TemplatesContribution` imported but binding never activates on startup | Missing activation event |
| `ros-build-tasks.ts` | `ROS2_TASK_TYPE` constant | Defined but value duplicated inline |
| `preload.ts` | `onCommand` + `onOpenFolder` | Registered but renderer never listens |

---

## 6. Performance Notes

| Issue | Impact | Fix |
|---|---|---|
| `detectToolchain()` runs 8 sequential `exec` calls | 8× latency | Run with `Promise.all()` |
| URDF parser re-runs on every widget activation | CPU spike | Cache parsed result per file path |
| ROS Topics widget rebuilds full DOM on each message | Jank at >10Hz | Virtualised list or delta updates |
| `toolchain-installer.ts` inline script is not minified | Bundle size | Move to TypeScript source |

---

## 7. Security Scan Results

| Finding | Severity | File | Line |
|---|---|---|---|
| `shell: true` implicit in exec | Medium | electron-main.ts | ~180 |
| Unchecked `req.params['id']` in REST route | Medium | o1-rest-contribution.ts | ~55 |
| `webSecurity: !isDev` disables in dev mode | Low | electron-main.ts | ~100 |
| autoUpdater feed URL is HTTP not HTTPS | N/A | Resolved — uses GitHub HTTPS | — |
| No CSP on splash.html | Low | splash.html | head |

---

## 8. Recommended Refactors (Safe, Non-Breaking)

1. **Extract `ROS_DISTROS` to a shared constant** — used in 3 places
2. **Replace `Promise.all` in `detectToolchain`** — 8x speed improvement
3. **Add `Content-Security-Policy` meta to splash.html**
4. **Replace inline `<script>` in toolchain-installer with proper TypeScript**
5. **Add JSDoc to all public functions**
6. **Replace magic numbers** (45000ms, 3001, 0.6) with named constants
