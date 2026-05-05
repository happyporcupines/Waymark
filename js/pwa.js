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

    // Emulator/debug Android wrapper runs often do not expose
    // getInstalledRelatedApps() data, so rely on wrapper launch signals too.
    const ua = navigator.userAgent || '';
    const androidUa = /Android/i.test(ua);
    const webViewUa = /\bwv\b|Version\/\d+\.\d+/i.test(ua);
    const androidAppReferrer = typeof document !== 'undefined'
        && typeof document.referrer === 'string'
        && document.referrer.startsWith('android-app://');
    // Wrapper sessions can appear either as WebView fallback (wv/Version/x)
    // or as browser-hosted custom tab with android-app referrer.
    // For installed Android app runs we allow offline-map UI while online so
    // users can pre-save extents before losing connectivity.
    const androidWrapperLike = androidAppReferrer || (androidUa && (webViewUa || standalone));

    const twaLike = !electron && (playInstalled || androidWrapperLike || (standalone && androidUa));
    const offlineExtentEnabled = electron || twaLike;
    const offlineRuntimeAllowed = electron || twaLike;

    return {
        platform: electron ? 'electron' : (twaLike ? 'twa' : (standalone ? 'pwa' : 'web')),
        isInstalled: standalone || electron,
        isElectron: electron,
        isTwaLike: twaLike,
        supportsOfflineExtentSave: offlineRuntimeAllowed && offlineExtentEnabled,
        supportsOfflineTileDownload: offlineRuntimeAllowed && offlineExtentEnabled,
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
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((registration) => {
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
