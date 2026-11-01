/**
 * Rovant — Electron main process
 * Fixes applied:
 *  1. Spawns Theia backend before opening window (was missing entirely)
 *  2. Uses electron-updater (works Linux/Win/Mac — electron built-in crashes on Linux)
 *  3. org placeholder replaced with octaboomai/rovant
 *  4. First-run Python package setup (pymavlink/pyulog/numpy)
 *  5. WSL2 ROS 2 detection on Windows
 *  6. Port conflict auto-resolution
 *  7. Clean process teardown on quit
 */
import {
    app, BrowserWindow, dialog, Menu, nativeTheme,
    shell, Tray, nativeImage, ipcMain
} from 'electron';
import { autoUpdater } from 'electron-updater';  // FIX #2: not electron built-in
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';
import { spawn, ChildProcess } from 'child_process';
import { waitForPort, findFreePort } from './utils';
const isDev  = process.env['NODE_ENV'] === 'development';
const APP_NAME    = 'Rovant';
const APP_VERSION = app.getVersion();
const THEIA_PORT  = 3001;   // internal port — user never sees this
const SETUP_FLAG  = path.join(app.getPath('userData'), 'setup-v1.json');

let mainWindow:   BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray:         Tray | null = null;
let theiaProcess: ChildProcess | null = null;
let isQuitting    = false;

// ── Single instance ───────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

// ── App ready ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark';
    showSplash();

    try {
        // FIX #1: Start Theia backend FIRST, then open window
        if (!isDev) {
            await startTheiaBackend();
        }
        await firstRunSetup();   // Python packages, workspace dir
        await createWindow();
    } catch (err: any) {
        dialog.showErrorBox('Rovant failed to start', err.message || String(err));
        app.quit();
        return;
    }

    setupTray();
    setupMenu();
    setupAutoUpdater();
    setupIPC();
    splashWindow?.close();
});

// ── Splash screen (shown while backend starts) ─────────────────────────────────
function showSplash(): void {
    const splashPath = path.join(__dirname, '..', 'resources', 'splash.html');
    if (!fs.existsSync(splashPath)) return;

    splashWindow = new BrowserWindow({
        width: 380, height: 280,
        frame: false, transparent: true,
        resizable: false, alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    splashWindow.loadFile(splashPath);
    splashWindow.center();
}

// ── FIX #1: Spawn Theia backend and wait for it ───────────────────────────────
async function startTheiaBackend(): Promise<void> {
    const backendMain = path.join(__dirname, '..', 'backend', 'main.js');
    if (!fs.existsSync(backendMain)) {
        throw new Error(`Theia backend not found at ${backendMain}. Run: yarn build:prod`);
    }

    // Find a free port (retry if 3001 is taken)
    const port = await findFreePort(THEIA_PORT);

    const env = {
        ...process.env,
        THEIA_ELECTRON_WINDOW_OPTIONS: JSON.stringify({ backgroundColor: '#07090d' }),
        // Point clangd at the bundled binary
        PATH: [
            path.join(process.resourcesPath, 'clangd'),
            path.join(process.resourcesPath, 'pyright', 'node_modules', '.bin'),
            process.env['PATH'] || '',
        ].join(process.platform === 'win32' ? ';' : ':'),
    };

    theiaProcess = spawn(process.execPath, [
        backendMain,
        '--hostname=127.0.0.1',
        `--port=${port}`,
        `--root-dir=${defaultWorkspace()}`,
    ], { env, stdio: 'pipe' });

    theiaProcess.on('error', err => console.error('[Rovant backend]', err));
    theiaProcess.stderr?.on('data', d => console.error('[Rovant backend]', d.toString().trim()));

    // Wait up to 45 s for the backend to accept connections
    await waitForPort(port, 45_000);
    (app as any)._theiaPort = port;   // share port with createWindow
}


// ── First-run Python package setup ────────────────────────────────────────────
async function firstRunSetup(): Promise<void> {
    // Create workspace dir
    const ws = defaultWorkspace();
    if (!fs.existsSync(ws)) fs.mkdirSync(ws, { recursive: true });

    // Check if already done
    try {
        const flag = JSON.parse(fs.readFileSync(SETUP_FLAG, 'utf8'));
        if (flag.pythonPackages) return;
    } catch {}

    // Try to install Python packages silently in background
    const pip = process.platform === 'win32' ? 'pip' : 'pip3';
    const pkgs = 'pymavlink pyulog numpy';
    try {
        await exec(`${pip} install ${pkgs} --break-system-packages -q 2>&1`, { timeout: 90_000 });
    } catch {
        try {
            await exec(`${pip} install ${pkgs} -q 2>&1`, { timeout: 90_000 });
        } catch {
            console.warn('[Rovant] pip install failed — user will see manual instructions in toolchain tab');
        }
    }

    // Mark done regardless — don't block startup on pip failure
    fs.writeFileSync(SETUP_FLAG, JSON.stringify({ pythonPackages: true, ts: Date.now() }));
}

// ── Main window ───────────────────────────────────────────────────────────────
async function createWindow(): Promise<void> {
    const iconPath   = getIconPath();
    const savedBounds = loadWindowBounds();
    const theiaPort  = isDev ? 3000 : ((app as any)._theiaPort || THEIA_PORT);

    mainWindow = new BrowserWindow({
        ...savedBounds,
        minWidth: 900, minHeight: 600,
        title: APP_NAME,
        icon:  iconPath,
        backgroundColor: '#07090d',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            preload:    path.join(__dirname, 'preload.js'),
            webviewTag: true,
            webSecurity: !isDev,
        },
        show: false,
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow!.show();
        if (isDev) mainWindow!.webContents.openDevTools();
    });

    // Load Theia from the running backend
    mainWindow.loadURL(`http://127.0.0.1:${theiaPort}`);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith(`http://127.0.0.1:${theiaPort}`) || url.startsWith('file://')) {
            return { action: 'allow' };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('resize', saveWindowBounds);
    mainWindow.on('move',   saveWindowBounds);

    mainWindow.on('close', e => {
        if (!isQuitting && process.platform !== 'darwin') {
            e.preventDefault();
            mainWindow!.hide();
        }
    });
    mainWindow.on('closed', () => { mainWindow = null; });
}

// ── System tray ───────────────────────────────────────────────────────────────
function setupTray(): void {
    const iconPath = getIconPath();
    if (!iconPath) return;
    const img = nativeImage.createFromPath(iconPath);
    tray = new Tray(img.resize({ width: 16, height: 16 }));
    tray.setToolTip(APP_NAME);
    const menu = Menu.buildFromTemplate([
        { label: `Rovant  v${APP_VERSION}`, enabled: false },
        { type: 'separator' },
        { label: 'Open IDE',    click: () => { mainWindow?.show(); mainWindow?.focus(); } },
        { label: 'New Window',  click: createWindow },
        { type: 'separator' },
        { label: 'Quit',        click: () => { isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── Menu ──────────────────────────────────────────────────────────────────────
function setupMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: APP_NAME,
            submenu: [
                { label: 'About Rovant',          click: showAbout },
                { label: 'Check for Updates…',    click: () => autoUpdater.checkForUpdates() },
                { type: 'separator' },
                { label: 'Preferences',           accelerator: 'CmdOrCtrl+,', click: openPreferences },
                { type: 'separator' },
                { label: 'Quit Rovant',           accelerator: 'CmdOrCtrl+Q', click: () => { isQuitting = true; app.quit(); } },
            ],
        },
        {
            label: 'File',
            submenu: [
                { label: 'Open Folder…', accelerator: 'CmdOrCtrl+K CmdOrCtrl+O', click: openFolder },
                { label: 'New Window',   accelerator: 'CmdOrCtrl+Shift+N',        click: createWindow },
                { type: 'separator' },
                { label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W', role: 'close' },
            ],
        },
        { label: 'Edit',  submenu: [{ role:'undo' },{ role:'redo' },{ type:'separator' },{ role:'cut' },{ role:'copy' },{ role:'paste' },{ role:'selectAll' }] },
        { label: 'View',  submenu: [{ role:'reload' },{ role:'forceReload' },{ type:'separator' },{ role:'toggleDevTools' },{ type:'separator' },{ role:'resetZoom' },{ role:'zoomIn' },{ role:'zoomOut' },{ type:'separator' },{ role:'togglefullscreen' }] },
        {
            label: 'Help',
            submenu: [
                { label: 'Rovant Website',  click: () => shell.openExternal('https://o1ide.dev') },
                { label: 'Documentation',   click: () => shell.openExternal('https://o1ide.dev/docs') },
                { label: 'ROS Discourse',   click: () => shell.openExternal('https://discourse.ros.org') },
                { type: 'separator' },
                { label: 'Terms of Service', click: () => shell.openExternal('https://o1ide.dev/terms') },
                { label: 'Privacy Policy',   click: () => shell.openExternal('https://o1ide.dev/privacy') },
                { type: 'separator' },
                { label: 'Report Issue',    click: () => shell.openExternal('https://github.com/octaboomai/rovant/issues') },
                { label: 'About Rovant',    click: showAbout },
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC ───────────────────────────────────────────────────────────────────────
function setupIPC(): void {
    ipcMain.handle('Rovant:detect-toolchain', async () => detectToolchain());
    ipcMain.handle('Rovant:open-folder', async () => {
        const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'], title: 'Open ROS 2 workspace' });
        return r.canceled ? null : r.filePaths[0];
    });
    ipcMain.handle('Rovant:get-platform', () => ({ os: process.platform, arch: process.arch, version: APP_VERSION, home: os.homedir() }));
}

// ── FIX #2: Auto-updater via electron-updater (works on all platforms) ────────
function setupAutoUpdater(): void {
    if (isDev) return;
    try {
        // FIX #3: org replaced with octaboomai
        autoUpdater.setFeedURL({
            provider: 'github',
            owner:    'octaboomai',
            repo:     'rovant',
        } as any);

        autoUpdater.logger = null;
        autoUpdater.checkForUpdates().catch(() => {});
        setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);

        autoUpdater.on('update-downloaded', (_info) => {
            const choice = dialog.showMessageBoxSync(mainWindow!, {
                type: 'info', title: 'Update ready',
                message: `A new version of Rovant is ready.`,
                detail:  'Restart to apply the update.',
                buttons: ['Restart now', 'Later'],
            });
            if (choice === 0) { isQuitting = true; autoUpdater.quitAndInstall(); }
        });
    } catch (err) {
        console.warn('[Rovant] Auto-updater unavailable:', (err as Error).message);
    }
}

// ── Toolchain detection ───────────────────────────────────────────────────────
async function detectToolchain(): Promise<Record<string, { found: boolean; version: string }>> {
    const bundledClangd  = path.join(process.resourcesPath || '', 'clangd', 'clangd');
    const bundledPyright = path.join(process.resourcesPath || '', 'pyright', 'node_modules', '.bin', 'pyright');

    const checks: Record<string, string> = {
        python3:    'python3 --version',
        pymavlink:  'python3 -c "import pymavlink; print(pymavlink.__version__)"',
        pyulog:     'python3 -c "import pyulog; print(pyulog.__version__)"',
        numpy:      'python3 -c "import numpy; print(numpy.__version__)"',
        clangd:     fs.existsSync(bundledClangd)  ? `"${bundledClangd}" --version` : 'clangd --version',
        pyright:    fs.existsSync(bundledPyright) ? `node "${bundledPyright}" --version` : 'pyright --version',
        git:        'git --version',
        cmake:      'cmake --version',
        ros2:       detectRosCmd(),
        colcon:     'colcon --version',
    };

    const results: Record<string, { found: boolean; version: string }> = {};
    for (const [id, cmd] of Object.entries(checks)) {
        try {
            const { stdout } = await exec(cmd, { timeout: 6000, shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash' });
            results[id] = { found: true, version: stdout.trim().split('\n')[0].substring(0, 70) };
        } catch {
            results[id] = { found: false, version: 'not found' };
        }
    }
    return results;
}

function detectRosCmd(): string {
    if (process.platform === 'win32') {
        // FIX: WSL2 ROS detection on Windows
        return 'wsl -- bash -c "source /opt/ros/humble/setup.bash 2>/dev/null && ros2 --version"';
    }
    return 'bash -c "source /opt/ros/humble/setup.bash 2>/dev/null; ros2 --version"';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function defaultWorkspace(): string {
    return path.join(os.homedir(), 'o1-workspace');
}

function getIconPath(): string {
    const ext  = process.platform === 'win32' ? 'ico' : 'png';
    const file = path.join(__dirname, '..', 'resources', `icon.${ext}`);
    return fs.existsSync(file) ? file : '';
}

function loadWindowBounds(): Partial<Electron.Rectangle> {
    try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window-bounds.json'), 'utf8')); }
    catch { return { width: 1400, height: 900 }; }
}

function saveWindowBounds(): void {
    if (!mainWindow) return;
    fs.writeFileSync(path.join(app.getPath('userData'), 'window-bounds.json'), JSON.stringify(mainWindow.getBounds()));
}

function showAbout(): void {
    dialog.showMessageBox(mainWindow!, {
        type: 'none', title: `About ${APP_NAME}`,
        message: `Rovant  v${APP_VERSION}`,
        detail:  "The IDE that reads your drone's mind.\n\nBuilt on Eclipse Theia.\nLicensed under Apache 2.0.\n\nhttps://o1ide.dev",
        buttons: ['OK'],
    });
}

function openPreferences(): void { mainWindow?.webContents.send('theia:command', 'preferences:open'); }

async function openFolder(): Promise<void> {
    const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'], title: 'Open workspace' });
    if (!r.canceled && r.filePaths[0]) mainWindow?.webContents.send('theia:open-folder', r.filePaths[0]);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { BrowserWindow.getAllWindows().length === 0 ? createWindow() : mainWindow?.show(); });
app.on('before-quit', () => { isQuitting = true; });
app.on('will-quit', () => {
    // FIX: Clean up Theia backend process on quit
    if (theiaProcess && !theiaProcess.killed) {
        theiaProcess.kill('SIGTERM');
    }
});
