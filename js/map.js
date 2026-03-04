/**
 * ============================================================
 * MAP INITIALIZATION & INTERACTIONS
 * ============================================================
 * 
 * This module initializes the ArcGIS map and handles all
 * map-related interactions:
 * - Map setup and widget configuration
 * - Click handling (single-click, long-press)
 * - Popup action handling
 * - Entry creation from map
 * 
 * DEPENDENCIES: state.js, entries.js, ui.js, popups.js
 * 
 * NOTE: ArcGIS API is loaded in index.html via <script> tag
 * 
 * ============================================================
 */

/**
 * Initializes the ArcGIS map and sets up all interactions.
 * This is called once when user logs in.
 * 
 * Sets up:
 * - Map and MapView with graphics layer
 * - Search widget (find locations)
 * - Locate widget (go to current location)
 * - Basemap gallery (switch map styles)
 * - Click handlers (single-click, long-press)
 * - Popup action listeners
 */
function initMap() {
    require([
        'esri/Map',
        'esri/views/MapView',
        'esri/config',
        'esri/widgets/Search',
        'esri/widgets/Locate',
        'esri/widgets/BasemapGallery',
        'esri/widgets/Expand',
        'esri/Graphic',
        'esri/layers/GraphicsLayer',
        'esri/geometry/Polyline',
        'esri/geometry/geometryEngine'
    ], (Map, MapView, esriConfig, Search, Locate, BasemapGallery, Expand, Graphic, GraphicsLayer, Polyline, geometryEngine) => {
        // ============================================================
        // ARCGIS API CONFIGURATION
        // ============================================================
        
        // API key for ArcGIS services
        esriConfig.apiKey = 'AAPTxy8BH1VEsoebNVZXo8HurP99AuF0u6hFXE5XsMHKuzBSGN5LvVSYilawxafx85hn9PCGXebaJHWlitVBT5zeCUaAyEvqj1BxcDK_zJC-tVX6YCERGHXEpZz6YEPcefm_vmXsNbePUUZ7JAXpHdXjsnh5x7OFNgUY22Xi2rwI6cYzTClvMoxyiN9hd4ig364gzmVxs5mLuQQYqSwxcO8eUnY8D8k0W9Tj3o-WFWbJGlMs42rjT9Cgf1AsZxwet7SYAT1_FDERp6GX';

        // Save constructors globally for later use (story creation, graphics)
        GraphicCtor = Graphic;
        GraphicsLayerCtor = GraphicsLayer;
        PolylineCtor = Polyline;
        geometryEngineModule = geometryEngine;

        // Create graphics layer for displaying entry points
        appGraphicsLayer = new GraphicsLayer();

        // Create the map
        const map = new Map({
            basemap: 'arcgis-midcentury',
            layers: [appGraphicsLayer]
        });

        // Save map globally for adding story layers
        mapInstance = map;
        
        // Create map view with initial center (Santa Fe, NM) and zoom level
        const view = new MapView({
            map,
            center: [-106.644568, 35.126358],
            zoom: 9,
            container: 'viewDiv'
        });
        
        // Disable default popup so we can manage popups ourselves
        view.popup.autoOpenEnabled = false;
        
        // Save view globally for access from other modules
        appView = view;
        
        // ============================================================
        // MAP WIDGETS - Search, Locate, Basemap Gallery
        // ============================================================
        
        // Search widget: allows users to search for locations
        new Search({ view, container: 'searchContainer' });
        
        // Locate widget: navigate to user's current location
        const locateBtn = new Locate({ view });
        const basemapGallery = new BasemapGallery({ view });
        
        // Create container for bottom-right widgets
        const widgetRow = document.createElement('div');
        widgetRow.className = 'map-widget-row';
        const locateContainer = document.createElement('div');
        const basemapContainer = document.createElement('div');
        widgetRow.appendChild(locateContainer);
        widgetRow.appendChild(basemapContainer);
        
        // Set locations for widgets
        locateBtn.container = locateContainer;
        new Expand({
            view,
            content: basemapGallery,
            container: basemapContainer,
            autoCollapse: true
        });
        
        // Add to map UI
        view.ui.add(widgetRow, { position: 'bottom-right', index: 0 });
        
        // ============================================================
        // AUTO-LOCATE USER
        // ============================================================
        
        // Try to locate user when map is ready
        view.when(() => {
            locateBtn.locate().catch(() => {
                // Fallback: use browser geolocation API
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition((position) => {
                        view.goTo({
                            center: [position.coords.longitude, position.coords.latitude],
                            zoom: 13
                        });
                    });
                }
            });
        });
        
        // ============================================================
        // POPUP ACTION HANDLING
        // ============================================================
        
        /**
         * Handle popup action buttons (Read, Edit, Add new, Close)
         * User clicks these buttons in the popup to interact with entries
         */
        view.popup.on('trigger-action', (popupEvent) => {
            // Close popup action
            if (popupEvent.action.id === 'close-popup') {
                view.popup.close();
                return;
            }
            
            // Get the selected entry from popup
            const selectedGraphic = view.popup.selectedFeature;
            if (!selectedGraphic || !selectedGraphic.attributes) {
                return;
            }
            
            // Find point record by key
            const pointKey = selectedGraphic.attributes.pointKey;
            if (!pointStore.has(pointKey)) {
                return;
            }
            
            // Get the selected entry
            const pointRecord = pointStore.get(pointKey);
            const selectedEntry = findEntryById(pointRecord, selectedGraphic.attributes.selectedEntryId);
            if (!selectedEntry) {
                return;
            }
            
            // Handle different action IDs
            if (popupEvent.action.id === 'read-full-entry') {
                // Open detail panel to read full entry
                openDetailPanel(pointRecord, selectedEntry);
            } else if (popupEvent.action.id === 'edit-entry') {
                // Open modal to edit this entry
                openEntryModal('edit', pointRecord, selectedEntry);
            } else if (popupEvent.action.id === 'add-same-point') {
                // Open modal to add new entry at same location
                currentClickCoords = {
                    lat: pointRecord.lat,
                    lon: pointRecord.lon,
                    mapPoint: pointRecord.mapPoint
                };
                openEntryModal('new', pointRecord, null);
            }
        });
        // ============================================================
        // CLICK HANDLING - Select Existing Entries
        // ============================================================
        
        /**
         * Single-click handler: Show popup for clicked entry point.
         * If multiple entries at point, show selector; if one entry, show popup.
         */
        view.on('click', async (event) => {
            // Test if click hit any graphics
            const hitResponse = await view.hitTest(event);
            const graphicResult = hitResponse.results.find((result) => {
                const graphic = result && result.graphic ? result.graphic : null;
                if (!graphic || !graphic.attributes) {
                    return false;
                }
                return !!graphic.attributes.pointKey && pointStore.has(graphic.attributes.pointKey);
            });
            
            // If user clicked on an entry marker
            if (graphicResult) {
                const pointKey = graphicResult.graphic.attributes.pointKey;
                if (!pointStore.has(pointKey)) {
                    return;
                }
                
                const pointRecord = pointStore.get(pointKey);
                
                // Show entry selector if multiple, otherwise show single popup
                if (pointRecord.entries.length > 1) {
                    openEntrySelectorPopup(pointRecord, event.mapPoint);
                } else {
                    const latestEntry = getLatestEntry(pointRecord);
                    if (latestEntry) {
                        openEntryPopup(pointRecord, latestEntry, event.mapPoint);
                    }
                }
            }
        });
        
        // ============================================================
        // LONG-PRESS HANDLING - Create New Entries
        // ============================================================
        
        /**
         * Long-press (click and hold) creates a new entry at that location.
         * Shows visual indicator while user holds down.
         * If user moves too much, cancels the action.
         * 
         * Constants:
         * - LONG_PRESS_DURATION: 800ms (how long to hold)
         * - MOVE_THRESHOLD: 10px (max distance before cancel)
         */
        let longPressTimer = null;
        let longPressStartPoint = null;
        let longPressIndicator = null;
        const LONG_PRESS_DURATION = 800;   // milliseconds
        const MOVE_THRESHOLD = 10;          // pixels
        
        // Add event listeners to map container
        view.container.addEventListener('mousedown', handlePressStart);
        view.container.addEventListener('touchstart', handlePressStart);
        view.container.addEventListener('mousemove', handlePressMove);
        view.container.addEventListener('touchmove', handlePressMove);
        view.container.addEventListener('mouseup', handlePressEnd);
        view.container.addEventListener('touchend', handlePressEnd);
        view.container.addEventListener('touchcancel', handlePressEnd);
        
        /**
         * Handles press start: either mouse down or touch start
         * Records starting coordinates and creates visual indicator
         */
        function handlePressStart(event) {
            // Extract coordinates from mouse or touch event
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
            
            // Convert screen coordinates to map coordinates
            const rect = view.container.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            const mapPoint = view.toMap({ x, y });
            if (!mapPoint) return;
            
            // Save starting position
            longPressStartPoint = { x, y, clientX, clientY, mapPoint };
            
            // Create visual indicator (small circle)
            longPressIndicator = document.createElement('div');
            longPressIndicator.className = 'long-press-indicator';
            longPressIndicator.style.left = x + 'px';
            longPressIndicator.style.top = y + 'px';
            view.container.appendChild(longPressIndicator);
            
            // Start timeout for long-press
            longPressTimer = setTimeout(() => {
                // Long press triggered!
                if (longPressIndicator) {
                    longPressIndicator.remove();
                    longPressIndicator = null;
                }
                
                // Show guest mode warning once
                if (isGuestMode && !guestEntryWarningShown) {
                    alert('Guest mode note: diary entries are stored temporarily and will be deleted if you refresh the page.');
                    guestEntryWarningShown = true;
                }
                
                // Prepare coordinates for entry creation
                currentClickCoords = {
                    lat: roundCoord(longPressStartPoint.mapPoint.latitude),
                    lon: roundCoord(longPressStartPoint.mapPoint.longitude),
                    mapPoint: longPressStartPoint.mapPoint
                };
                
                // Open entry modal
                const pointRecord = getOrCreatePointRecord(currentClickCoords);
                openEntryModal('new', pointRecord, null);
                
                // Clear state
                longPressTimer = null;
                longPressStartPoint = null;
            }, LONG_PRESS_DURATION);
        }
        
        /**
         * Handles press move: cancels long-press if moved too far
         */
        function handlePressMove(event) {
            // Don't do anything if no long-press in progress
            if (!longPressTimer || !longPressStartPoint) {
                return;
            }
            
            // Get current coordinates
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
            
            // Calculate distance moved
            const dx = clientX - longPressStartPoint.clientX;
            const dy = clientY - longPressStartPoint.clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Cancel if moved too far
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
        
        /**
         * Handles press end: cancel long-press timer
         */
        function handlePressEnd(event) {
            // Cancel timer if still active
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
                longPressStartPoint = null;
            }
            
            // Remove indicator if present
            if (longPressIndicator) {
                longPressIndicator.remove();
                longPressIndicator = null;
            }
        }
    });
}
