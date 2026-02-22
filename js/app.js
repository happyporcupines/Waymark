// 1. App state
let mapInitialized = false;
let isGuestMode = false;
let guestEntryWarningShown = false;

let journalEntries = [];
let currentClickCoords = null;
let currentPointKey = null;
let currentEditingEntryId = null;

let nextEntryId = 1;
const pointStore = new Map();

let appView = null;
let appGraphicsLayer = null;
let GraphicCtor = null;

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
        return;
    }

    if (target.closest('#cancelEntryBtn')) {
        closeEntryModal();
        return;
    }

    if (target.closest('#saveEntryBtn')) {
        saveEntry();
        return;
    }

    if (target.closest('#closeDetailBtn')) {
        closeDetailPanel();
        return;
    }

    const editorBtn = target.closest('.editor-btn');
    if (editorBtn) {
        applyEditorCommand(editorBtn.getAttribute('data-cmd'));
    }
});

function roundCoord(value) {
    return Math.round(value * 1000) / 1000;
}

function buildPointKey(lat, lon) {
    return `${roundCoord(lat)},${roundCoord(lon)}`;
}

function htmlToText(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return (temp.textContent || '').trim();
}

function truncateText(text, maxLength = 180) {
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength)}...`;
}

function getOrCreatePointRecord(coords) {
    const pointKey = buildPointKey(coords.lat, coords.lon);
    if (!pointStore.has(pointKey)) {
        pointStore.set(pointKey, {
            pointKey,
            lat: coords.lat,
            lon: coords.lon,
            mapPoint: coords.mapPoint,
            entries: [],
            graphic: null
        });
    }
    return pointStore.get(pointKey);
}

function getLatestEntry(pointRecord) {
    if (!pointRecord || pointRecord.entries.length === 0) {
        return null;
    }
    return pointRecord.entries[pointRecord.entries.length - 1];
}

function updatePointGraphic(pointRecord) {
    const latestEntry = getLatestEntry(pointRecord);
    if (!latestEntry) {
        return;
    }

    const preview = truncateText(latestEntry.textPlain, 180);

    const popupTemplate = {
        title: latestEntry.title,
        content: `
            <div>
                <p>${preview}</p>
                ${latestEntry.textPlain.length > 180 ? '<p><em>Use "Read full entry" below to view everything.</em></p>' : ''}
            </div>
        `,
        actions: [
            { title: 'Read full entry', id: 'read-full-entry', className: 'esri-icon-documentation' },
            { title: 'Edit entry', id: 'edit-entry', className: 'esri-icon-edit' },
            { title: 'Add new entry to same point', id: 'add-same-point', className: 'esri-icon-plus-circled' }
        ]
    };

    if (!pointRecord.graphic) {
        pointRecord.graphic = new GraphicCtor({
            geometry: pointRecord.mapPoint,
            symbol: {
                type: 'simple-marker',
                color: [164, 56, 85],
                outline: { color: [255, 255, 255], width: 2 }
            },
            attributes: {
                pointKey: pointRecord.pointKey,
                latestEntryId: latestEntry.id,
                title: latestEntry.title
            },
            popupTemplate
        });
        appGraphicsLayer.add(pointRecord.graphic);
    } else {
        pointRecord.graphic.attributes = {
            pointKey: pointRecord.pointKey,
            latestEntryId: latestEntry.id,
            title: latestEntry.title
        };
        pointRecord.graphic.popupTemplate = popupTemplate;
    }
}

function openEntryModal(mode, pointRecord, entryToEdit) {
    const titleInput = document.getElementById('entryTitle');
    const editor = document.getElementById('entryEditor');
    const modal = document.getElementById('entryModal');
    const modalTitle = document.getElementById('entryModalTitle');

    currentPointKey = pointRecord.pointKey;
    currentEditingEntryId = entryToEdit ? entryToEdit.id : null;

    document.getElementById('entryCoords').innerText = `Location: ${pointRecord.lat}, ${pointRecord.lon}`;
    modalTitle.innerText = mode === 'edit' ? 'Edit Diary Entry ✏️' : 'New Diary Entry 📓';

    if (entryToEdit) {
        titleInput.value = entryToEdit.title;
        editor.innerHTML = entryToEdit.textHtml;
    } else {
        titleInput.value = '';
        editor.innerHTML = '';
    }

    modal.style.display = 'flex';
}

function closeEntryModal() {
    document.getElementById('entryModal').style.display = 'none';
    document.getElementById('entryTitle').value = '';
    document.getElementById('entryEditor').innerHTML = '';
    currentEditingEntryId = null;
}

function upsertGuestArrayEntry(entry, pointRecord) {
    if (!isGuestMode) {
        return;
    }

    const existingIndex = journalEntries.findIndex((item) => item.id === entry.id);
    const guestEntry = {
        id: entry.id,
        title: entry.title,
        text: entry.textPlain,
        lat: pointRecord.lat,
        lon: pointRecord.lon
    };

    if (existingIndex >= 0) {
        journalEntries[existingIndex] = guestEntry;
    } else {
        journalEntries.push(guestEntry);
    }
}

function updateSidebarList() {
    const listContainer = document.getElementById('entriesList');
    listContainer.innerHTML = '';

    if (journalEntries.length === 0) {
        listContainer.innerHTML = '<p>No entries yet. Tap the map to create one!</p>';
        return;
    }

    journalEntries.forEach((entry) => {
        const entryDiv = document.createElement('div');
        entryDiv.style.borderBottom = '1px solid #ccc';
        entryDiv.style.padding = '10px 0';
        entryDiv.innerHTML = `
            <h4 style="margin: 0 0 5px 0; color: #a43855;">${entry.title}</h4>
            <p style="margin: 0; font-size: 0.9em;">${truncateText(entry.text, 120)}</p>
            <small style="color: #666;">Lat: ${entry.lat}, Lon: ${entry.lon}</small>
        `;
        listContainer.appendChild(entryDiv);
    });
}

function openDetailPanel(pointRecord, entry) {
    const detailPanel = document.getElementById('entryDetailPanel');
    document.getElementById('detailTitle').innerText = entry.title;
    document.getElementById('detailMeta').innerText = `Location: ${pointRecord.lat}, ${pointRecord.lon}`;
    document.getElementById('detailContent').innerHTML = entry.textHtml;
    detailPanel.classList.add('active');
}

function closeDetailPanel() {
    document.getElementById('entryDetailPanel').classList.remove('active');
}

function findEntryById(pointRecord, entryId) {
    return pointRecord.entries.find((entry) => entry.id === entryId) || getLatestEntry(pointRecord);
}

function saveEntry() {
    if (!currentPointKey || !pointStore.has(currentPointKey)) {
        return;
    }

    const pointRecord = pointStore.get(currentPointKey);
    const title = document.getElementById('entryTitle').value.trim();
    const textHtml = document.getElementById('entryEditor').innerHTML.trim();
    const textPlain = htmlToText(textHtml);

    if (!title || !textPlain) {
        alert("Don't be lazy, fill out both the title and your memory! 🖤");
        return;
    }

    if (currentEditingEntryId) {
        const editingEntry = pointRecord.entries.find((entry) => entry.id === currentEditingEntryId);
        if (editingEntry) {
            editingEntry.title = title;
            editingEntry.textHtml = textHtml;
            editingEntry.textPlain = textPlain;
            upsertGuestArrayEntry(editingEntry, pointRecord);
        }
    } else {
        const newEntry = {
            id: nextEntryId++,
            title,
            textHtml,
            textPlain,
            createdAt: Date.now()
        };
        pointRecord.entries.push(newEntry);
        upsertGuestArrayEntry(newEntry, pointRecord);
    }

    updatePointGraphic(pointRecord);
    updateSidebarList();
    closeEntryModal();
}

function applyEditorCommand(command) {
    const editor = document.getElementById('entryEditor');
    editor.focus();

    if (command === 'alphaList') {
        document.execCommand('insertOrderedList', false);
        const selection = window.getSelection();
        if (selection && selection.anchorNode) {
            const parent = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
            const orderedList = parent ? parent.closest('ol') : null;
            if (orderedList) {
                orderedList.style.listStyleType = 'upper-alpha';
            }
        }
        return;
    }

    if (command === 'checkList') {
        document.execCommand('insertHTML', false, '<ul style="list-style-type:none;"><li>☐ Checklist item</li></ul>');
        return;
    }

    document.execCommand(command, false);
}

// 2. Esri Map Initialization
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
        'esri/layers/GraphicsLayer'
    ], (Map, MapView, esriConfig, Search, Locate, BasemapGallery, Expand, Graphic, GraphicsLayer) => {
        esriConfig.apiKey = 'AAPTxy8BH1VEsoebNVZXo8HurP99AuF0u6hFXE5XsMHKuzBSGN5LvVSYilawxafx85hn9PCGXebaJHWlitVBT5zeCUaAyEvqj1BxcDK_zJC-tVX6YCERGHXEpZz6YEPcefm_vmXsNbePUUZ7JAXpHdXjsnh5x7OFNgUY22Xi2rwI6cYzTClvMoxyiN9hd4ig364gzmVxs5mLuQQYqSwxcO8eUnY8D8k0W9Tj3o-WFWbJGlMs42rjT9Cgf1AsZxwet7SYAT1_FDERp6GX';

        GraphicCtor = Graphic;
        appGraphicsLayer = new GraphicsLayer();

        const map = new Map({
            basemap: 'arcgis-human-geography-dark',
            layers: [appGraphicsLayer]
        });

        const view = new MapView({
            map,
            center: [-106.644568, 35.126358],
            zoom: 9,
            container: 'viewDiv'
        });

        appView = view;

        new Search({ view, container: 'searchContainer' });

        const locateBtn = new Locate({ view });
        const basemapGallery = new BasemapGallery({ view });

        const widgetRow = document.createElement('div');
        widgetRow.className = 'map-widget-row';

        const locateContainer = document.createElement('div');
        const basemapContainer = document.createElement('div');
        widgetRow.appendChild(locateContainer);
        widgetRow.appendChild(basemapContainer);

        locateBtn.container = locateContainer;

        new Expand({
            view,
            content: basemapGallery,
            container: basemapContainer,
            autoCollapse: true
        });

        view.ui.add(widgetRow, { position: 'bottom-right', index: 0 });

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

        view.popup.on('trigger-action', (popupEvent) => {
            const selectedGraphic = view.popup.selectedFeature;
            if (!selectedGraphic) {
                return;
            }

            const pointKey = selectedGraphic.attributes.pointKey;
            if (!pointStore.has(pointKey)) {
                return;
            }

            const pointRecord = pointStore.get(pointKey);
            const selectedEntry = findEntryById(pointRecord, selectedGraphic.attributes.latestEntryId);

            if (!selectedEntry) {
                return;
            }

            if (popupEvent.action.id === 'read-full-entry') {
                openDetailPanel(pointRecord, selectedEntry);
            }

            if (popupEvent.action.id === 'edit-entry') {
                openEntryModal('edit', pointRecord, selectedEntry);
            }

            if (popupEvent.action.id === 'add-same-point') {
                currentClickCoords = {
                    lat: pointRecord.lat,
                    lon: pointRecord.lon,
                    mapPoint: pointRecord.mapPoint
                };
                openEntryModal('new', pointRecord, null);
            }
        });

        view.on('click', async (event) => {
            const hitResponse = await view.hitTest(event);
            const graphicResult = hitResponse.results.find((result) => result.graphic.layer === appGraphicsLayer);

            if (graphicResult) {
                view.popup.open({
                    features: [graphicResult.graphic],
                    location: event.mapPoint
                });
                return;
            }

            if (isGuestMode && !guestEntryWarningShown) {
                alert('Guest mode note: diary entries are stored temporarily and will be deleted if you refresh the page.');
                guestEntryWarningShown = true;
            }

            currentClickCoords = {
                lat: roundCoord(event.mapPoint.latitude),
                lon: roundCoord(event.mapPoint.longitude),
                mapPoint: event.mapPoint
            };

            const pointRecord = getOrCreatePointRecord(currentClickCoords);
            openEntryModal('new', pointRecord, null);
        });
    });
}