# Deployment Guide — Rovant
**Version:** 0.1.0 | **Last updated:** 2026-10-16

---

## 1. Distribution Channels

### 1.1 GitHub Releases (Primary)
Automated via `.github/workflows/release.yml` on tag push.

```bash
git tag v0.1.0
git push origin v0.1.0
# → CI builds .deb + .AppImage + .exe + .msi
# → Published to https://github.com/octaboomai/rovant/releases/tag/v0.1.0
```

Artifacts generated:
- `rovant-0.1.0-linux-x64.deb`
- `rovant-0.1.0-linux-x64.AppImage`
- `rovant-0.1.0-linux-arm64.deb`
- `rovant-0.1.0-linux-arm64.AppImage`
- `rovant-0.1.0-windows-x64.exe`
- `rovant-0.1.0-windows-x64.msi`

---

## 2. User Installation

### Linux — .deb (Ubuntu 22.04+)
```bash
# Download
wget https://github.com/octaboomai/rovant/releases/latest/download/rovant-linux-x64.deb

# Install
sudo apt install ./rovant-linux-x64.deb

# Launch
o1ide
```

### Linux — AppImage (any distro)
```bash
wget https://github.com/octaboomai/rovant/releases/latest/download/rovant-linux-x64.AppImage
chmod +x rovant-linux-x64.AppImage
./rovant-linux-x64.AppImage
```

### Windows 10/11
1. Download `rovant-windows-x64.exe` from GitHub Releases
2. Run the installer (click through prompts)
3. Launch from Start Menu → "Rovant"
4. First run: WSL2 + ROS 2 setup runs automatically

---

## 3. Build From Source

### Prerequisites
```bash
# Linux
sudo apt install build-essential libx11-dev libxkbfile-dev libsecret-1-dev git curl
node --version  # need 18.x
yarn --version  # need 1.22+
```

### Local Development Build
```bash
git clone https://github.com/octaboomai/rovant
cd rovant
yarn install
yarn workspace o1-extension build
yarn workspace o1-app build      # dev build (with source maps)
yarn workspace o1-app start      # launch Electron
```

### Production Package
```bash
# Linux
npx electron-builder --linux deb AppImage

# Windows (cross-compile from Linux — wine required for NSIS)
npx electron-builder --win nsis msi

# Output in ./dist/
```

---

## 4. Cheapest Production-Ready Hosting

Rovant is a desktop app — no server hosting required. The only ongoing costs are:

| Service | Cost | Purpose |
|---|---|---|
| GitHub Free | $0 | Releases, CI/CD, issues |
| o1ide.dev domain | ~$12/yr | Website + email |
| GitHub Pages | $0 | Website hosting |
| Cloudflare | $0 | CDN for website |
| Codecov | $0 (open source) | Coverage reports |
| Sentry (hobby) | $0–26/mo | Crash reporting |
| **Total** | **~$1–38/mo** | Full production setup |

### Recommended Stack for Zero Infrastructure Cost

```
Website:    GitHub Pages + Cloudflare CDN
CI/CD:      GitHub Actions (2000 min/mo free)
Releases:   GitHub Releases (unlimited storage for public repos)
Analytics:  Plausible.io self-hosted on Hetzner ($4/mo) or Cloudflare Analytics (free)
Crash:      Sentry (free tier: 5k events/mo)
Payments:   Lemonsqueezy or Paddle (no monthly fee, % of revenue only)
```

---

## 5. Release Checklist

Before tagging a release:

- [ ] All CI checks passing on `main`
- [ ] Version bumped in `package.json` and `o1-app/package.json`
- [ ] `CHANGELOG.md` updated
- [ ] `README.md` reflects current features
- [ ] No `.env` or secrets in the commit
- [ ] Test on clean Ubuntu 22.04 VM
- [ ] Test on Windows 11 VM
- [ ] Auto-updater tested: install old version → check for update → apply

```bash
# Bump version
npm version patch  # or minor, major
git push && git push --tags
```

---

## 6. Auto-Update Flow

```
User has Rovant v0.1.0 installed
→ App starts → autoUpdater.checkForUpdates()
→ GitHub API: GET /repos/octaboomai/rovant/releases/latest
→ Compares version
→ If newer: downloads update in background
→ Shows dialog: "Update ready — restart now?"
→ User clicks Restart → autoUpdater.quitAndInstall()
→ New version runs
```

Update check frequency: on startup + every 4 hours.

---

## 7. Snap Store (v0.1.1)

```yaml
# snapcraft.yaml — to be created in v0.1.1
name: rovant
version: '0.1.1'
grade: stable
confinement: classic  # needed for filesystem access
apps:
  rovant:
    command: o1ide
    plugs: [home, network, removable-media]
```

Submit: `snapcraft push --release=stable rovant_0.1.1_amd64.snap`

---

## 8. winget (v0.1.1)

Submit a PR to `microsoft/winget-pkgs`:
```yaml
PackageIdentifier: octaboomai.o1ide
PackageVersion: 0.1.1
PackageName: Rovant
Publisher: octaboomai
InstallerUrl: https://github.com/octaboomai/rovant/releases/download/v0.1.1/rovant-0.1.1-windows-x64.exe
InstallerSha256: <sha256 of exe>
InstallerType: nullsoft
```

Users then install with: `winget install octaboomai.o1ide`
