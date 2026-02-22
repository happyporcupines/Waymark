
// 1. Mock Login Logic
let mapInitialized = false;
let isGuestMode = false;
let guestEntryWarningShown = false;

function enterApp(userLabel, guestMode) {
    isGuestMode = guestMode;
    if (!isGuestMode) {
        guestEntryWarningShown = false;
    }
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';
    document.getElementById('userInfo').innerText = userLabel;

    document.getElementById('sidebar').classList.remove('active');
    document.querySelector('.map-container').style.display = 'block';

    if (!mapInitialized) {
        initMap();
        mapInitialized = true;
    }
}

document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    if (target.closest('#loginBtn')) {
        const email = document.getElementById('emailInput').value;
        if (email) {
            enterApp(`User: ${email}`, false);
        } else {
            alert("Please enter an email to log in!");
        }
        return;
    }

    if (target.closest('#guestBtn')) {
        enterApp('Guest mode: data will not be saved', true);
        return;
    }

    if (target.closest('#navMap')) {
        document.getElementById('sidebar').classList.remove('active');
        document.querySelector('.map-container').style.display = 'block';
        return;
    }

    if (target.closest('#navList')) {
        document.getElementById('sidebar').classList.add('active');
        document.querySelector('.map-container').style.display = 'none';
    }
});

// Global variables to hold our diary data temporarily
let journalEntries = [];
let currentClickCoords = null;

// 2. Esri Map Initialization
function initMap() {
    require([
        "esri/Map",
        "esri/views/MapView",
        "esri/config",
        "esri/widgets/Search",
        "esri/widgets/Locate",
        "esri/widgets/BasemapGallery",
        "esri/widgets/Expand",
        "esri/Graphic",            // KUROMI UPDATE: For drawing pins
        "esri/layers/GraphicsLayer" // KUROMI UPDATE: For holding the pins
    ], (Map, MapView, esriConfig, Search, Locate, BasemapGallery, Expand, Graphic, GraphicsLayer) => {

        esriConfig.apiKey = "AAPTxy8BH1VEsoebNVZXo8HurP99AuF0u6hFXE5XsMHKuzBSGN5LvVSYilawxafx85hn9PCGXebaJHWlitVBT5zeCUaAyEvqj1BxcDK_zJC-tVX6YCERGHXEpZz6YEPcefm_vmXsNbePUUZ7JAXpHdXjsnh5x7OFNgUY22Xi2rwI6cYzTClvMoxyiN9hd4ig364gzmVxs5mLuQQYqSwxcO8eUnY8D8k0W9Tj3o-WFWbJGlMs42rjT9Cgf1AsZxwet7SYAT1_FDERp6GX";

        // Create a graphics layer and add it to the map
        const graphicsLayer = new GraphicsLayer();

        const map = new Map({
            basemap: "arcgis-human-geography-dark",
            layers: [graphicsLayer] // Add the layer here!
        });

        const view = new MapView({
            map: map,
            center: [-106.644568, 35.126358],
            zoom: 9,
            container: "viewDiv"
        });

        // --- WIDGETS SECTION (Kept exactly as you had it!) ---
        const searchWidget = new Search({ view: view, container: "searchContainer" });
        const locateBtn = new Locate({ view: view });
        const basemapGallery = new BasemapGallery({ view: view });

        const widgetRow = document.createElement("div");
        widgetRow.className = "map-widget-row";

        const locateContainer = document.createElement("div");
        const basemapContainer = document.createElement("div");
        widgetRow.appendChild(locateContainer);
        widgetRow.appendChild(basemapContainer);

        locateBtn.container = locateContainer;

        const bgExpand = new Expand({
            view: view, content: basemapGallery, container: basemapContainer, autoCollapse: true
        });

        view.ui.add(widgetRow, { position: "bottom-right", index: 0 });

        view.when(() => {
            locateBtn.locate().catch(() => {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition((position) => {
                        view.goTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 13 });
                    });
                }
            });
        });
        // --- END WIDGETS SECTION ---

        // 3. The Magic: Map Clicks & Modal Logic
        view.on("click", (event) => {
            if (isGuestMode && !guestEntryWarningShown) {
                alert("Guest mode note: diary entries are stored temporarily and will be deleted if you refresh the page.");
                guestEntryWarningShown = true;
            }

            // Save coordinates globally so the Save button can access them later
            currentClickCoords = {
                lat: Math.round(event.mapPoint.latitude * 1000) / 1000,
                lon: Math.round(event.mapPoint.longitude * 1000) / 1000,
                mapPoint: event.mapPoint
            };

            // Update the modal text and show it
            document.getElementById('entryCoords').innerText = `Location: ${currentClickCoords.lat}, ${currentClickCoords.lon}`;
            document.getElementById('entryModal').style.display = 'flex';
        });

        // 4. Handling Modal Buttons (Save & Cancel)
        document.getElementById('cancelEntryBtn').addEventListener('click', () => {
            document.getElementById('entryModal').style.display = 'none'; // Hide modal
            clearForm(); // Clean up inputs
        });

        document.getElementById('saveEntryBtn').addEventListener('click', () => {
            const title = document.getElementById('entryTitle').value;
            const text = document.getElementById('entryText').value;

            if (!title || !text) {
                alert("Don't be lazy, fill out both the title and your memory! 🖤");
                return;
            }

            // A. Create the Graphic (The Pin)
            const pointGraphic = new Graphic({
                geometry: currentClickCoords.mapPoint,
                symbol: {
                    type: "simple-marker",
                    color: [164, 56, 85], // Kuromi Burgundy!
                    outline: { color: [255, 255, 255], width: 2 }
                },
                attributes: {
                    title: title,
                    description: text
                },
                popupTemplate: {
                    title: "{title}",
                    content: "{description}"
                }
            });

            // B. Add pin to map
            graphicsLayer.add(pointGraphic);

            // C. Save to local guest array only in guest mode
            if (isGuestMode) {
                journalEntries.push({ title: title, text: text, lat: currentClickCoords.lat, lon: currentClickCoords.lon });
                updateSidebarList();
            }

            // D. Close modal and clean up
            document.getElementById('entryModal').style.display = 'none';
            clearForm();
        });

        // Helper function to update the HTML list in the sidebar
        function updateSidebarList() {
            const listContainer = document.getElementById('entriesList');
            listContainer.innerHTML = ''; // Clear current list

            journalEntries.forEach(entry => {
                const entryDiv = document.createElement('div');
                entryDiv.style.borderBottom = "1px solid #ccc";
                entryDiv.style.padding = "10px 0";
                entryDiv.innerHTML = `
                    <h4 style="margin: 0 0 5px 0; color: #a43855;">${entry.title}</h4>
                    <p style="margin: 0; font-size: 0.9em;">${entry.text}</p>
                    <small style="color: #666;">Lat: ${entry.lat}, Lon: ${entry.lon}</small>
                `;
                listContainer.appendChild(entryDiv);
            });
        }

        // Helper function to reset the form inputs
        function clearForm() {
            document.getElementById('entryTitle').value = '';
            document.getElementById('entryText').value = '';
            currentClickCoords = null;
        }
    });
}