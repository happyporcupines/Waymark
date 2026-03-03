// Story/Journey Management

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
            div.innerHTML = `
                <div>
                    <strong>${escapeHtml(story.title)}</strong><br>
                    <small style="color: #666;">${story.totalMiles.toFixed(2)} miles • ${story.entryIds.length} stops</small>
                </div>
                <div>
                    <button class="story-btn-small toggle-story-vis-btn" data-id="${story.id}">${story.visible ? '👁️ Hide' : '👁️‍🗨️ Show'}</button>
                    <button class="story-btn-small edit-story-btn" data-id="${story.id}">Edit</button>
                </div>
            `;
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

    if (storyId) {
        const story = stories.find(s => s.id === storyId);
        titleInput.value = story.title;
        currentStoryEditEntries = [...story.entryIds];
    } else {
        titleInput.value = '';
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
    if (!title) { alert("Give your story a title!"); return; }

    // Grab the actual DOM order from the dragged list
    const listItems = document.querySelectorAll('#storyEntriesList li');
    const orderedEntryIds = Array.from(listItems).map(li => parseInt(li.getAttribute('data-id'), 10));
    // Validate that there are at least 2 entries in the story
    if (orderedEntryIds.length < 2) { alert("A story must have at least 2 entries to draw a line! 🖤"); return; }
    // If we're editing an existing story, update its title and entryIds
    // if we're creating a new story, create it with the provided title and entryIds, add a new graphics layer for it on the map,
    //  and push it to the stories array
    let story;
    if (currentEditingStoryId) {
        story = stories.find(s => s.id === currentEditingStoryId);
        story.title = title;
        story.entryIds = orderedEntryIds;
    } else {
        story = {
            id: nextStoryId++, title, entryIds: orderedEntryIds, visible: true, totalMiles: 0, graphicsLayer: new GraphicsLayerCtor()
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
    const orderedPoints = [];
    const storyEntries = [];
    story.totalMiles = 0;
    //
    story.entryIds.forEach(eid => {
        const entry = journalEntries.find(je => je.id === eid);
        if (entry) {
            const pointKey = buildPointKey(entry.lat, entry.lon);
            const pointRecord = pointStore.get(pointKey);
            if (pointRecord && pointRecord.mapPoint) {
                orderedPoints.push([pointRecord.mapPoint.longitude, pointRecord.mapPoint.latitude]);
            } else {
                orderedPoints.push([entry.lon, entry.lat]);
            }
            storyEntries.push(entry);
        }
    });

    // Draw Line & Calculate Math
    let totalMiles = 0;
    const segmentMiles = [];
    // Only attempt to draw the line and calculate mileage if we have at least 2 points, and if the necessary ArcGIS modules are loaded
    if (orderedPoints.length >= 2 && PolylineCtor && geometryEngineModule) {
        const polyline = new PolylineCtor({ paths: [orderedPoints], spatialReference: { wkid: 4326 } });
        totalMiles = geometryEngineModule.geodesicLength(polyline, "miles");
        story.totalMiles = Number.isFinite(totalMiles) ? totalMiles : 0;

        const lineGraphic = new GraphicCtor({
            geometry: polyline,
            symbol: { type: "simple-line", color: [164, 56, 85, 0.95], width: 4, style: "solid" }
        });
        story.graphicsLayer.add(lineGraphic);

        // Get segment distances
        for (let i = 0; i < orderedPoints.length; i++) {
            let distFromPrev = 0, distToNext = 0;
            if (i > 0) {
                distFromPrev = geometryEngineModule.geodesicLength(new PolylineCtor({ paths: [[orderedPoints[i-1], orderedPoints[i]]], spatialReference: { wkid: 4326 } }), "miles");
            }
            if (i < orderedPoints.length - 1) {
                distToNext = geometryEngineModule.geodesicLength(new PolylineCtor({ paths: [[orderedPoints[i], orderedPoints[i+1]]], spatialReference: { wkid: 4326 } }), "miles");
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

    // Attach math to entries and re-render points into the proper layers!
    storyEntries.forEach((entry, idx) => { entry.storyDistanceInfo = segmentMiles[idx]; });
    // Now that we've updated the story's graphics layer with the line and calculated the mileage info for each entry, 
    // we need to loop through all points on the map and update their graphics to reflect any changes in story association
    // or popup content (like showing mileage info in the popup if they're part of a story)
    pointStore.forEach((pointRecord) => {
        if (!pointRecord.graphic) return;

        let pointStory = null;
        stories.forEach(s => {
            s.entryIds.forEach(eid => {
                const je = journalEntries.find(j => j.id === eid);
                if (je && buildPointKey(je.lat, je.lon) === pointRecord.pointKey) pointStory = s;
            });
        });

        // Trigger the update function we modified earlier to fix popups and layers
        updatePointGraphic(pointRecord);
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
