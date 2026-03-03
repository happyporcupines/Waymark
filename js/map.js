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
            basemap: 'arcgis-human-geography-dark',
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
            // Don't trigger if we're in the middle of a drag operation
            if (isDraggingLocationIcon) {
                return;
            }
            
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
        
        // Set up drag and drop handlers for the map to accept the dragged location icon
        view.container.addEventListener('dragover', (event) => {
            // Only accept if we're dragging the location icon
            if (isDraggingLocationIcon) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                view.container.style.opacity = '0.9';
            }
        });
        
        view.container.addEventListener('dragleave', (event) => {
            if (isDraggingLocationIcon && event.target === view.container) {
                view.container.style.opacity = '1';
            }
        });
        
        view.container.addEventListener('drop', async (event) => {
            if (!isDraggingLocationIcon) {
                return;
            }
            
            event.preventDefault();
            view.container.style.opacity = '1';
            isDraggingLocationIcon = false;
            
            // Get the map point at the drop location
            // Need to calculate position relative to the view container, not the viewport
            const rect = view.container.getBoundingClientRect();
            const mapPoint = view.toMap({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            });
            
            if (!mapPoint) {
                return;
            }
            
            // Show guest mode warning if applicable
            if (isGuestMode && !guestEntryWarningShown) {
                alert('Guest mode note: diary entries are stored temporarily and will be deleted if you refresh the page.');
                guestEntryWarningShown = true;
            }
            
            // Create a new entry at the drop location
            currentClickCoords = {
                lat: roundCoord(mapPoint.latitude),
                lon: roundCoord(mapPoint.longitude),
                mapPoint: mapPoint
            };
            
            const pointRecord = getOrCreatePointRecord(currentClickCoords);
            openEntryModal('new', pointRecord, null);
        });
    });
}
