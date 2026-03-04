/**
 * ============================================================
 * STORY/JOURNEY MANAGEMENT
 * ============================================================
 * 
 * This module handles creation and management of "stories" -
 * journeys that connect multiple diary entries across locations.
 * 
 * Key Features:
 * - Create stories from selected entries
 * - Draw polylines connecting entry points
 * - Calculate total distance and segment distances
 * - Color customization for story lines
 * - Drag-and-drop entry reordering
 * 
 * DEPENDENCIES: state.js, utils.js, popups.js, eventHandlers.js
 * 
 * ============================================================
 */

// ============================================================
// COLOR UTILITIES - Hex <-> RGBA Conversion
// ============================================================

/**
 * Converts hex color to RGBA array for ArcGIS symbol rendering.
 * 
 * @param {string} hex - Hex color code (e.g., "#a43855")
 * @param {number} alpha - Alpha value 0-1 (default 0.95)
 * @returns {[number, number, number, number]} RGBA array
 * 
 * EXAMPLE: hexToRgba("#a43855", 0.95) => [164, 56, 85, 0.95]
 */
function hexToRgba(hex, alpha = 0.95) {
    // Normalize hex input
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
        
        // Validate parsed values
        if (isNaN(r) || isNaN(g) || isNaN(b)) {
            return [164, 56, 85, alpha];  // Return default on error
        }
        return [r, g, b, alpha];
    } catch (e) {
        return [164, 56, 85, alpha];  // Return default on error
    }
}


// ============================================================
// STORY MODAL MANAGEMENT
// ============================================================

/**
 * Opens the stories modal showing all user stories.
 * Displays story info (color, mileage, entry count) and action buttons.
 */
function openStoriesModal() {
    const listContainer = document.getElementById('storiesList');
    listContainer.innerHTML = '';
    
    // Show message if no stories
    if (stories.length === 0) {
        listContainer.innerHTML = '<p>No stories yet. Create one!</p>';
    } else {
        // Create list item for each story
        stories.forEach(story => {
            const div = document.createElement('div');
            div.className = 'story-list-item';
            
            // Normalize story color
            let lineColor = story.lineColor || '#a43855';
            lineColor = lineColor.trim();
            if (!lineColor.startsWith('#')) {
                lineColor = '#' + lineColor;
            }
            
            // Create color swatch
            const colorSwatch = document.createElement('div');
            colorSwatch.style.width = '20px';
            colorSwatch.style.height = '20px';
            colorSwatch.style.backgroundColor = lineColor;
            colorSwatch.style.borderRadius = '3px';
            colorSwatch.style.border = '1px solid #ccc';
            
            // Create content div with color and info
            const contentDiv = document.createElement('div');
            contentDiv.style.display = 'flex';
            contentDiv.style.alignItems = 'center';
            contentDiv.style.gap = '10px';
            contentDiv.style.flex = '1';
            contentDiv.appendChild(colorSwatch);
            
            // Story title and stats
            const textDiv = document.createElement('div');
            textDiv.innerHTML = `
                <strong>${escapeHtml(story.title)}</strong><br>
                <small style="color: #666;">${story.totalMiles.toFixed(2)} miles • ${story.entryIds.length} stops</small>
            `;
            contentDiv.appendChild(textDiv);
            
            // Action buttons
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


/**
 * Opens the story editor modal for creating or editing a story.
 * Pre-fills data if editing, clears if creating new.
 * 
 * @param {number|null} storyId - Story ID if editing, null if creating
 */
function openStoryEditModal(storyId) {
    currentEditingStoryId = storyId;
    currentStoryEditEntries = [];
    const titleInput = document.getElementById('storyTitleInput');

    if (!titleInput) {
        console.error('Story edit modal elements not found');
        return;
    }

    let colorValue = '#a43855';
    
    // Pre-fill if editing existing story
    if (storyId) {
        const story = stories.find(s => s.id === storyId);
        if (story) {
            titleInput.value = story.title;
            colorValue = story.lineColor || '#a43855';
            currentStoryEditEntries = [...story.entryIds];
        }
    } else {
        // Clear for new story
        titleInput.value = '';
        colorValue = '#a43855';
    }
    
    // Apply color to picker
    if (typeof applyColorToStory === 'function') {
        applyColorToStory(colorValue);
    }

    renderStoryEditLists();
    document.getElementById('storiesModal').style.display = 'none';
    document.getElementById('storyEditModal').style.display = 'flex';
}


// ============================================================
// STORY EDITOR - Entry Selection & Reordering
// ============================================================

/**
 * Renders the two lists in the story editor:
 * 1. Available entries (can be added to story)
 * 2. Selected entries (currently in story, draggable to reorder)
 * 
 * Story entries form a "journey" - when combined, they draw a line
 * connecting all the locations on the map.
 */
function renderStoryEditLists() {
    const availableList = document.getElementById('availableEntriesList');
    const selectedList = document.getElementById('storyEntriesList');
    availableList.innerHTML = '';
    selectedList.innerHTML = '';

    // Identify which points are locked in other stories
    // A point is locked if it has entries in a different story
    const lockedPointKeys = new Set();
    stories.forEach(s => {
        if (s.id !== currentEditingStoryId) {
            s.entryIds.forEach(eid => {
                const je = journalEntries.find(j => j.id === eid);
                if (je) lockedPointKeys.add(buildPointKey(je.lat, je.lon));
            });
        }
    });
    
    // Categorize each journal entry
    journalEntries.forEach(entry => {
        const isLocked = lockedPointKeys.has(buildPointKey(entry.lat, entry.lon));
        
        if (currentStoryEditEntries.includes(entry.id)) {
            // Entry is selected - put in right list with drag handle
            const li = document.createElement('li');
            li.className = 'draggable-item';
            li.setAttribute('draggable', 'true');
            li.setAttribute('data-id', entry.id);
            li.innerHTML = `<span>☰ ${escapeHtml(entry.title)}</span><button class="story-btn-small remove-from-story-btn" data-id="${entry.id}">X</button>`;
            selectedList.appendChild(li);
        } else if (!isLocked) {
            // Entry is available - put in left list with add button
            const div = document.createElement('div');
            div.className = 'draggable-item';
            div.innerHTML = `<span>${escapeHtml(entry.title)}</span><button class="story-btn-small add-to-story-btn" data-id="${entry.id}">Add</button>`;
            availableList.appendChild(div);
        }
    });
}


/**
 * Adds an entry to the current story being edited.
 * 
 * @param {number} entryId - The entry to add
 */
function moveEntryToStory(entryId) { 
    currentStoryEditEntries.push(entryId); 
    renderStoryEditLists(); 
}


/**
 * Removes an entry from the current story being edited.
 * 
 * @param {number} entryId - The entry to remove
 */
function removeEntryFromStory(entryId) { 
    currentStoryEditEntries = currentStoryEditEntries.filter(id => id !== entryId); 
    renderStoryEditLists(); 
}


// ============================================================
// STORY SAVING & GRAPHICS UPDATE
// ============================================================

/**
 * Saves the current story being edited.
 * Creates new story or updates existing one.
 * Validates that story has at least 2 entries.
 * Updates map graphics with polyline and distance calculations.
 */
function saveStory() {
    const title = document.getElementById('storyTitleInput').value.trim();
    const colorInput = document.getElementById('colorHexInput') || document.getElementById('storyLineColor');
    const colorHex = colorInput ? colorInput.value : '#a43855';
    
    // Validate title
    if (!title) {
        alert("Give your story a title!");
        return;
    }

    // Get entry order from DOM (respects user's drag-and-drop reordering)
    const listItems = document.querySelectorAll('#storyEntriesList li');
    const orderedEntryIds = Array.from(listItems).map(li => parseInt(li.getAttribute('data-id'), 10));
    
    // Validate minimum 2 entries for line
    if (orderedEntryIds.length < 2) {
        alert("A story must have at least 2 entries to draw a line! 🖤");
        return;
    }
    
    // Create or update story
    let story;
    if (currentEditingStoryId) {
        // Update existing story
        story = stories.find(s => s.id === currentEditingStoryId);
        if (!story) return;
        story.title = title;
        story.entryIds = orderedEntryIds;
        story.lineColor = colorHex;
    } else {
        // Create new story
        story = {
            id: nextStoryId++, 
            title, 
            entryIds: orderedEntryIds, 
            visible: true, 
            totalMiles: 0, 
            graphicsLayer: new GraphicsLayerCtor(),  // Create new layer for this story
            lineColor: colorHex
        };
        mapInstance.add(story.graphicsLayer);
        stories.push(story);
    }
    
    // Update map graphics (draw line, calculate distances)
    updateStoryMapGraphics(story);
    
    // Close modals and refresh view
    document.getElementById('storyEditModal').style.display = 'none';
    openStoriesModal();
}


/**
 * Updates map graphics for a story: draws polyline and calculates distances.
 * 
 * @param {Object} story - Story to update
 * 
 * Handles:
 * - Converting ordered entry IDs to map coordinates
 * - Drawing polyline connecting all points
 * - Calculating total journey distance
 * - Calculating segment distances (entry to entry)
 * - Attaching distance info to entries for popup display
 * - Updating graphics layer visibility
 */
function updateStoryMapGraphics(story) {
    // Clear old graphics from layer
    story.graphicsLayer.removeAll();
    
    const orderedMapPoints = [];
    const storyEntries = [];
    const affectedPointKeys = new Set();
    story.totalMiles = 0;
    
    // Gather map points and entries in order
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

    let segmentMiles = [];
    
    // Draw line if we have at least 2 points and modules are loaded
    if (orderedMapPoints.length >= 2 && PolylineCtor && geometryEngineModule) {
        // Create polyline from ordered points
        const spatialReference = orderedMapPoints[0].spatialReference || { wkid: 4326 };
        const path = orderedMapPoints.map((point) => [point.x, point.y]);
        const polyline = new PolylineCtor({ paths: [path], spatialReference });
        
        // Calculate total distance
        story.totalMiles = geometryEngineModule.geodesicLength(polyline, "miles");
        story.totalMiles = Number.isFinite(story.totalMiles) ? story.totalMiles : 0;

        // Create and add line graphic
        const lineGraphic = new GraphicCtor({
            geometry: polyline,
            symbol: { 
                type: "simple-line", 
                color: hexToRgba(story.lineColor || '#a43855'), 
                width: 4, 
                style: "solid" 
            }
        });
        story.graphicsLayer.add(lineGraphic);

        // Calculate distance for each segment
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

    // Pad segment miles array if needed
    while (segmentMiles.length < storyEntries.length) {
        segmentMiles.push({ distFromPrev: 0, distToNext: 0 });
    }

    // Clear distance data from entries not in any story
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

    // Attach distance info to entries for popup display
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
    
    // Update graphics for affected points
    affectedPointKeys.forEach((pointKey) => {
        const pointRecord = pointStore.get(pointKey);
        if (pointRecord && pointRecord.graphic) {
            updatePointGraphic(pointRecord);
        }
    });
}


/**
 * Toggles visibility of a story's graphics on the map.
 * 
 * @param {number} storyId - Story to toggle
 */
function toggleStoryVisibility(storyId) {
    const story = stories.find(s => s.id === storyId);
    if (story) {
        story.visible = !story.visible;
        story.graphicsLayer.visible = story.visible;
        openStoriesModal();
    }
}

