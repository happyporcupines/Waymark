// Map Initialization & Map Event Handlers

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
        esriConfig.apiKey = 'AAPTxy8BH1VEsoebNVZXo8HurP99AuF0u6hFXE5XsMHKuzBSGN5LvVSYilawxafx85hn9PCGXebaJHWlitVBT5zeCUaAyEvqj1BxcDK_zJC-tVX6YCERGHXEpZz6YEPcefm_vmXsNbePUUZ7JAXpHdXjsnh5x7OFNgUY22Xi2rwI6cYzTClvMoxyiN9hd4ig364gzmVxs5mLuQQYqSwxcO8eUnY8D8k0W9Tj3o-WFWbJGlMs42rjT9Cgf1AsZxwet7SYAT1_FDERp6GX';

        GraphicCtor = Graphic;
        GraphicsLayerCtor = GraphicsLayer; // Save this to make new layers for stories
        PolylineCtor = Polyline;           // Save for drawing lines
        geometryEngineModule = geometryEngine; // Save for calculating miles

        appGraphicsLayer = new GraphicsLayer();

        const map = new Map({
            basemap: 'arcgis-midcentury',
            layers: [appGraphicsLayer]
        });

        mapInstance = map; // Save globally for story layer additions
        // Initialize the MapView with a default center and zoom level, and set the container to the 'viewDiv' element
        const view = new MapView({
            map,
            center: [-106.644568, 35.126358],
            zoom: 9,
            container: 'viewDiv'
        });
        // Disable the default popup behavior since we'll be managing popups manually based on our custom logic
        view.popup.autoOpenEnabled = false;
        //
        appView = view;
        // Add the Search widget to the top-right corner of the view, allowing users to search for locations on the map
        new Search({ view, container: 'searchContainer' });
        // Add the Locate widget to the bottom-right corner, allowing users to quickly navigate to their current location
        const locateBtn = new Locate({ view });
        const basemapGallery = new BasemapGallery({ view });
        // Create a container for the Locate and BasemapGallery widgets, and add it to the view's UI in the bottom-right corner
        const widgetRow = document.createElement('div');
        widgetRow.className = 'map-widget-row';
        // We create separate containers for the locate button and the basemap gallery to ensure they are styled correctly and don't interfere with each other  
        const locateContainer = document.createElement('div');
        const basemapContainer = document.createElement('div');
        widgetRow.appendChild(locateContainer);
        widgetRow.appendChild(basemapContainer);
        // Set the containers for the widgets to the respective divs we just created
        locateBtn.container = locateContainer;
        // Wrap the BasemapGallery in an Expand widget so it doesn't take up too much space, and set it to auto-collapse after a selection is made
        new Expand({
            view,
            content: basemapGallery,
            container: basemapContainer,
            autoCollapse: true
        });
        // Finally, add the entire widget row to the view's UI in the bottom-right corner
        view.ui.add(widgetRow, { position: 'bottom-right', index: 0 });
        // When the view is ready, attempt to locate the user
        // if that fails (like if they deny permission), we fall back to using the browser's geolocation API 
        // as a last resort to center the map on their location
        view.when(() => {
            locateBtn.locate().catch(() => {
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
        // Set up a listener for actions triggered from the popups on the map. 
        // This allows us to handle user interactions with the popup buttons, such as reading the full entry, editing it,
        //  or adding a new entry at the same point.
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
        // Set up a listener for single-click events on the view to select existing entries
        // This is more mobile-friendly than double-click
        view.on('click', async (event) => {
            const hitResponse = await view.hitTest(event);
            const graphicResult = hitResponse.results.find((result) => {
                const graphic = result && result.graphic ? result.graphic : null;
                if (!graphic || !graphic.attributes) {
                    return false;
                }
                return !!graphic.attributes.pointKey && pointStore.has(graphic.attributes.pointKey);
            });
            
            // If the user clicked on an existing graphic that has a pointKey attribute, show the popup for that point
            if (graphicResult) {
                const pointKey = graphicResult.graphic.attributes.pointKey;
                if (!pointStore.has(pointKey)) {
                    return;
                }
                // If the point has multiple entries, show the entry selector popup
                // if it has only one entry, show the entry popup
                const pointRecord = pointStore.get(pointKey);
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
        
        // Long press (click and hold) handler for creating new entries
        let longPressTimer = null;
        let longPressStartPoint = null;
        let longPressIndicator = null;
        let isLongPressActive = false;
        const LONG_PRESS_DURATION = 800; // milliseconds
        const MOVE_THRESHOLD = 5; // pixels - very small threshold to detect panning
        
        // Listen for press events on the view container
        // Use capture phase to ensure we get the events before the map does
        view.container.addEventListener('pointerdown', handlePressStart, true);
        view.container.addEventListener('pointermove', handlePressMove, true);
        view.container.addEventListener('pointerup', handlePressEnd, true);
        view.container.addEventListener('pointercancel', handlePressEnd, true);
        
        // Fallback for touch and mouse events
        view.container.addEventListener('touchstart', handlePressStart, true);
        view.container.addEventListener('touchmove', handlePressMove, true);
        view.container.addEventListener('touchend', handlePressEnd, true);
        view.container.addEventListener('touchcancel', handlePressEnd, true);
        
        view.container.addEventListener('mousedown', handlePressStart, true);
        view.container.addEventListener('mousemove', handlePressMove, true);
        view.container.addEventListener('mouseup', handlePressEnd, true);
        
        function handlePressStart(event) {
            // Ignore if we're already in a long press
            if (longPressTimer || isLongPressActive) {
                return;
            }
            
            // Ignore right-click
            if (event.button === 2) {
                return;
            }
            
            // Get coordinates from touch or mouse event
            let clientX, clientY;
            if (event.touches && event.touches.length > 0) {
                clientX = event.touches[0].clientX;
                clientY = event.touches[0].clientY;
            } else if (event.clientX !== undefined && event.clientY !== undefined) {
                clientX = event.clientX;
                clientY = event.clientY;
            } else {
                return;
            }
            
            // Convert to view-relative coordinates
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
                isLongPressActive = true;
                
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
                
                // Clear the timer
                longPressTimer = null;
                longPressStartPoint = null;
            }, LONG_PRESS_DURATION);
        }
        
        function handlePressMove(event) {
            // Cancel long press if user moves
            if (longPressTimer && longPressStartPoint) {
                let clientX, clientY;
                if (event.touches && event.touches.length > 0) {
                    clientX = event.touches[0].clientX;
                    clientY = event.touches[0].clientY;
                } else if (event.clientX !== undefined && event.clientY !== undefined) {
                    clientX = event.clientX;
                    clientY = event.clientY;
                } else {
                    return;
                }
                
                const dx = clientX - longPressStartPoint.clientX;
                const dy = clientY - longPressStartPoint.clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > MOVE_THRESHOLD) {
                    clearPressState();
                }
            }
        }
        
        function handlePressEnd(event) {
            // Reset the active state
            isLongPressActive = false;
            clearPressState();
        }
        
        // Helper function to cleanly clear all press-related state
        function clearPressState() {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            longPressStartPoint = null;
            
            if (longPressIndicator) {
                try {
                    longPressIndicator.remove();
                } catch (e) {
                    // Indicator might already be removed
                }
                longPressIndicator = null;
            }
    });
}
