/**
 * ============================================================================
 * MAP.JS - Maptiler (Mapbox GL) Map Initialization & Interaction Handlers
 * ============================================================================
 * 
 * This file initializes and configures the Maptiler map, which is
 * the core geographic component of Waymark. It handles:
 * 
 * - Loading Maptiler (Mapbox GL) with dataviz style
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

/**
 * Initializes the Maptiler map and sets up all event handlers
 * 
 * Creates a Mapbox GL map instance using Maptiler's dataviz style,
 * adds GeoJSON sources for entries and stories, and sets up interaction handlers.
 */
function initMap() {
    console.log('[Waymark] Initializing map...');
    
    // Check if Mapbox GL is available
    if (typeof maplibregl === 'undefined') {
        console.error('[Waymark] Mapbox GL library not loaded. Check script tag.');
        return;
    }
    
    const cfg = window.WAYMARK_CONFIG || {};
    const maptilerKey = cfg.MAPTILER_KEY || '';
    
    if (!maptilerKey) {
        console.error('[Waymark] Maptiler key not configured. Check config.js');
        return;
    }
    
    console.log('[Waymark] Creating map with Maptiler key:', maptilerKey.substring(0, 10) + '...');
    
    try {
        // CREATE MAP INSTANCE with Maptiler dataviz style
        const map = new maplibregl.Map({
            container: 'viewDiv',
            style: `https://api.maptiler.com/maps/dataviz/style.json?key=${maptilerKey}`,
            center: [-106.644568, 35.126358],  // Default: New Mexico
            zoom: 9,
            pitch: 0,
            bearing: 0
        });

        // Store map globally for use in other modules
        mapInstance = map;
        appView = map; // Alias for compatibility
        
        console.log('[Waymark] Map created, waiting for load event...');
        
        // ================================================================
        // GEOJSON SOURCES & LAYERS
        // ================================================================
        
        map.on('load', () => {
            console.log('[Waymark] Map loaded successfully');
            
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
            map.on('click', 'entries-layer', handleEntryClick);
            map.on('mouseenter', 'entries-layer', () => {
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', 'entries-layer', () => {
                map.getCanvas().style.cursor = '';
            });
            
            // Long-press handler for creating new entries
            setupLongPressHandler(map);
            
            // Attempt to center on user's location
            if (navigator.geolocation) {
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
        
        function handlePressStart(event) {
            let clientX, clientY;
            if (event.type.startsWith('touch')) {
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
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                    longPressStartPoint = null;
                    
                    if (longPressIndicator) {
                        longPressIndicator.remove();
                        longPressIndicator = null;
                    }
                }
            }
        }
        
        function handlePressEnd(event) {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
                longPressStartPoint = null;
            }
            if (longPressIndicator) {
                longPressIndicator.remove();
                longPressIndicator = null;
            }
        }
    }
    } catch (error) {
        console.error('[Waymark] Failed to initialize map:', error);
    }
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
