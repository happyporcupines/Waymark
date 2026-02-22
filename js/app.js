
// 1. Mock Login Logic
let mapInitialized = false;

function enterApp(userLabel) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';
    document.getElementById('userInfo').innerText = userLabel;

    if (!mapInitialized) {
        initMap();
        mapInitialized = true;
    }
}

document.getElementById('loginBtn').addEventListener('click', () => {
    const email = document.getElementById('emailInput').value;

    if (email) {
        enterApp(`User: ${email}`);
    } else {
        alert("Please enter an email to log in!");
    }
});

document.getElementById('guestBtn').addEventListener('click', () => {
    enterApp('Guest mode: data will not be saved');
});

// Mobile Navigation Logic (Switching between Map and Entries List)
document.getElementById('navMap').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('active');
    document.querySelector('.map-container').style.display = 'block';
});

document.getElementById('navList').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('active');
    document.querySelector('.map-container').style.display = 'none';
});

// 2. Esri Map Initialization
function initMap() {
    require([
        "esri/Map",
        "esri/views/MapView",
        "esri/config",
        "esri/widgets/Search"
    ], (Map, MapView, esriConfig, Search) => {

        // Your API Key
        esriConfig.apiKey = "AAPTxy8BH1VEsoebNVZXo8HurP99AuF0u6hFXE5XsMHKuzBSGN5LvVSYilawxafx85hn9PCGXebaJHWlitVBT5zeCUaAyEvqj1BxcDK_zJC-tVX6YCERGHXEpZz6YEPcefm_vmXsNbePUUZ7JAXpHdXjsnh5x7OFNgUY22Xi2rwI6cYzTClvMoxyiN9hd4ig364gzmVxs5mLuQQYqSwxcO8eUnY8D8k0W9Tj3o-WFWbJGlMs42rjT9Cgf1AsZxwet7SYAT1_FDERp6GX";

        const map = new Map({
            basemap: "arcgis-human-geography-dark" // Swapped to one of your aesthetic maps!
        });

        const view = new MapView({
            map: map,
            center: [-106.644568, 35.126358],
            zoom: 9,
            container: "viewDiv"
        });

        const searchWidget = new Search({
            view: view,
            container: "searchContainer"
        });

        // 3. The Magic: Listening for map clicks to add a diary entry
        view.on("click", (event) => {
            // Get the latitude and longitude of where the user clicked
            const lat = Math.round(event.mapPoint.latitude * 1000) / 1000;
            const lon = Math.round(event.mapPoint.longitude * 1000) / 1000;

            // This is where you would trigger a pop-up to type the journal entry!
            const createEntry = confirm(`Want to write a diary entry for this location?\nLat: ${lat}, Lon: ${lon}`);

            if(createEntry) {
                console.log(`Ready to save to database for coordinates: ${lat}, ${lon}`);
                // Future step: Send this data to Firebase!
            }
        });
    });
}