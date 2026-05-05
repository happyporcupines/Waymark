/**
 * ============================================================================
 * OFFLINE.JS - Offline Map Extent Management and Reconnect Sync Flow
 * ============================================================================
 */

const OFFLINE_EXTENT_LIMIT = 3;
const OFFLINE_MAX_LNG_SPAN = 1.8;
const OFFLINE_MAX_LAT_SPAN = 1.8;
const OFFLINE_TILE_CACHE = 'waymark-offline-tiles-v1';
const OFFLINE_TILE_ZOOMS = [8, 9, 10, 11, 12];
const OFFLINE_TILE_MAX_COUNT = 700;

function getOfflineStorageUserKey() {
    if (authenticatedUser && authenticatedUser.id) {
        return authenticatedUser.id;
    }
    return 'guest';
}

function getOfflineExtentsStorageKey() {
    return `waymark-offline-extents:${getOfflineStorageUserKey()}`;
}

function getOfflineSelectedStorageKey() {
    return `waymark-offline-selected:${getOfflineStorageUserKey()}`;
}

function getOfflineDirtyStorageKey() {
    return `waymark-offline-dirty:${getOfflineStorageUserKey()}`;
}

function isOfflineAppSession() {
    return !!(isOfflineFeatureRuntimeAllowed() && navigator.onLine === false);
}

function isOfflineModeActive() {
    return isOfflineAppSession();
}

function readOfflineExtents() {
    const raw = localStorage.getItem(getOfflineExtentsStorageKey());
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function writeOfflineExtents(extents) {
    localStorage.setItem(getOfflineExtentsStorageKey(), JSON.stringify(extents));
}

function getSelectedOfflineExtentId() {
    return localStorage.getItem(getOfflineSelectedStorageKey()) || '';
}

function setSelectedOfflineExtentId(extentId) {
    if (!extentId) {
        localStorage.removeItem(getOfflineSelectedStorageKey());
        return;
    }
    localStorage.setItem(getOfflineSelectedStorageKey(), extentId);
}

function getSelectedOfflineExtent() {
    const selectedId = getSelectedOfflineExtentId();
    if (!selectedId) {
        return null;
    }
    const extents = readOfflineExtents();
    return extents.find((item) => item.id === selectedId) || null;
}

function markOfflineProjectDirty() {
    localStorage.setItem(getOfflineDirtyStorageKey(), '1');
}

function clearOfflineProjectDirtyFlag() {
    localStorage.removeItem(getOfflineDirtyStorageKey());
}

function hasOfflineProjectDirtyFlag() {
    return localStorage.getItem(getOfflineDirtyStorageKey()) === '1';
}

function formatExtentLabel(extent) {
    const createdAt = extent && extent.createdAtMs ? new Date(extent.createdAtMs).toLocaleDateString() : '';
    const name = extent && extent.name ? extent.name : 'Saved extent';
    return createdAt ? `${name} (${createdAt})` : name;
}

function getMapBoundsSnapshot() {
    if (!mapInstance || typeof mapInstance.getBounds !== 'function') {
        return null;
    }
    const bounds = mapInstance.getBounds();
    if (!bounds) {
        return null;
    }
    return {
        west: Number(bounds.getWest()),
        south: Number(bounds.getSouth()),
        east: Number(bounds.getEast()),
        north: Number(bounds.getNorth()),
        centerLon: Number((bounds.getWest() + bounds.getEast()) / 2),
        centerLat: Number((bounds.getSouth() + bounds.getNorth()) / 2),
        zoom: Number(mapInstance.getZoom())
    };
}

function getExtentSpans(extentBounds) {
    return {
        lngSpan: Math.abs(Number(extentBounds.east) - Number(extentBounds.west)),
        latSpan: Math.abs(Number(extentBounds.north) - Number(extentBounds.south))
    };
}

function validateExtentSize(extentBounds) {
    const spans = getExtentSpans(extentBounds);
    return spans.lngSpan <= OFFLINE_MAX_LNG_SPAN && spans.latSpan <= OFFLINE_MAX_LAT_SPAN;
}

function lngLatToTileXY(lng, lat, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lng + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
}

function clampTile(v, z) {
    const max = Math.pow(2, z) - 1;
    return Math.max(0, Math.min(max, v));
}

function buildOfflineTileUrls(extentBounds) {
    const urls = [];
    for (let i = 0; i < OFFLINE_TILE_ZOOMS.length; i += 1) {
        const z = OFFLINE_TILE_ZOOMS[i];
        const sw = lngLatToTileXY(extentBounds.west, extentBounds.south, z);
        const ne = lngLatToTileXY(extentBounds.east, extentBounds.north, z);

        const minX = clampTile(Math.min(sw.x, ne.x), z);
        const maxX = clampTile(Math.max(sw.x, ne.x), z);
        const minY = clampTile(Math.min(sw.y, ne.y), z);
        const maxY = clampTile(Math.max(sw.y, ne.y), z);

        for (let x = minX; x <= maxX; x += 1) {
            for (let y = minY; y <= maxY; y += 1) {
                urls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
                if (urls.length >= OFFLINE_TILE_MAX_COUNT) {
                    return urls;
                }
            }
        }
    }
    return urls;
}

async function prefetchExtentTiles(extentBounds, statusEl) {
    if (!('caches' in window) || !navigator.serviceWorker) {
        return;
    }

    const urls = buildOfflineTileUrls(extentBounds);
    if (!urls.length) {
        return;
    }

    const cache = await caches.open(OFFLINE_TILE_CACHE);
    for (let i = 0; i < urls.length; i += 1) {
        const url = urls[i];
        if (statusEl) {
            statusEl.textContent = `Caching map tiles ${i + 1}/${urls.length}...`;
        }
        try {
            const existing = await cache.match(url);
            if (existing) {
                continue;
            }
            const response = await fetch(url, { mode: 'no-cors' });
            if (response) {
                await cache.put(url, response.clone());
            }
        } catch (error) {
            // Ignore individual tile failures.
        }
    }
}

function renderOfflineMapsList() {
    const listEl = document.getElementById('offlineMapsList');
    if (!listEl) {
        return;
    }

    const extents = readOfflineExtents();
    listEl.innerHTML = '';

    if (!extents.length) {
        listEl.innerHTML = '<p style="margin: 0; color: #777;">No saved offline extents yet.</p>';
        return;
    }

    extents.forEach((extent) => {
        const row = document.createElement('div');
        row.className = 'offline-map-row';

        const info = document.createElement('div');
        info.className = 'offline-map-row-info';
        const spans = getExtentSpans(extent.bounds);
        info.innerHTML = `<strong>${escapeHtml(formatExtentLabel(extent))}</strong><small>${spans.lngSpan.toFixed(2)}° x ${spans.latSpan.toFixed(2)}°</small>`;

        const actions = document.createElement('div');
        actions.className = 'offline-map-row-actions';
        actions.innerHTML = `
            <button type="button" class="story-btn-small" data-offline-action="use" data-id="${extent.id}">Use</button>
            <button type="button" class="story-btn-small" data-offline-action="delete" data-id="${extent.id}">Delete</button>
        `;

        row.appendChild(info);
        row.appendChild(actions);
        listEl.appendChild(row);
    });
}

function renderOfflineChooserList() {
    const listEl = document.getElementById('offlineChooserList');
    const statusEl = document.getElementById('offlineChooserStatus');
    if (!listEl) {
        return;
    }

    const extents = readOfflineExtents();
    listEl.innerHTML = '';

    if (!extents.length) {
        listEl.innerHTML = '<p style="margin: 0; color: #777;">No saved maps are available offline yet.</p>';
        if (statusEl) {
            statusEl.textContent = 'Go online and save an extent from Offline Map first.';
        }
        return;
    }

    if (statusEl) {
        statusEl.textContent = '';
    }

    extents.forEach((extent) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'offline-chooser-item';
        btn.setAttribute('data-id', extent.id);
        btn.innerHTML = `<strong>${escapeHtml(formatExtentLabel(extent))}</strong><small>Tap to open this saved map</small>`;
        listEl.appendChild(btn);
    });
}

function openOfflineMapsManager() {
    if (!isOfflineFeatureRuntimeAllowed()) {
        alert(getOfflineFeatureUnavailableMessage());
        return;
    }
    const modal = document.getElementById('offlineMapsModal');
    if (!modal) {
        return;
    }
    const statusEl = document.getElementById('offlineMapsStatus');
    if (statusEl) {
        statusEl.textContent = '';
    }
    renderOfflineMapsList();
    modal.style.display = 'flex';
}

function closeOfflineMapsManager() {
    const modal = document.getElementById('offlineMapsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function openOfflineChooserModal() {
    if (!isOfflineAppSession()) {
        return;
    }
    const modal = document.getElementById('offlineChooserModal');
    if (!modal) {
        return;
    }
    renderOfflineChooserList();
    modal.style.display = 'flex';
}

function closeOfflineChooserModal() {
    const modal = document.getElementById('offlineChooserModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function applyOfflineExtentToMap(extent) {
    if (!extent || !extent.bounds || !mapInstance) {
        return;
    }

    const bounds = [
        [extent.bounds.west, extent.bounds.south],
        [extent.bounds.east, extent.bounds.north]
    ];

    try {
        mapInstance.fitBounds(bounds, { padding: 30, duration: 0, maxZoom: 14 });
        mapInstance.setMaxBounds(bounds);
        if (typeof mapInstance.setMinZoom === 'function') {
            mapInstance.setMinZoom(Math.max(1, Number(extent.zoom || 10) - 3));
        }
    } catch (error) {
        console.warn('[Waymark] Could not apply offline extent bounds:', error);
    }
}

function clearOfflineMapBounds() {
    if (!mapInstance) {
        return;
    }
    try {
        mapInstance.setMaxBounds(null);
        if (typeof mapInstance.setMinZoom === 'function') {
            mapInstance.setMinZoom(null);
        }
    } catch (error) {
        // Ignore reset failures.
    }
}

function useOfflineExtentById(extentId) {
    const extents = readOfflineExtents();
    const extent = extents.find((item) => item.id === extentId);
    if (!extent) {
        return;
    }
    setSelectedOfflineExtentId(extentId);
    applyOfflineExtentToMap(extent);
    closeOfflineChooserModal();
    closeOfflineMapsManager();
}

async function saveCurrentMapExtentForOffline() {
    const statusEl = document.getElementById('offlineMapsStatus');

    if (!isOfflineFeatureRuntimeAllowed()) {
        if (statusEl) {
            statusEl.textContent = getOfflineFeatureUnavailableMessage();
        }
        return;
    }

    if (!mapInstance || !mapLoaded) {
        if (statusEl) {
            statusEl.textContent = 'Map is still loading. Try again in a moment.';
        }
        return;
    }

    const bounds = getMapBoundsSnapshot();
    if (!bounds) {
        if (statusEl) {
            statusEl.textContent = 'Could not read map bounds.';
        }
        return;
    }

    if (!validateExtentSize(bounds)) {
        if (statusEl) {
            statusEl.textContent = 'Selected extent is too large. Zoom in and try a smaller area.';
        }
        return;
    }

    const extents = readOfflineExtents();
    if (extents.length >= OFFLINE_EXTENT_LIMIT) {
        if (statusEl) {
            statusEl.textContent = 'Maximum reached. Delete one saved map before adding another.';
        }
        return;
    }

    const newExtent = {
        id: `extent-${Date.now()}`,
        name: `Saved Map ${extents.length + 1}`,
        createdAtMs: Date.now(),
        bounds: {
            west: bounds.west,
            south: bounds.south,
            east: bounds.east,
            north: bounds.north
        },
        centerLat: bounds.centerLat,
        centerLon: bounds.centerLon,
        zoom: bounds.zoom
    };

    if (statusEl) {
        statusEl.textContent = 'Saving extent metadata...';
    }

    await prefetchExtentTiles(newExtent.bounds, statusEl);

    extents.push(newExtent);
    writeOfflineExtents(extents);
    setSelectedOfflineExtentId(newExtent.id);

    if (statusEl) {
        statusEl.textContent = 'Offline extent saved.';
    }

    renderOfflineMapsList();
}

function deleteOfflineExtent(extentId) {
    let extents = readOfflineExtents();
    extents = extents.filter((item) => item.id !== extentId);
    writeOfflineExtents(extents);

    if (getSelectedOfflineExtentId() === extentId) {
        setSelectedOfflineExtentId('');
    }

    renderOfflineMapsList();
    renderOfflineChooserList();
}

function applyOfflineUiState() {
    const isOffline = isOfflineAppSession();

    document.body.classList.toggle('offline-session', isOffline);

    const galleryBtn = document.getElementById('galleryBtn');
    const locateBtn = document.getElementById('locateMeBtn');
    const featureHint = document.getElementById('runtimeFeatureHint');

    if (galleryBtn) {
        galleryBtn.style.display = isOffline ? 'none' : 'inline-block';
    }

    if (locateBtn) {
        locateBtn.style.display = isOffline ? 'none' : 'block';
        locateBtn.disabled = isOffline;
    }

    if (featureHint) {
        if (isOffline) {
            featureHint.style.display = 'block';
            featureHint.textContent = 'Offline mode: gallery, sharing, and GPS are disabled.';
        } else if (isOfflineFeatureRuntimeAllowed()) {
            featureHint.style.display = 'block';
            featureHint.textContent = 'Offline maps are available on this installed app.';
        } else {
            featureHint.style.display = 'none';
            featureHint.textContent = '';
        }
    }
}

function showOfflineSyncBlocker(statusText, allowDismiss) {
    const blocker = document.getElementById('offlineSyncBlocker');
    const statusEl = document.getElementById('offlineSyncStatus');
    const dismissBtn = document.getElementById('offlineSyncDismissBtn');
    if (!blocker) return;
    blocker.style.display = 'flex';
    if (statusEl) statusEl.textContent = statusText || 'Please wait while your offline entries and stories are synced.';
    if (dismissBtn) dismissBtn.style.display = allowDismiss ? 'inline-block' : 'none';
}

function hideOfflineSyncBlocker() {
    const blocker = document.getElementById('offlineSyncBlocker');
    if (blocker) {
        blocker.style.display = 'none';
    }
}

async function runReconnectSyncFlow() {
    if (!isOfflineFeatureRuntimeAllowed()) {
        return;
    }
    // Use canReachSupabase() if available, otherwise fall back to navigator.onLine.
    // This handles Electron where navigator.onLine is always true.
    const online = typeof canReachSupabase === 'function'
        ? await canReachSupabase()
        : navigator.onLine;
    if (!online) {
        return;
    }
    if (!hasOfflineProjectDirtyFlag()) {
        hideOfflineSyncBlocker();
        return;
    }

    if (!authenticatedUser || isGuestMode) {
        clearOfflineProjectDirtyFlag();
        hideOfflineSyncBlocker();
        return;
    }

    showOfflineSyncBlocker('Reconnected. Syncing offline entries and stories...');

    try {
        let synced = false;
        if (typeof flushSupabaseSyncNow === 'function') {
            synced = await flushSupabaseSyncNow();
        } else if (typeof queueSupabaseSync === 'function') {
            queueSupabaseSync();
            synced = true;
        }
        if (!synced) {
            // Sync guards not yet met (e.g. still hydrating). Hide the blocker
            // quietly — the 15-second poll will retry when ready.
            hideOfflineSyncBlocker();
        }
        // If synced === true, the waymark-sync-state event hides the blocker on success.
    } catch (error) {
        showOfflineSyncBlocker('Sync failed. Retrying in background...');
    }
}

function handleSyncStateEvent(evt) {
    const detail = evt && evt.detail ? evt.detail : {};
    const state = detail.state || 'idle';
    const success = detail.success !== false;

    // Always resolve success transitions, even if the dirty flag has already
    // been cleared by the sync layer before this event handler runs.
    if (state === 'idle' && success) {
        if (hasOfflineProjectDirtyFlag()) {
            clearOfflineProjectDirtyFlag();
        }
        hideOfflineSyncBlocker();
        return;
    }

    if (!hasOfflineProjectDirtyFlag()) {
        return;
    }

    if (state === 'running') {
        showOfflineSyncBlocker('Syncing offline entries and stories...');
        return;
    }

    if (state === 'idle' && !success) {
        showOfflineSyncBlocker('Sync failed. Will retry automatically. You can dismiss and keep working.', true);
    }
}

function handleConnectivityChange() {
    applyOfflineUiState();

    if (isOfflineAppSession()) {
        const selected = getSelectedOfflineExtent();
        if (!selected) {
            openOfflineChooserModal();
        } else {
            applyOfflineExtentToMap(selected);
        }
        return;
    }

    closeOfflineChooserModal();
    clearOfflineMapBounds();

    if (navigator.onLine) {
        runReconnectSyncFlow();
    }
}

function initializeOfflineMapFeature() {
    const closeBtn = document.getElementById('closeOfflineMapsBtn');
    const saveBtn = document.getElementById('saveOfflineExtentBtn');
    const listEl = document.getElementById('offlineMapsList');
    const chooserListEl = document.getElementById('offlineChooserList');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeOfflineMapsManager);
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveCurrentMapExtentForOffline();
        });
    }

    if (listEl) {
        listEl.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }
            const btn = target.closest('[data-offline-action]');
            if (!btn) {
                return;
            }
            const action = btn.getAttribute('data-offline-action');
            const id = btn.getAttribute('data-id');
            if (!id) {
                return;
            }
            if (action === 'delete') {
                deleteOfflineExtent(id);
                return;
            }
            if (action === 'use') {
                useOfflineExtentById(id);
            }
        });
    }

    if (chooserListEl) {
        chooserListEl.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }
            const chooserBtn = target.closest('.offline-chooser-item');
            if (!chooserBtn) {
                return;
            }
            const id = chooserBtn.getAttribute('data-id');
            if (!id) {
                return;
            }
            useOfflineExtentById(id);
        });
    }

    const chooserCancelBtn = document.getElementById('offlineChooserCancelBtn');
    if (chooserCancelBtn) {
        chooserCancelBtn.addEventListener('click', () => {
            setSelectedOfflineExtentId('');
            closeOfflineChooserModal();
            clearOfflineMapBounds();
        });
    }

    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    window.addEventListener('waymark-sync-state', handleSyncStateEvent);

    applyOfflineUiState();
    handleConnectivityChange();

    // On runtimes where navigator.onLine is always true (Electron, some TWAs)
    // the 'online' event never fires when internet is restored. Poll for
    // reachability every 15 s whenever there are unsynced offline changes.
    setInterval(async () => {
        if (!hasOfflineProjectDirtyFlag()) return;
        if (isOfflineAppSession()) return;
        if (typeof canReachSupabase !== 'function') return;
        const reachable = await canReachSupabase();
        if (reachable) {
            runReconnectSyncFlow();
        }
    }, 15000);
}

window.addEventListener('load', () => {
    initializeOfflineMapFeature();
    const dismissBtn = document.getElementById('offlineSyncDismissBtn');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            hideOfflineSyncBlocker();
        });
    }
});
