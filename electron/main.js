const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================================================
// WINDOW MANAGEMENT
// ============================================================================

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 375,
        minHeight: 600,
        title: 'Waymark',
        // Icon is set per-platform by electron-builder; this is for dev mode
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            // Allow loading local files and CDN resources
            webSecurity: true
        }
    });

    // Load the app from the local index.html
    mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

    // Open DevTools only in dev mode
    if (process.env.WAYMARK_DEV) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        // On macOS re-create window when dock icon is clicked with no open windows
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    // On macOS apps stay in dock unless explicitly quit
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ============================================================================
// IPC HANDLERS — exposed to renderer via preload.js
// ============================================================================

// App metadata
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-platform', () => process.platform);

// Open external links in default browser instead of Electron window
ipcMain.handle('open-external', async (_event, url) => {
    await shell.openExternal(url);
});

// ── PDF Export ──────────────────────────────────────────────────────────────
// Uses Electron's built-in print-to-PDF capability for native quality output.
ipcMain.handle('export-pdf', async (_event, options = {}) => {
    if (!mainWindow) return { error: 'No window' };

    const defaultPath = path.join(
        app.getPath('documents'),
        `Waymark-export-${Date.now()}.pdf`
    );

    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Waymark PDF',
        defaultPath,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) return { canceled: true };

    try {
        const pdfData = await mainWindow.webContents.printToPDF({
            printBackground: true,
            pageSize: options.pageSize || 'A4',
            landscape: options.landscape || false,
            margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
        });
        fs.writeFileSync(filePath, pdfData);
        shell.openPath(filePath);
        return { success: true, filePath };
    } catch (err) {
        console.error('[Waymark Electron] PDF export error:', err);
        return { error: err.message };
    }
});

// ── Offline Tile Storage ─────────────────────────────────────────────────────
// Stores downloaded map tiles in the user's data directory.
const TILES_DIR = path.join(app.getPath('userData'), 'tiles');

ipcMain.handle('tiles-get-dir', () => TILES_DIR);

ipcMain.handle('tiles-write', async (_event, { extentId, filename, buffer }) => {
    const extentDir = path.join(TILES_DIR, extentId);
    fs.mkdirSync(extentDir, { recursive: true });
    fs.writeFileSync(path.join(extentDir, filename), Buffer.from(buffer));
    return { success: true };
});

ipcMain.handle('tiles-read', async (_event, { extentId, filename }) => {
    const filePath = path.join(TILES_DIR, extentId, filename);
    if (!fs.existsSync(filePath)) return { data: null };
    const data = fs.readFileSync(filePath);
    return { data: Array.from(data) };
});

ipcMain.handle('tiles-delete-extent', async (_event, extentId) => {
    const extentDir = path.join(TILES_DIR, extentId);
    if (fs.existsSync(extentDir)) {
        fs.rmSync(extentDir, { recursive: true, force: true });
    }
    return { success: true };
});

ipcMain.handle('tiles-list-extents', async () => {
    if (!fs.existsSync(TILES_DIR)) return { extents: [] };
    const entries = fs.readdirSync(TILES_DIR, { withFileTypes: true });
    const extents = entries.filter(e => e.isDirectory()).map(e => e.name);
    return { extents };
});

ipcMain.handle('tiles-get-size', async (_event, extentId) => {
    const extentDir = path.join(TILES_DIR, extentId);
    if (!fs.existsSync(extentDir)) return { bytes: 0 };
    let total = 0;
    const files = fs.readdirSync(extentDir);
    for (const f of files) {
        const stat = fs.statSync(path.join(extentDir, f));
        total += stat.size;
    }
    return { bytes: total };
});
