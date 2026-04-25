function isRunningInElectron() {
    const ua = navigator.userAgent || '';
    return !!(window.electronAPI || ua.includes('Electron'));
}

function isStandaloneInstalledMode() {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
        return true;
    }
    return window.navigator.standalone === true;
}

async function isLikelyPlayStoreInstall() {
    if (typeof navigator.getInstalledRelatedApps !== 'function') {
        return false;
    }
    try {
        const relatedApps = await navigator.getInstalledRelatedApps();
        return relatedApps.some((app) => app && app.platform === 'play');
    } catch (error) {
        return false;
    }
}

async function detectRuntimeCapabilities() {
    const electron = isRunningInElectron();
    const standalone = isStandaloneInstalledMode();
    const playInstalled = await isLikelyPlayStoreInstall();

    const twaLike = !electron && standalone && playInstalled;
    const offlineExtentEnabled = electron || twaLike;

    return {
        platform: electron ? 'electron' : (twaLike ? 'twa' : (standalone ? 'pwa' : 'web')),
        isInstalled: standalone || electron,
        isElectron: electron,
        isTwaLike: twaLike,
        supportsOfflineExtentSave: offlineExtentEnabled,
        supportsOfflineTileDownload: offlineExtentEnabled,
        supportsNativePdfExport: electron,
        supportsPdfExport: true
    };
}

function applyRuntimeCapabilities(caps) {
    runtimeCapabilities = caps;
    window.WAYMARK_RUNTIME_CAPS = caps;
    if (typeof updateRuntimeCapabilityUI === 'function') {
        updateRuntimeCapabilityUI(caps);
    }
}

window.addEventListener('load', async () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then((registration) => {
            registration.update().catch(() => {
                // Ignore update-check failures; normal registration still works.
            });
        }).catch((error) => {
            console.error('Service worker registration failed:', error);
        });
    }

    const caps = await detectRuntimeCapabilities();
    applyRuntimeCapabilities(caps);
    console.log('[Waymark] Runtime capabilities:', caps);
});
