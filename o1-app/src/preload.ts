import { contextBridge, ipcRenderer } from 'electron';

/**
 * Secure IPC bridge — exposes only specific channels to the renderer.
 * The frontend can call window.o1.detectToolchain() etc.
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
});
