/**
 * ============================================================================
 * MAP.JS - ArcGIS Map Initialization & Interaction Handlers
 * ============================================================================
 * 
 * This file initializes and configures the ArcGIS JavaScript API map, which is
 * the core geographic component of Waymark. It handles:
 * 
 * - Loading ArcGIS modules via AMD require()
 * - Creating the map and view instances
 * - Adding widgets (Search, Locate, Basemap Gallery)
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
 * Initializes the ArcGIS map and sets up all event handlers
 * 
 * This is the main initialization function called when the user enters the app.
 * It performs several critical setup tasks:
 * 
 * MODULE LOADING:
 * Uses AMD-style require() to load ArcGIS modules asynchronously.
 * Modules are stored in global variables for use throughout the app.
 * 
 * MAP CREATION:
 * - Creates Map instance with basemap
 * - Creates MapView with center and zoom
 * - Adds graphics layer for entry markers
 * 
 * WIDGETS:
 * - Search: Location search in header
 * - Locate: GPS location button
 * - BasemapGallery: Style switcher
 * 
 * EVENT HANDLERS:
 * - Popup action handlers (read, edit, add)
 * - Click handler for selecting entries
 * - Long-press handler for creating entries
 * 
 * The function is called only once per session (tracked by mapInitialized flag).
 */
function initMap() {
    // LOAD ARCGIS MODULES: Use AMD require() pattern
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
        'esri/geometry/Point',
        'esri/geometry/Polyline',
        'esri/geometry/geometryEngine'
    ], (Map, MapView, esriConfig, Search, Locate, BasemapGallery, Expand, Graphic, GraphicsLayer, Point, Polyline, geometryEngine) => {
        // SET API KEY: Required for ArcGIS services access
        esriConfig.apiKey = 'AAPTxy8BH1VEsoebNVZXo8HurP99AuF0u6hFXE5XsMHKuzBSGN5LvVSYilawxafx85hn9PCGXebaJHWlitVBT5zeCUaAyEvqj1BxcDK_zJC-tVX6YCERGHXEpZz6YEPcefm_vmXsNbePUUZ7JAXpHdXjsnh5x7OFNgUY22Xi2rwI6cYzTClvMoxyiN9hd4ig364gzmVxs5mLuQQYqSwxcO8eUnY8D8k0W9Tj3o-WFWbJGlMs42rjT9Cgf1AsZxwet7SYAT1_FDERp6GX';

        // STORE CONSTRUCTORS GLOBALLY: Save for use in other modules
        GraphicCtor = Graphic;                    // For creating map markers
        GraphicsLayerCtor = GraphicsLayer;         // For story layers
        PointCtor = Point;                        // For rebuilding points from remote data
        PolylineCtor = Polyline;                  // For drawing story paths
        geometryEngineModule = geometryEngine;     // For distance calculations

        // CREATE MAIN GRAPHICS LAYER: Holds entry point markers
        appGraphicsLayer = new GraphicsLayer();

        // CREATE MAP INSTANCE: Configure basemap and add graphics layer
        const map = new Map({
            basemap: 'arcgis-midcentury',    // Stylish vintage basemap
            layers: [appGraphicsLayer]        // Add main graphics layer
        });

        mapInstance = map; // Save globally for adding story layers later
        
        // CREATE MAPVIEW: Configure viewport and interaction settings
        const view = new MapView({
            map,
            center: [-106.644568, 35.126358],  // Default: New Mexico
            zoom: 9,                            // Comfortable regional view
            container: 'viewDiv'                // DOM element ID
        });
        
        // DISABLE DEFAULT POPUP: We manage popups manually for custom behavior
        view.popup.autoOpenEnabled = false;
        
        // SAVE VIEW GLOBALLY: Needed for programmatic map operations
        appView = view;
        // ================================================================
        // WIDGET CONFIGURATION
        // ================================================================
        
        // SEARCH WIDGET: Add location search to sidebar header
        new Search({ view, container: 'searchContainer' });
        
        // LOCATE WIDGET: GPS location button for mobile/desktop
        const locateBtn = new Locate({ view });
        
        // BASEMAP GALLERY: Let users switch map styles
        const basemapGallery = new BasemapGallery({ view });
        
        // CREATE WIDGET CONTAINER: Custom DOM element for bottom-right controls
        const widgetRow = document.createElement('div');
        widgetRow.className = 'map-widget-row';
        
        // Separate containers prevent widget styling conflicts
        const locateContainer = document.createElement('div');
        const basemapContainer = document.createElement('div');
        widgetRow.appendChild(locateContainer);
        widgetRow.appendChild(basemapContainer);
        
        // Attach widgets to their containers
        locateBtn.container = locateContainer;
        
        // Wrap BasemapGallery in Expand widget to save space
        new Expand({
            view,
            content: basemapGallery,
            container: basemapContainer,
            autoCollapse: true  // Close after selection
        });
        
        // Add widget row to map view
        view.ui.add(widgetRow, { position: 'bottom-right', index: 0 });
        // ================================================================
        // INITIAL USER LOCATION
        // ================================================================
        
        // When map is ready, attempt to center on user's location
        // Try GPS first, fall back to browser geolocation if denied
        view.when(() => {
            locateBtn.locate().catch(() => {
                // Fallback to browser geolocation if GPS permission denied
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
        // ================================================================
        // POPUP ACTION HANDLERS
        // ================================================================
        
        /**
         * Handles user clicks on action buttons within map popups
         * 
         * Actions available:
         * - 'read-full-entry': Opens detail panel with complete entry content
         * - 'edit-entry': Opens entry modal pre-filled for editing
         * - 'add-same-point': Creates new entry at same geographic location
         * - 'close-popup': Closes the popup
         * 
         * The handler:
         * 1. Gets the selected graphic from popup
         * 2. Finds the point record using pointKey attribute
         * 3. Finds the specific entry using selectedEntryId
         * 4. Calls appropriate function based on action ID
         */
        view.popup.on('trigger-action', (popupEvent) => {
            if (popupEvent.action.id === 'close-popup') {
                view.popup.close();
                return;
            }
            // Get the selected graphic from the popup, and ensure it has the necessary attributes to identify the point and entry
            const selectedGraphic = view.popup.selectedFeature;
            if (!selectedGraphic) {
                return;
            }
            // Use the pointKey attribute from the graphic to find the corresponding point record in our pointStore; if it doesn't exist, we can't proceed
            const pointKey = selectedGraphic.attributes.pointKey;
            if (!pointStore.has(pointKey)) {
                return;
            }
            // With the point record in hand, we can find the specific entry that was selected in the popup using the selectedEntryId attribute
            // if we can't find it, we can't proceed
            const pointRecord = pointStore.get(pointKey);
            const selectedEntry = findEntryById(pointRecord, selectedGraphic.attributes.selectedEntryId);
            // Depending on which action was triggered in the popup, we call the appropriate function to either open the detail panel,
            // open the entry modal for editing, or open the entry modal for adding a new entry at the same point
            if (!selectedEntry) {
                return;
            }
            // Handle the different popup actions based on the action ID
            if (popupEvent.action.id === 'read-full-entry') {
                openDetailPanel(pointRecord, selectedEntry);
            }
            // When the user clicks "Edit entry" in the popup, we want to open the entry modal pre-filled with the selected entry's data for editing
            if (popupEvent.action.id === 'edit-entry') {
                openEntryModal('edit', pointRecord, selectedEntry);
            }
            // When the user clicks "Add new entry to same point" in the popup, we want to open the entry modal for creating a new entry,
            if (popupEvent.action.id === 'add-same-point') {
                currentClickCoords = {
                    lat: pointRecord.lat,
                    lon: pointRecord.lon,
                    mapPoint: pointRecord.mapPoint
                };
                openEntryModal('new', pointRecord, null);
            }
        });
        // ================================================================
        // CLICK HANDLER: Select existing entries
        // ================================================================
        
        /**
         * Single-click handler for selecting existing entry markers
         * 
         * Using single click instead of double-click for better mobile experience.
         * The handler:
         * 1. Performs hit test to check if click landed on a graphic
         * 2. Filters for graphics with pointKey attribute (entry markers)
         * 3. Opens popup (selector if multiple entries, direct if single)
         * 
         * If user clicks on empty map area, nothing happens (long-press creates new entry).
         */
        view.on('click', async (event) => {
            const hitResponse = await view.hitTest(event);
            
            // Find if click landed on an entry marker graphic
            const graphicResult = hitResponse.results.find((result) => {
                const graphic = result && result.graphic ? result.graphic : null;
                if (!graphic || !graphic.attributes) {
                    return false;
                }
                // Only consider graphics with pointKey (entry markers, not other graphics)
                return !!graphic.attributes.pointKey && pointStore.has(graphic.attributes.pointKey);
            });
            
            // If the user clicked on an existing entry marker
            if (graphicResult) {
                const pointKey = graphicResult.graphic.attributes.pointKey;
                if (!pointStore.has(pointKey)) {
                    return;
                }
                const pointRecord = pointStore.get(pointKey);
                
                // MULTIPLE ENTRIES: Show selector popup
                if (pointRecord.entries.length > 1) {
                    openEntrySelectorPopup(pointRecord, event.mapPoint);
                } 
                // SINGLE ENTRY: Show entry popup directly
                else {
                    const latestEntry = getLatestEntry(pointRecord);
                    if (latestEntry) {
                        openEntryPopup(pointRecord, latestEntry, event.mapPoint);
                    }
                }
            }
        });
        
        // ================================================================
        // LONG-PRESS HANDLER: Create new entries
        // ================================================================
        
        /**
         * Long-press (click and hold) handler for creating new diary entries
         * 
         * Long-press pattern:
         * - Press duration: 800ms
         * - Movement threshold: 10 pixels
         * - Visual feedback: Growing circular indicator
         * 
         * This avoids conflicts with pan/zoom gestures and provides clear
         * visual feedback on mobile devices.
         * 
         * The handler uses standard DOM events (mousedown/touchstart) instead
         * of ArcGIS pointer events for better mobile compatibility.
         */
        let longPressTimer = null;
        let longPressStartPoint = null;
        let longPressIndicator = null;
        const LONG_PRESS_DURATION = 800; // milliseconds
        const MOVE_THRESHOLD = 10; // pixels
        
        // Use standard DOM events on the container for better compatibility
        view.container.addEventListener('mousedown', handlePressStart);
        view.container.addEventListener('touchstart', handlePressStart);
        view.container.addEventListener('mousemove', handlePressMove);
        view.container.addEventListener('touchmove', handlePressMove);
        view.container.addEventListener('mouseup', handlePressEnd);
        view.container.addEventListener('touchend', handlePressEnd);
        view.container.addEventListener('touchcancel', handlePressEnd);
        
        function handlePressStart(event) {
            // Get coordinates from mouse or touch event
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
            
            // Convert to screen coordinates relative to the view
            const rect = view.container.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            
            // Get the map point
            const mapPoint = view.toMap({ x, y });
            if (!mapPoint) return;
            
            longPressStartPoint = { x, y, clientX, clientY, mapPoint };
            
            // Create visual indicator
            longPressIndicator = document.createElement('div');
            longPressIndicator.className = 'long-press-indicator';
            longPressIndicator.style.left = x + 'px';
            longPressIndicator.style.top = y + 'px';
            view.container.appendChild(longPressIndicator);
            
            longPressTimer = setTimeout(() => {
                // Long press triggered - create new entry
                if (longPressIndicator) {
                    longPressIndicator.remove();
                    longPressIndicator = null;
                }
                
                if (isGuestMode && !guestEntryWarningShown) {
                    alert('Guest mode note: diary entries are stored temporarily and will be deleted if you refresh the page.');
                    guestEntryWarningShown = true;
                }
                
                currentClickCoords = {
                    lat: roundCoord(longPressStartPoint.mapPoint.latitude),
                    lon: roundCoord(longPressStartPoint.mapPoint.longitude),
                    mapPoint: longPressStartPoint.mapPoint
                };
                
                const pointRecord = getOrCreatePointRecord(currentClickCoords);
                openEntryModal('new', pointRecord, null);
                
                // Clear the timer so pointer-up doesn't do anything
                longPressTimer = null;
                longPressStartPoint = null;
            }, LONG_PRESS_DURATION);
        }
        
        function handlePressMove(event) {
            // Cancel long press if user moves too much
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
            // Cancel long press on release
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
    });
}
