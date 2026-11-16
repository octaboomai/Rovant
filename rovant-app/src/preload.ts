import { contextBridge, ipcRenderer } from 'electron';

/**
 * Secure IPC bridge — exposes only specific channels to the renderer.
 * The frontend can call window.Rovant.detectToolchain() etc.
 */
contextBridge.exposeInMainWorld('Rovant', {
    detectToolchain: () => ipcRenderer.invoke('Rovant:detect-toolchain'),
    openFolder:      () => ipcRenderer.invoke('Rovant:open-folder'),
    getPlatform:     () => ipcRenderer.invoke('Rovant:get-platform'),

    // Listen for commands from main process
    onCommand: (cb: (cmd: string) => void) =>
        ipcRenderer.on('theia:command', (_e, cmd) => cb(cmd)),
    onOpenFolder: (cb: (folder: string) => void) =>
        ipcRenderer.on('theia:open-folder', (_e, folder) => cb(folder)),

    // ── Self-update ───────────────────────────────────────────────────────────
    // The renderer only ever reads state and asks for an action; all download and
    // install work happens in the main process.
    updateGetState: (): Promise<unknown> => ipcRenderer.invoke('rovant:update:get-state'),
    updateCheck:    (): Promise<unknown> => ipcRenderer.invoke('rovant:update:check'),
    updateInstall:  (): Promise<boolean> => ipcRenderer.invoke('rovant:update:install'),
    updateDismiss:  (): Promise<unknown> => ipcRenderer.invoke('rovant:update:dismiss'),
    onUpdateStatus: (cb: (state: unknown) => void) => {
        const listener = (_e: unknown, state: unknown) => cb(state);
        ipcRenderer.on('rovant:update:status', listener);
        // Return an unsubscribe so the UI can detach cleanly if it is torn down.
        return () => ipcRenderer.removeListener('rovant:update:status', listener);
    },
});
