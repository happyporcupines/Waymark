/**
 * ============================================================================
 * MAP.JS - MapLibre GL Map Initialization & Interaction Handlers
 * ============================================================================
 * 
 * This file initializes and configures the MapLibre GL map using OSM tiles,
 * the core geographic component of Waymark. It handles:
 * 
 * - Loading MapLibre GL with OSM raster tiles
 * - Creating GeoJSON sources for entries and stories
 * - Setting up click and long-press event handlers
 * - Managing popup interactions
 * 
 * INTERACTION PATTERNS:
 * 
 * - SINGLE CLICK: Select existing entry (opens popup)
 * - LONG PRESS (800ms): Create new entry at location
 * - POPUP ACTIONS: Read, Edit, Add to same point
 * 
 * The map uses a long-press gesture for entry creation to avoid conflicts
 * with pan/zoom gestures, making it more mobile-friendly.
 */

// ============================================================================
// MAP INITIALIZATION
// ============================================================================

function isElectronRuntime() {
    const ua = navigator.userAgent || '';
    return !!(window.electronAPI || ua.includes('Electron'));
}

function getOsmRasterStyle() {
    return {
        version: 8,
        sources: {
            osm: {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution: '© OpenStreetMap contributors'
            }
        },
        layers: [
            {
                id: 'osm-base',
                type: 'raster',
                source: 'osm'
            }
        ]
    };
}

/**
 * Initializes the MapLibre GL map and sets up all event handlers
 */

function initMap() {
    console.log('[Waymark] Initializing map...');
    
    // Check if Mapbox GL is available
    if (typeof maplibregl === 'undefined') {
        console.error('[Waymark] Mapbox GL library not loaded. Check script tag.');
        return;
    }
    
    const offlineSession = typeof isOfflineAppSession === 'function' && isOfflineAppSession();

    const chosenStyle = getOsmRasterStyle();
    console.log('[Waymark] Using OSM base map style.');
    
    try {
        // CREATE MAP INSTANCE
        const map = new maplibregl.Map({
            container: 'viewDiv',
            style: chosenStyle,
            center: [-106.644568, 35.126358],  // Default: New Mexico
            zoom: 9,
            pitch: 0,
            bearing: 0,
            attributionControl: false
        });
        map.addControl(new maplibregl.AttributionControl({ compact: false }));


        // Store map globally for use in other modules
        mapInstance = map;
        appView = map; // Alias for compatibility
        
        console.log('[Waymark] Map created, waiting for load event...');
        
        // ================================================================
        // GEOJSON SOURCES & LAYERS
        // ================================================================
        
        map.on('load', () => {
            console.log('[Waymark] Map loaded successfully');
            mapLoaded = true;
            
            // Add source for entry point markers
            if (!map.getSource('entries')) {
                map.addSource('entries', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
            }
            
            // Layer for entry markers
            if (!map.getLayer('entries-layer')) {
                map.addLayer({
                    id: 'entries-layer',
                    type: 'circle',
                    source: 'entries',
                    paint: {
                        'circle-radius': 8,
                        'circle-color': '#a43855',
                        'circle-opacity': 0.8,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#fff'
                    }
                });
            }
            
            // Source for story lines
            if (!map.getSource('story-lines')) {
                map.addSource('story-lines', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
            }
            
            // Layer for story polylines
            if (!map.getLayer('story-lines-layer')) {
                map.addLayer({
                    id: 'story-lines-layer',
                    type: 'line',
                    source: 'story-lines',
                    paint: {
                        'line-color': '#a43855',
                        'line-width': 3,
                        'line-opacity': 0.6
                    }
                }, 'entries-layer');
            }
            
            // Make entry markers interactive

                // ── Preview sources/layers (gallery story preview) ──
                if (!map.getSource('preview-line')) {
                    map.addSource('preview-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
                }
                if (!map.getLayer('preview-line-layer')) {
                    map.addLayer({
                        id: 'preview-line-layer',
                        type: 'line',
                        source: 'preview-line',
                        paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 0.8 }
                    }, 'entries-layer');
                }
                if (!map.getSource('preview-points')) {
                    map.addSource('preview-points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
                }
                if (!map.getLayer('preview-points-layer')) {
                    map.addLayer({
                        id: 'preview-points-layer',
                        type: 'circle',
                        source: 'preview-points',
                        paint: {
                            'circle-radius': 9,
                            'circle-color': ['get', 'color'],
                            'circle-opacity': 0.9,
                            'circle-stroke-width': 2,
                            'circle-stroke-color': '#fff'
                        }
                    });
                }

                // Make entry markers interactive
            map.on('click', 'entries-layer', handleEntryClick);
            map.on('mouseenter', 'entries-layer', () => {
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', 'entries-layer', () => {
                map.getCanvas().style.cursor = '';
            });
            
            // Long-press handler for creating new entries
            setupLongPressHandler(map);

            // If data was loaded before map was ready, render it now
            if (typeof updateMapEntryMarkers === 'function') updateMapEntryMarkers();
            if (typeof updateMapStoryLines === 'function') updateMapStoryLines();

            if (typeof getSelectedOfflineExtent === 'function' && typeof applyOfflineExtentToMap === 'function') {
                const selectedExtent = getSelectedOfflineExtent();
                if (selectedExtent && offlineSession) {
                    applyOfflineExtentToMap(selectedExtent);
                }
            }

            // Attempt to center on user's location
            if (!offlineSession && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((position) => {
                    map.flyTo({
                        center: [position.coords.longitude, position.coords.latitude],
                        zoom: 13
                    });
                }, () => {
                    // Geolocation failed, use default center
                });
            }
        });
        
        // Error handler for map
        map.on('error', (e) => {
            console.error('[Waymark] Map error:', e.error);
        });
        
        // ================================================================
        // ENTRY CLICK HANDLER
        // ================================================================
        
        function handleEntryClick(e) {
            const feature = e.features[0];
            if (!feature) return;
            
            const pointKey = feature.properties.pointKey;
            if (!pointStore.has(pointKey)) return;
            
            const pointRecord = pointStore.get(pointKey);
            
            // MULTIPLE ENTRIES: Show selector popup
            if (pointRecord.entries.length > 1) {
                openEntrySelectorPopupMaptiler(pointRecord, e.lngLat);
            } 
            // SINGLE ENTRY: Show entry popup directly
            else {
                const latestEntry = getLatestEntry(pointRecord);
                if (latestEntry) {
                    openEntryPopupMaptiler(pointRecord, latestEntry, e.lngLat);
                }
            }
        }
        
        // ================================================================
        // LONG-PRESS HANDLER
        // ================================================================
        
        function setupLongPressHandler(map) {
        let longPressTimer = null;
        let longPressStartPoint = null;
        let longPressIndicator = null;
        const LONG_PRESS_DURATION = 800;
        const MOVE_THRESHOLD = 10;
        
        const container = map.getCanvasContainer();
        
        container.addEventListener('mousedown', handlePressStart);
        container.addEventListener('touchstart', handlePressStart);
        container.addEventListener('mousemove', handlePressMove);
        container.addEventListener('touchmove', handlePressMove);
        container.addEventListener('mouseup', handlePressEnd);
        container.addEventListener('touchend', handlePressEnd);
        container.addEventListener('touchcancel', handlePressEnd);

        function clearLongPressState() {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            longPressStartPoint = null;

            if (longPressIndicator) {
                longPressIndicator.remove();
                longPressIndicator = null;
            }
        }
        
        function handlePressStart(event) {
            let clientX, clientY;
            if (event.type.startsWith('touch')) {
                if (event.touches.length !== 1) {
                    clearLongPressState();
                    return;
                }

                if (event.touches.length > 0) {
                    clientX = event.touches[0].clientX;
                    clientY = event.touches[0].clientY;
                } else {
                    return;
                }
            } else {
                clientX = event.clientX;
                clientY = event.clientY;
            }
            
            const rect = container.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            
            const lngLat = map.unproject([x, y]);
            
            longPressStartPoint = { x, y, clientX, clientY, lngLat };
            
            // Create visual indicator
            longPressIndicator = document.createElement('div');
            longPressIndicator.className = 'long-press-indicator';
            longPressIndicator.style.left = x + 'px';
            longPressIndicator.style.top = y + 'px';
            container.appendChild(longPressIndicator);
            
            longPressTimer = setTimeout(() => {
                if (longPressIndicator) {
                    longPressIndicator.remove();
                    longPressIndicator = null;
                }
                
                if (isGuestMode && !guestEntryWarningShown) {
                    alert('Guest mode note: diary entries are stored temporarily and will be deleted if you refresh the page.');
                    guestEntryWarningShown = true;
                }
                
                currentClickCoords = {
                    lat: roundCoord(longPressStartPoint.lngLat.lat),
                    lon: roundCoord(longPressStartPoint.lngLat.lng),
                    mapPoint: longPressStartPoint.lngLat
                };
                
                const pointRecord = getOrCreatePointRecord(currentClickCoords);
                openEntryModal('new', pointRecord, null);
                
                longPressTimer = null;
                longPressStartPoint = null;
            }, LONG_PRESS_DURATION);
        }
        
        function handlePressMove(event) {
            if (longPressTimer && longPressStartPoint) {
                let clientX, clientY;
                if (event.type.startsWith('touch')) {
                    if (event.touches.length !== 1) {
                        clearLongPressState();
                        return;
                    }

                    if (event.touches.length > 0) {
                        clientX = event.touches[0].clientX;
                        clientY = event.touches[0].clientY;
                    } else {
                        return;
                    }
                } else {
                    clientX = event.clientX;
                    clientY = event.clientY;
                }
                
                const dx = clientX - longPressStartPoint.clientX;
                const dy = clientY - longPressStartPoint.clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > MOVE_THRESHOLD) {
                    clearLongPressState();
                }
            }
        }
        
        function handlePressEnd(event) {
            clearLongPressState();
        }
    }
    } catch (error) {
        console.error('[Waymark] Failed to initialize map:', error);
    }
}

/**
 * Pans the map to the user's current location.
 */
function centerMapOnUserLocation() {
    const locateBtn = document.getElementById('locateMeBtn');

    const setLocatingState = (isLocating) => {
        if (!locateBtn) return;
        locateBtn.disabled = !!isLocating;
        locateBtn.classList.toggle('is-locating', !!isLocating);
        locateBtn.setAttribute('aria-busy', isLocating ? 'true' : 'false');
    };

    if (!mapInstance || !mapLoaded) {
        alert('Map is still loading. Please try again in a moment.');
        return;
    }

    if (typeof isOfflineAppSession === 'function' && isOfflineAppSession()) {
        alert('GPS is disabled while offline.');
        return;
    }

    if (!navigator.geolocation) {
        alert('Geolocation is not supported on this device.');
        return;
    }

    setLocatingState(true);

    navigator.geolocation.getCurrentPosition((position) => {
        mapInstance.flyTo({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: Math.max(mapInstance.getZoom(), 13),
            duration: 900
        });
        setLocatingState(false);
    }, () => {
        setLocatingState(false);
        alert('Location is not available on this device.');
    }, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
    });
}

/**
 * Opens a popup for a specific entry (Maptiler version)
 */
function openEntryPopupMaptiler(pointRecord, entry, lngLat) {
    if (!mapInstance) return;
    
    const pointStory = findStoryForEntry(entry);
    const template = buildEntryPopupTemplate(entry, pointStory);
    
    let htmlContent = '';
    if (template.title) {
        htmlContent += `<h3 style="margin: 0 0 8px; font-size: 1em;">${escapeHtml(template.title)}</h3>`;
    }
    
    const content = template.content || '';
    if (typeof content === 'string') {
        htmlContent += content;
    }
    
    htmlContent += '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px;">';
    htmlContent += '<button class="popup-action-btn" data-action="read-full-entry" style="flex: 1; padding: 6px 8px; background: #a43855; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9em;">Read</button>';
    htmlContent += '<button class="popup-action-btn" data-action="edit-entry" style="flex: 1; padding: 6px 8px; background: #a43855; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9em;">Edit</button>';
    htmlContent += '<button class="popup-action-btn" data-action="add-same-point" style="flex: 1; padding: 6px 8px; background: #a43855; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9em;">Add</button>';
    htmlContent += '</div>';
    
    const popupEl = document.createElement('div');
    popupEl.className = 'maptiler-entry-popup';
    popupEl.style.maxWidth = '300px';
    popupEl.innerHTML = htmlContent;
    
    const readBtn = popupEl.querySelector('[data-action="read-full-entry"]');
    const editBtn = popupEl.querySelector('[data-action="edit-entry"]');
    const addBtn = popupEl.querySelector('[data-action="add-same-point"]');
    
    let popup = null;
    
    if (readBtn) {
        readBtn.addEventListener('click', () => {
            openDetailPanel(pointRecord, entry);
            if (popup) popup.remove();
        });
    }
    
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            openEntryModal('edit', pointRecord, entry);
            if (popup) popup.remove();
        });
    }
    
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            currentClickCoords = {
                lat: roundCoord(pointRecord.lat),
                lon: roundCoord(pointRecord.lon),
                mapPoint: lngLat
            };
            openEntryModal('new', pointRecord, null);
            if (popup) popup.remove();
        });
    }
    
    popup = new maplibregl.Popup({ offset: 25, closeButton: true })
        .setLngLat(lngLat)
        .setDOMContent(popupEl)
        .addTo(mapInstance);
}

/**
 * Opens a multi-entry selector popup (Maptiler version)
 */
function openEntrySelectorPopupMaptiler(pointRecord, lngLat) {
    if (!mapInstance) return;
    
    let htmlContent = '<div style="max-width: 280px;">';
    htmlContent += '<p style="margin: 0 0 10px; font-weight: bold; font-size: 0.95em;">Choose an entry:</p>';
    
    pointRecord.entries.forEach((entry) => {
        const dateStr = new Date(entry.createdAt).toLocaleDateString();
        htmlContent += `<button class="popup-entry-choice" data-entry-id="${entry.id}" style="display: block; width: 100%; text-align: left; padding: 8px; margin-bottom: 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 0.9em;">`;
        htmlContent += `<strong>${escapeHtml(entry.title)}</strong><br><small style="color: #666;">${dateStr}</small>`;
        htmlContent += '</button>';
    });
    
    htmlContent += '</div>';
    
    const popupEl = document.createElement('div');
    popupEl.innerHTML = htmlContent;
    
    let popup = null;
    
    popupEl.querySelectorAll('.popup-entry-choice').forEach((btn) => {
        btn.addEventListener('click', () => {
            const entryId = parseInt(btn.getAttribute('data-entry-id'), 10);
            const entry = pointRecord.entries.find(e => e.id === entryId);
            if (entry) {
                openEntryPopupMaptiler(pointRecord, entry, lngLat);
            }
            if (popup) popup.remove();
        });
    });
    
    popup = new maplibregl.Popup({ offset: 25, closeButton: true })
        .setLngLat(lngLat)
        .setDOMContent(popupEl)
        .addTo(mapInstance);
}

/**
 * Updates entry markers on the map from the pointStore
 */
function updateMapEntryMarkers() {
    if (!mapInstance || !mapInstance.getSource) return;
    
    const features = [];
    pointStore.forEach((pointRecord) => {
        pointRecord.entries.forEach((entry) => {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [pointRecord.lon, pointRecord.lat]
                },
                properties: {
                    pointKey: pointRecord.pointKey,
                    entryCount: pointRecord.entries.length
                }
            });
        });
    });
    
    const source = mapInstance.getSource('entries');
    if (source) {
        source.setData({
            type: 'FeatureCollection',
            features: features
        });
    }
}

/**
 * Updates story lines on the map from the stories array
 */
function updateMapStoryLines() {
    if (!mapInstance || !mapInstance.getSource) return;
    
    const features = [];
    
    stories.forEach((story) => {
        const coords = [];
        story.entryIds.forEach((entryId) => {
            pointStore.forEach((pointRecord) => {
                const entry = pointRecord.entries.find(e => e.id === entryId);
                if (entry) {
                    coords.push([pointRecord.lon, pointRecord.lat]);
                }
            });
        });
        
        if (coords.length > 1) {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coords
                },
                properties: {
                    storyId: story.id,
                    color: story.lineColor
                }
            });
        }
    });
    
    const source = mapInstance.getSource('story-lines');
    if (source) {
        source.setData({
            type: 'FeatureCollection',
            features: features
        });
    }
}

    // ============================================================
    // GALLERY STORY PREVIEW
    // ============================================================

    /**
     * Renders a gallery story on the map as a preview overlay.
     * @param {Array<{entry_id,lat,lon,title,line_color,story_title}>} entryRows
     */
    function showStoryPreview(entryRows) {
        if (!mapInstance) return;
        const color = (entryRows[0] && entryRows[0].line_color) || '#a43855';

        // Hide normal user layers so only preview story points are visible.
        if (mapInstance.getLayer('entries-layer')) {
            mapInstance.setLayoutProperty('entries-layer', 'visibility', 'none');
        }
        if (mapInstance.getLayer('story-lines-layer')) {
            mapInstance.setLayoutProperty('story-lines-layer', 'visibility', 'none');
        }

        const pointFeatures = entryRows.map(r => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
            properties: { title: r.title || '', color }
        }));

        const lineFeature = entryRows.length >= 2 ? [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: entryRows.map(r => [r.lon, r.lat]) },
            properties: { color }
        }] : [];

        const pSrc = mapInstance.getSource('preview-points');
        if (pSrc) pSrc.setData({ type: 'FeatureCollection', features: pointFeatures });
        const lSrc = mapInstance.getSource('preview-line');
        if (lSrc) lSrc.setData({ type: 'FeatureCollection', features: lineFeature });

        // Fit map to preview bounds
        if (entryRows.length > 0) {
            const lngs = entryRows.map(r => r.lon);
            const lats = entryRows.map(r => r.lat);
            mapInstance.fitBounds(
                [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
                { padding: 80, maxZoom: 13, duration: 800 }
            );
        }
    }

    function clearStoryPreview() {
        if (!mapInstance) return;
        const pSrc = mapInstance.getSource('preview-points');
        if (pSrc) pSrc.setData({ type: 'FeatureCollection', features: [] });
        const lSrc = mapInstance.getSource('preview-line');
        if (lSrc) lSrc.setData({ type: 'FeatureCollection', features: [] });

        // Restore the normal map layers.
        if (mapInstance.getLayer('entries-layer')) {
            mapInstance.setLayoutProperty('entries-layer', 'visibility', 'visible');
        }
        if (mapInstance.getLayer('story-lines-layer')) {
            mapInstance.setLayoutProperty('story-lines-layer', 'visibility', 'visible');
        }
    }

// ============================================================================
// LOCATION SEARCH (Nominatim / OSM geocoding)
// ============================================================================

function initLocationSearch() {
    const container = document.getElementById('locationSearch');
    const input = document.getElementById('locationSearchInput');
    const clearBtn = document.getElementById('locationSearchClear');
    const resultsList = document.getElementById('locationSearchResults');

    if (!container || !input || !resultsList) return;

    let debounceTimer = null;
    let activeIndex = -1;
    let lastResults = [];

    function closeResults() {
        resultsList.hidden = true;
        resultsList.innerHTML = '';
        activeIndex = -1;
        lastResults = [];
    }

    function renderResults(results) {
        resultsList.innerHTML = '';
        activeIndex = -1;
        lastResults = results;

        if (!results.length) {
            resultsList.innerHTML = '<li class="location-search-empty">No results found</li>';
            resultsList.hidden = false;
            return;
        }

        results.forEach((item) => {
            const li = document.createElement('li');
            li.textContent = item.display_name;
            li.setAttribute('role', 'option');
            li.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectResult(item);
            });
            resultsList.appendChild(li);
        });

        resultsList.hidden = false;
    }

    function selectResult(item) {
        input.value = item.display_name;
        clearBtn.hidden = false;
        closeResults();

        if (!mapInstance) return;
        const lon = parseFloat(item.lon);
        const lat = parseFloat(item.lat);
        if (!isFinite(lon) || !isFinite(lat)) return;

        if (item.boundingbox && item.boundingbox.length === 4) {
            const [minLat, maxLat, minLon, maxLon] = item.boundingbox.map(parseFloat);
            mapInstance.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 60, maxZoom: 16, duration: 900 });
        } else {
            mapInstance.flyTo({ center: [lon, lat], zoom: 13, duration: 900 });
        }
    }

    function setActiveItem(index) {
        const items = resultsList.querySelectorAll('li[role="option"]');
        items.forEach((el, i) => el.setAttribute('aria-selected', i === index ? 'true' : 'false'));
        activeIndex = index;
    }

    async function doSearch(q) {
        q = q.trim();
        if (!q) { closeResults(); return; }

        resultsList.innerHTML = '<li class="location-search-loading">Searching...</li>';
        resultsList.hidden = false;

        try {
            const url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=5&addressdetails=0&email=happyporcupines%40users.noreply.github.com';
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('Nominatim error ' + resp.status);
            const data = await resp.json();
            renderResults(data);
        } catch (err) {
            resultsList.innerHTML = '<li class="location-search-empty">Search unavailable - check your connection</li>';
            resultsList.hidden = false;
            console.warn('[Waymark] Geocoding failed:', err);
        }
    }

    input.addEventListener('input', () => {
        const val = input.value;
        clearBtn.hidden = !val;
        clearTimeout(debounceTimer);
        if (!val.trim()) { closeResults(); return; }
        debounceTimer = setTimeout(() => doSearch(val), 450);
    });

    input.addEventListener('keydown', (e) => {
        const items = resultsList.querySelectorAll('li[role="option"]');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = Math.min(activeIndex + 1, items.length - 1);
            setActiveItem(next);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = Math.max(activeIndex - 1, 0);
            setActiveItem(prev);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && lastResults[activeIndex]) {
                selectResult(lastResults[activeIndex]);
            } else if (lastResults.length) {
                selectResult(lastResults[0]);
            } else {
                doSearch(input.value);
            }
        } else if (e.key === 'Escape') {
            closeResults();
            input.blur();
        }
    });

    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.hidden = true;
        closeResults();
        input.focus();
    });

    document.addEventListener('mousedown', (e) => {
        if (!container.contains(e.target)) closeResults();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLocationSearch);
} else {
    initLocationSearch();
}
