// Story/Journey Management

// Helper function to convert hex color to RGBA array
function hexToRgba(hex, alpha = 0.95) {
    // Ensure hex is a string and starts with #
    if (!hex || typeof hex !== 'string') {
        hex = '#a43855';  // Default color
    }
    if (!hex.startsWith('#')) {
        hex = '#' + hex;
    }
    
    try {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        
        // Validate the parsed values
        if (isNaN(r) || isNaN(g) || isNaN(b)) {
            return [164, 56, 85, alpha];  // Return default color if parsing failed
        }
        return [r, g, b, alpha];
    } catch (e) {
        return [164, 56, 85, alpha];  // Return default color on error
    }
}

// Opens the stories modal showing all stories and options to create, edit, or manage them
function openStoriesModal() {
    const listContainer = document.getElementById('storiesList');
    listContainer.innerHTML = '';
    if (stories.length === 0) {
        listContainer.innerHTML = '<p>No stories yet. Create one!</p>';
    } else {
        stories.forEach(story => {
            const div = document.createElement('div');
            div.className = 'story-list-item';
            
            // Ensure lineColor is a valid hex color
            let lineColor = story.lineColor || '#a43855';
            lineColor = lineColor.trim();
            if (!lineColor.startsWith('#')) {
                lineColor = '#' + lineColor;
            }
            
            // Create the color swatch element
            const colorSwatch = document.createElement('div');
            colorSwatch.style.width = '20px';
            colorSwatch.style.height = '20px';
            colorSwatch.style.backgroundColor = lineColor;  // Set directly via DOM
            colorSwatch.style.borderRadius = '3px';
            colorSwatch.style.border = '1px solid #ccc';
            
            // Create the content container
            const contentDiv = document.createElement('div');
            contentDiv.style.display = 'flex';
            contentDiv.style.alignItems = 'center';
            contentDiv.style.gap = '10px';
            contentDiv.style.flex = '1';
            
            contentDiv.appendChild(colorSwatch);
            
            const textDiv = document.createElement('div');
            textDiv.innerHTML = `
                <strong>${escapeHtml(story.title)}</strong><br>
                <small style="color: #666;">${story.totalMiles.toFixed(2)} miles • ${story.entryIds.length} stops</small>
            `;
            contentDiv.appendChild(textDiv);
            
            // Create the buttons container
            const buttonsDiv = document.createElement('div');
            buttonsDiv.innerHTML = `
                <button class="story-btn-small toggle-story-vis-btn" data-id="${story.id}">${story.visible ? '👁️ Hide' : '👁️‍🗨️ Show'}</button>
                <button class="story-btn-small edit-story-btn" data-id="${story.id}">Edit</button>
            `;
            
            div.appendChild(contentDiv);
            div.appendChild(buttonsDiv);
            listContainer.appendChild(div);
        });
    }
    document.getElementById('storiesModal').style.display = 'flex';
}

// Opens the story edit modal for creating a new story or editing an existing one, pre-filling data if editing
function openStoryEditModal(storyId) {
    currentEditingStoryId = storyId;
    currentStoryEditEntries = [];
    const titleInput = document.getElementById('storyTitleInput');

    if (!titleInput) {
        console.error('Story edit modal elements not found');
        return;
    }

    let colorValue = '#a43855';
    if (storyId) {
        const story = stories.find(s => s.id === storyId);
        if (story) {
            titleInput.value = story.title;
            colorValue = story.lineColor || '#a43855';
            currentStoryEditEntries = [...story.entryIds];
        }
    } else {
        titleInput.value = '';
        colorValue = '#a43855';
    }
    
    // Initialize color using the global function if available
    if (typeof applyColorToStory === 'function') {
        applyColorToStory(colorValue);
    }

    renderStoryEditLists();
    document.getElementById('storiesModal').style.display = 'none';
    document.getElementById('storyEditModal').style.display = 'flex';
}

// Renders the lists of available entries and selected entries in the story edit modal
function renderStoryEditLists() {
    const availableList = document.getElementById('availableEntriesList');
    const selectedList = document.getElementById('storyEntriesList');
    availableList.innerHTML = ''; selectedList.innerHTML = '';

    // Lock points: If a point is in a different story, none of its entries can be used!
    const lockedPointKeys = new Set();
    stories.forEach(s => {
        if (s.id !== currentEditingStoryId) {
            s.entryIds.forEach(eid => {
                const je = journalEntries.find(j => j.id === eid);
                if (je) lockedPointKeys.add(buildPointKey(je.lat, je.lon));
            });
        }
    });
    // For each journal entry, determine if it's selected for the current story, if it's locked due to being in another story, or if it's available to be added.
    journalEntries.forEach(entry => {
        const isLocked = lockedPointKeys.has(buildPointKey(entry.lat, entry.lon));
        if (currentStoryEditEntries.includes(entry.id)) {
            // It's selected, draw it in the drag and drop list
            const li = document.createElement('li');
            li.className = 'draggable-item';
            li.setAttribute('draggable', 'true');
            li.setAttribute('data-id', entry.id);
            li.innerHTML = `<span>☰ ${escapeHtml(entry.title)}</span><button class="story-btn-small remove-from-story-btn" data-id="${entry.id}">X</button>`;
            selectedList.appendChild(li);
        } else if (!isLocked) {
            // It's available
            const div = document.createElement('div');
            div.className = 'draggable-item';
            div.innerHTML = `<span>${escapeHtml(entry.title)}</span><button class="story-btn-small add-to-story-btn" data-id="${entry.id}">Add</button>`;
            availableList.appendChild(div);
        }
    });
}

// Adds an entry to the current story being edited by its ID, and then re-renders the lists to reflect the change
function moveEntryToStory(entryId) { 
    currentStoryEditEntries.push(entryId); 
    renderStoryEditLists(); 
}

// Removes an entry from the current story being edited by its ID
function removeEntryFromStory(entryId) { 
    currentStoryEditEntries = currentStoryEditEntries.filter(id => id !== entryId); 
    renderStoryEditLists(); 
}

// Saves the current story being edited, creating or updating it with the selected entries and title
function saveStory() {
    const title = document.getElementById('storyTitleInput').value.trim();
    const colorInput = document.getElementById('colorHexInput') || document.getElementById('storyLineColor');
    const colorHex = colorInput ? colorInput.value : '#a43855';
    if (!title) { alert("Give your story a title!"); return; }

    // Grab the actual DOM order from the dragged list
    const listItems = document.querySelectorAll('#storyEntriesList li');
    const orderedEntryIds = Array.from(listItems).map(li => parseInt(li.getAttribute('data-id'), 10));
    // Validate that there are at least 2 entries in the story
    if (orderedEntryIds.length < 2) { alert("A story must have at least 2 entries to draw a line! 🖤"); return; }
    // If we're editing an existing story, update its title, entryIds, and line color
    // If we're creating a new story, create it with the provided title, entryIds, and line color
    let story;
    if (currentEditingStoryId) {
        story = stories.find(s => s.id === currentEditingStoryId);
        if (!story) return;  // Safety check
        story.title = title;
        story.entryIds = orderedEntryIds;
        story.lineColor = colorHex;
    } else {
        story = {
            id: nextStoryId++, 
            title, 
            entryIds: orderedEntryIds, 
            visible: true, 
            totalMiles: 0, 
            graphicsLayer: new GraphicsLayerCtor(), 
            lineColor: colorHex
        };
        mapInstance.add(story.graphicsLayer);
        stories.push(story);
    }
    // After saving the story, we need to update the graphics on the map to reflect the new story composition
    updateStoryMapGraphics(story);
    document.getElementById('storyEditModal').style.display = 'none';
    openStoriesModal();
}

// Updates the map graphics for a story, including drawing the connecting line and calculating mileage
function updateStoryMapGraphics(story) {
    story.graphicsLayer.removeAll();
    const orderedMapPoints = [];
    const storyEntries = [];
    const affectedPointKeys = new Set();
    story.totalMiles = 0;
    //
    story.entryIds.forEach(eid => {
        const entry = journalEntries.find(je => je.id === eid);
        if (entry) {
            const pointKey = buildPointKey(entry.lat, entry.lon);
            affectedPointKeys.add(pointKey);
            const pointRecord = pointStore.get(pointKey);
            if (pointRecord && pointRecord.mapPoint) {
                orderedMapPoints.push(pointRecord.mapPoint);
            }
            storyEntries.push(entry);
        }
    });

    // Draw Line & Calculate Math
    let totalMiles = 0;
    const segmentMiles = [];
    // Only attempt to draw the line and calculate mileage if we have at least 2 points, and if the necessary ArcGIS modules are loaded
    if (orderedMapPoints.length >= 2 && PolylineCtor && geometryEngineModule) {
        const spatialReference = orderedMapPoints[0].spatialReference || { wkid: 4326 };
        const path = orderedMapPoints.map((point) => [point.x, point.y]);
        const polyline = new PolylineCtor({ paths: [path], spatialReference });
        totalMiles = geometryEngineModule.geodesicLength(polyline, "miles");
        story.totalMiles = Number.isFinite(totalMiles) ? totalMiles : 0;

        const lineGraphic = new GraphicCtor({
            geometry: polyline,
            symbol: { type: "simple-line", color: hexToRgba(story.lineColor || '#a43855'), width: 4, style: "solid" }
        });
        story.graphicsLayer.add(lineGraphic);

        // Get segment distances
        for (let i = 0; i < orderedMapPoints.length; i++) {
            let distFromPrev = 0, distToNext = 0;
            if (i > 0) {
                const prevToCurrent = new PolylineCtor({
                    paths: [[[orderedMapPoints[i - 1].x, orderedMapPoints[i - 1].y], [orderedMapPoints[i].x, orderedMapPoints[i].y]]],
                    spatialReference
                });
                distFromPrev = geometryEngineModule.geodesicLength(prevToCurrent, "miles");
            }
            if (i < orderedMapPoints.length - 1) {
                const currentToNext = new PolylineCtor({
                    paths: [[[orderedMapPoints[i].x, orderedMapPoints[i].y], [orderedMapPoints[i + 1].x, orderedMapPoints[i + 1].y]]],
                    spatialReference
                });
                distToNext = geometryEngineModule.geodesicLength(currentToNext, "miles");
            }
            segmentMiles.push({
                distFromPrev: Number.isFinite(distFromPrev) ? distFromPrev : 0,
                distToNext: Number.isFinite(distToNext) ? distToNext : 0
            });
        }
    }

    while (segmentMiles.length < storyEntries.length) {
        segmentMiles.push({ distFromPrev: 0, distToNext: 0 });
    }

    // Clear stale distance data from entries that are not in any story.
    const allStoryEntryIds = new Set();
    stories.forEach((storyItem) => {
        storyItem.entryIds.forEach((entryId) => allStoryEntryIds.add(entryId));
    });

    journalEntries.forEach((entry) => {
        if (!allStoryEntryIds.has(entry.id)) {
            delete entry.storyDistanceInfo;
        }
    });
    pointStore.forEach((pointRecord) => {
        pointRecord.entries.forEach((entry) => {
            if (!allStoryEntryIds.has(entry.id)) {
                delete entry.storyDistanceInfo;
            }
        });
    });

    // Attach mileage to both journal and point-store entries so popups/detail panels can always read it.
    storyEntries.forEach((entry, idx) => {
        const mileageInfo = segmentMiles[idx] || { distFromPrev: 0, distToNext: 0 };
        entry.storyDistanceInfo = mileageInfo;

        pointStore.forEach((pointRecord) => {
            const pointEntry = pointRecord.entries.find((item) => item.id === entry.id);
            if (pointEntry) {
                pointEntry.storyDistanceInfo = mileageInfo;
            }
        });
    });
    // Now that we've updated the story's graphics layer with the line and calculated the mileage info for each entry, 
    // we need to update only the graphics for points affected by this story change
    // to reflect any changes in story association or popup content
    affectedPointKeys.forEach((pointKey) => {
        const pointRecord = pointStore.get(pointKey);
        if (pointRecord && pointRecord.graphic) {
            updatePointGraphic(pointRecord);
        }
    });
}

// Toggles the visibility of a story's graphics layer on the map
function toggleStoryVisibility(storyId) {
    const story = stories.find(s => s.id === storyId);
    if (story) {
        story.visible = !story.visible;
        story.graphicsLayer.visible = story.visible;
        openStoriesModal();
    }
}
