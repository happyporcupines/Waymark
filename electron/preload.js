/**
 * Electron preload script — runs in a privileged context before the renderer.
 * Uses contextBridge to safely expose a whitelist of Node/Electron capabilities
 * to the renderer (window.electronAPI). Nothing else from Node is accessible.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Identity — pwa.js checks for window.electronAPI to gate features
    isElectron: true,
    platform: process.platform,         // 'win32' | 'darwin' | 'linux'

    // App info
    getVersion: () => ipcRenderer.invoke('get-app-version'),

    // Open a URL in the system browser
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // PDF export — triggers native print-to-PDF with a save dialog
    exportPdf: (options) => ipcRenderer.invoke('export-pdf', options),

    // Offline tile storage — used by the offline extent manager
    tiles: {
        getDir: () => ipcRenderer.invoke('tiles-get-dir'),
        write: (args) => ipcRenderer.invoke('tiles-write', args),
        read: (args) => ipcRenderer.invoke('tiles-read', args),
        deleteExtent: (extentId) => ipcRenderer.invoke('tiles-delete-extent', extentId),
        listExtents: () => ipcRenderer.invoke('tiles-list-extents'),
        getSize: (extentId) => ipcRenderer.invoke('tiles-get-size', extentId)
    }
});
