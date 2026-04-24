/**
 * ============================================================================
 * STORIES.JS - Story/Journey Management
 * ============================================================================
 * 
 * This file implements the "story" feature, which connects multiple diary entries
 * into a cohesive journey narrative. Stories provide:
 * 
 * - Visual connection: Polylines drawn between entry points on the map
 * - Distance calculations: Geodesic distances between each entry
 * - Organization: Entries can be reordered to form a sequential narrative
 * - Customization: Each story has a unique color for its connecting line
 * - Layer management: Each story gets its own graphics layer for visibility control
 * 
 * KEY CONCEPTS:
 * 
 * Point Locking:
 * - Once an entry at a geographic point is added to a story, ALL entries at that
 *   point are "locked" to that story
 * - This prevents visual clutter and maintains narrative coherence
 * - Users must remove from one story before adding to another
 * 
 * Distance Calculations:
 * - Uses ArcGIS geometryEngine for accurate geodesic (curved earth) distances
 * - Calculates both total journey distance and segment distances
 * - Each entry stores: distFromPrev and distToNext
 * 
 * Entry Ordering:
 * - Uses HTML5 drag & drop for intuitive reordering
 * - Order determines both visual path and distance sequence
 */

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Converts hexadecimal color to RGBA array for ArcGIS symbol styling
 * 
 * ArcGIS expects colors as [r, g, b, a] arrays where:
 * - r, g, b are 0-255
 * - a (alpha/opacity) is 0-1
 * 
 * This function handles:
 * - Malformed hex codes (defaults to burgundy #a43855)
 * - Missing # prefix
 * - Invalid hex values
 * - Parsing errors
 * 
 * @param {string} hex - Hex color code (e.g., "#a43855" or "a43855")
 * @param {number} [alpha=0.95] - Opacity value from 0 (transparent) to 1 (opaque)
 * @returns {Array<number>} RGBA array: [r, g, b, alpha]
 * 
 * @example
 * hexToRgba('#ff5733', 0.8) // Returns: [255, 87, 51, 0.8]
 * hexToRgba('invalid', 1.0) // Returns: [164, 56, 85, 1.0] (default burgundy)
 */
function hexToRgba(hex, alpha = 0.95) {
    // Ensure hex is a string and starts with #
    if (!hex || typeof hex !== 'string') {
        hex = '#a43855';  // Default burgundy color
    }
    if (!hex.startsWith('#')) {
        hex = '#' + hex;  // Add # prefix if missing
    }
    
    try {
        // Parse two-character hex segments into decimal RGB values (0-255)
        const r = parseInt(hex.slice(1, 3), 16);  // Characters 1-2: red
        const g = parseInt(hex.slice(3, 5), 16);  // Characters 3-4: green
        const b = parseInt(hex.slice(5, 7), 16);  // Characters 5-6: blue
        
        // Validate the parsed values are actual numbers
        if (isNaN(r) || isNaN(g) || isNaN(b)) {
            return [164, 56, 85, alpha];  // Return default burgundy if parsing failed
        }
        return [r, g, b, alpha];
    } catch (e) {
        return [164, 56, 85, alpha];  // Return default burgundy on error
    }
}

// ============================================================================
// STORY LIST MODAL
// ============================================================================

/**
 * Opens the main stories modal displaying all created stories
 * 
 * This modal provides an overview of all journeys with:
 * - Story title and color swatch
 * - Total distance in miles
 * - Number of entry stops
 * - Toggle visibility button (show/hide on map)
 * - Edit button (opens story editor)
 * 
 * Empty state:
 * Shows "No stories yet. Create one!" if stories array is empty
 * 
 * Each story is rendered with:
 * - Color swatch showing the line color
 * - Summary stats (distance and stop count)
 * - Action buttons for visibility and editing
 * 
 * @example
 * // Called when user clicks "My Stories" button:
 * openStoriesModal();
 */

function openStoriesModal() {
    const listContainer = document.getElementById('storiesList');
    listContainer.innerHTML = '';
    
    // EMPTY STATE: No stories created yet
    if (stories.length === 0) {
        listContainer.innerHTML = '<p>No stories yet. Create one!</p>';
    } 
    // RENDER STORIES: Build list items for each story
    else {
        stories.forEach(story => {
            const div = document.createElement('div');
            div.className = 'story-list-item';
            
            // Normalize the line color to ensure it has # prefix
            let lineColor = story.lineColor || '#a43855';
            lineColor = lineColor.trim();
            if (!lineColor.startsWith('#')) {
                lineColor = '#' + lineColor;
            }
            
            // BUILD COLOR SWATCH: Small colored square showing the story's line color
            const colorSwatch = document.createElement('div');
            colorSwatch.style.width = '20px';
            colorSwatch.style.height = '20px';
            colorSwatch.style.backgroundColor = lineColor;  // Apply the story's color
            colorSwatch.style.borderRadius = '3px';
            colorSwatch.style.border = '1px solid #ccc';
            
            // BUILD CONTENT CONTAINER: Flex layout with swatch + text
            const contentDiv = document.createElement('div');
            contentDiv.style.display = 'flex';
            contentDiv.style.alignItems = 'center';
            contentDiv.style.gap = '10px';
            contentDiv.style.flex = '1';
            
            contentDiv.appendChild(colorSwatch);
            
            // ADD STORY INFO: Title and summary statistics
            const textDiv = document.createElement('div');
            textDiv.innerHTML = `
                <strong>${escapeHtml(story.title)}</strong><br>
                <small style="color: #666;">${story.totalMiles.toFixed(2)} miles • ${story.entryIds.length} stops</small>
            `;
            contentDiv.appendChild(textDiv);
            
            // BUILD ACTION BUTTONS: Visibility toggle and edit button
            const buttonsDiv = document.createElement('div');
            buttonsDiv.innerHTML = `
                <button class="story-btn-small toggle-story-vis-btn" data-id="${story.id}">${story.visible ? '👁️ Hide' : '👁️‍🗨️ Show'}</button>
                <button class="story-btn-small edit-story-btn" data-id="${story.id}">Edit</button>
            `;
            
            // ASSEMBLE LIST ITEM: Add content and buttons to the container
            div.appendChild(contentDiv);
            div.appendChild(buttonsDiv);
            listContainer.appendChild(div);
        });
    }
    
    // Show the stories modal
    document.getElementById('storiesModal').style.display = 'flex';
}

// ============================================================================
// STORY EDIT MODAL
// ============================================================================

/**
 * Opens the story editor modal for creating new or editing existing stories
 * 
 * This modal provides:
 * - Story title input
 * - Color picker for line customization
 * - Two-panel entry selector:
 *   - Available entries (can be added to story)
 *   - Selected entries (currently in story, drag to reorder)
 * 
 * CREATE MODE (storyId = null):
 * - Clear title field
 * - Reset to default burgundy color
 * - Empty selected entries list
 * 
 * EDIT MODE (storyId provided):
 * - Pre-fill title from existing story
 * - Set color picker to story's color
 * - Populate selected entries list
 * 
 * Point locking logic:
 * - If a point is already in another story, all its entries are "locked"
 * - Locked entries don't appear in available list
 * - Prevents multiple stories from sharing the same geographic point
 * 
 * @param {number|null} storyId - Story ID to edit, or null for new story
 * 
 * @example
 * // Create new story:
 * openStoryEditModal(null);
 * 
 * // Edit existing story:
 * openStoryEditModal(42);
 */

function openStoryEditModal(storyId) {
    // Set global editing state
    currentEditingStoryId = storyId;
    currentStoryEditEntries = [];
    const titleInput = document.getElementById('storyTitleInput');

    if (!titleInput) {
        console.error('Story edit modal elements not found');
        return;
    }

    // Default to burgundy color
    let colorValue = '#a43855';
    
    // EDIT MODE: Load existing story data
    if (storyId) {
        const story = stories.find(s => s.id === storyId);
        if (story) {
            titleInput.value = story.title;
            colorValue = story.lineColor || '#a43855';
            currentStoryEditEntries = [...story.entryIds];  // Clone array
        }
    } 
    // CREATE MODE: Clear fields
    else {
        titleInput.value = '';
        colorValue = '#a43855';
    }
    
    // Initialize color picker with current/default color
    if (typeof applyColorToStory === 'function') {
        applyColorToStory(colorValue);
    }

    // Render the two-panel entry lists
    renderStoryEditLists();
    
    // Swap modals: hide stories list, show editor
    document.getElementById('storiesModal').style.display = 'none';
    document.getElementById('storyEditModal').style.display = 'flex';
}

/**
 * Renders the two-panel entry selection interface in story editor
 * 
 * Left panel (Available Entries):
 * - Shows entries that can be added to the story
 * - Excludes entries from other stories (point locking)
 * - Each has an "Add" button
 * 
 * Right panel (Selected Entries):
 * - Shows entries currently in the story
 * - Draggable for reordering (HTML5 drag & drop)
 * - Each has an "X" remove button
 * - Order determines the story path sequence
 * 
 * POINT LOCKING MECHANISM:
 * - Build set of "locked" point keys from other stories
 * - Any entry at a locked point is excluded from available list
 * - Prevents geographic points from belonging to multiple stories
 * 
 * The rendering is complete replacement (not incremental) which is
 * simple and sufficient for typical diary entry counts.
 */

function renderStoryEditLists() {
    const availableList = document.getElementById('availableEntriesList');
    const selectedList = document.getElementById('storyEntriesList');
    availableList.innerHTML = ''; 
    selectedList.innerHTML = '';

    // POINT LOCKING: Build set of point keys that are already in other stories
    const lockedPointKeys = new Set();
    stories.forEach(s => {
        // Skip the story we're currently editing (its points aren't "locked")
        if (s.id !== currentEditingStoryId) {
            s.entryIds.forEach(eid => {
                const je = journalEntries.find(j => j.id === eid);
                if (je) lockedPointKeys.add(buildPointKey(je.lat, je.lon));
            });
        }
    });
    
    // CATEGORIZE ENTRIES: Sort each entry into selected, locked, or available
    journalEntries.forEach(entry => {
        const isLocked = lockedPointKeys.has(buildPointKey(entry.lat, entry.lon));
        
        // SELECTED: Entry is in the current story being edited
        if (currentStoryEditEntries.includes(entry.id)) {
            const li = document.createElement('li');
            li.className = 'draggable-item';
            li.setAttribute('draggable', 'true');  // Enable HTML5 drag & drop
            li.setAttribute('data-id', entry.id);
            li.innerHTML = `<span>☰ ${escapeHtml(entry.title)}</span><button class="story-btn-small remove-from-story-btn" data-id="${entry.id}">X</button>`;
            selectedList.appendChild(li);
        } 
        // AVAILABLE: Entry is not locked and not already selected
        else if (!isLocked) {
            const div = document.createElement('div');
            div.className = 'draggable-item';
            div.innerHTML = `<span>${escapeHtml(entry.title)}</span><button class="story-btn-small add-to-story-btn" data-id="${entry.id}">Add</button>`;
            availableList.appendChild(div);
        }
        // LOCKED entries (in other stories) are simply not rendered at all
    });
}

// ============================================================================
// STORY ENTRY MANAGEMENT
// ============================================================================

/**
 * Adds an entry to the story being edited
 * 
 * Appends the entry ID to the currentStoryEditEntries array and
 * re-renders the lists to move the entry from available to selected.
 * 
 * The entry appears at the end of the selected list. User can drag
 * to reorder afterward.
 * 
 * @param {number} entryId - ID of entry to add to story
 */

function moveEntryToStory(entryId) { 
    currentStoryEditEntries.push(entryId); 
    renderStoryEditLists(); 
}

/**
 * Removes an entry from the story being edited
 * 
 * Filters out the entry ID from currentStoryEditEntries and 
 * re-renders the lists to move the entry from selected back to available.
 * 
 * @param {number} entryId - ID of entry to remove from story
 */

function removeEntryFromStory(entryId) { 
    currentStoryEditEntries = currentStoryEditEntries.filter(id => id !== entryId); 
    renderStoryEditLists(); 
}

// ============================================================================
// STORY SAVE OPERATION
// ============================================================================

/**
 * Saves the story being edited (create new or update existing)
 * 
 * This is the main story save function that handles:
 * 
 * VALIDATION:
 * - Title must not be empty
 * - Must have at least 2 entries (need 2 points to draw a line)
 * 
 * ENTRY ORDER:
 * - Reads DOM order from the selected entries list
 * - This respects user's drag & drop reordering
 * - Order determines path direction and distance calculations
 * 
 * CREATE vs UPDATE:
 * - If currentEditingStoryId exists: Update existing story
 * - If null: Create new story with fresh graphics layer
 * 
 * POST-SAVE:
 * - Calls updateStoryMapGraphics() to draw line and calc distances
 * - Closes editor modal
 * - Reopens stories list modal
 * 
 * @fires alert - Shows error if validation fails
 * @fires updateStoryMapGraphics - Renders the story on the map
 * @fires openStoriesModal - Returns to story list view
 */

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
    if (typeof queueSupabaseSync === 'function') {
        queueSupabaseSync();
    }
    document.getElementById('storyEditModal').style.display = 'none';
    openStoriesModal();
}

// ============================================================================
// STORY MAP RENDERING & DISTANCE CALCULATIONS
// ============================================================================

/**
 * Updates all map graphics for a story (THE CORE STORY RENDERING FUNCTION)
 * 
 * This complex function handles:
 * 
 * 1. GRAPHICS LAYER CLEANUP:
 *    - Clears all existing graphics from story's layer
 *    - Prepares for fresh rendering
 * 
 * 2. DATA GATHERING:
 *    - Converts entry IDs to map points
 *    - Tracks affected point keys for graphic updates
 *    - Builds ordered array of entries
 * 
 * 3. LINE DRAWING:
 *    - Creates polyline connecting all entry points
 *    - Uses story's custom color
 *    - Adds to story's graphics layer
 * 
 * 4. DISTANCE CALCULATIONS:
 *    - Total journey distance (geodesic)
 *    - Segment distances (entry to entry)
 *    - Stores distances on each entry
 * 
 * 5. DISTANCE INFO CLEANUP:
 *    - Removes stale distance data from entries not in any story
 *    - Ensures data consistency
 * 
 * 6. POINT GRAPHIC UPDATES:
 *    - Updates markers for affected points
 *    - Changes color to black (story) from burgundy (standalone)
 *    - Updates popup templates with story info
 * 
 * GEODESIC CALCULATIONS:
 * Uses ArcGIS geometryEngine for accurate curved-earth distances.
 * Results are in miles (configurable in geodesicLength call).
 * 
 * @param {Object} story - Story object with id, entryIds, graphicsLayer, lineColor
 */
function updateStoryMapGraphics(story) {
    // STEP 1: Clear existing graphics from this story's layer
    story.graphicsLayer.removeAll();
    
    // Initialize data structures
    const orderedMapPoints = [];     // ArcGIS Point objects in story order
    const storyEntries = [];          // Full entry objects in story order
    const affectedPointKeys = new Set();  // Points that need graphic updates
    story.totalMiles = 0;
    
    // STEP 2: GATHER DATA - Convert entry IDs to map points and entries
    story.entryIds.forEach(eid => {
        const entry = journalEntries.find(je => je.id === eid);
        if (entry) {
            const pointKey = buildPointKey(entry.lat, entry.lon);
            affectedPointKeys.add(pointKey);  // Track for later graphic update
            const pointRecord = pointStore.get(pointKey);
            if (pointRecord && pointRecord.mapPoint) {
                orderedMapPoints.push(pointRecord.mapPoint);
            }
            storyEntries.push(entry);
        }
    });

    // STEP 3: DRAW LINE & CALCULATE DISTANCES
    let totalMiles = 0;
    const segmentMiles = [];  // Distance info for each entry
    
    // Only proceed if we have at least 2 points and required ArcGIS modules
    if (orderedMapPoints.length >= 2 && PolylineCtor && geometryEngineModule) {
        const spatialReference = orderedMapPoints[0].spatialReference || { wkid: 4326 };
        
        // Build polyline path from ordered points
        const path = orderedMapPoints.map((point) => [point.x, point.y]);
        const polyline = new PolylineCtor({ paths: [path], spatialReference });
        
        // Calculate total journey distance using geodesic (curved earth) math
        totalMiles = geometryEngineModule.geodesicLength(polyline, "miles");
        story.totalMiles = Number.isFinite(totalMiles) ? totalMiles : 0;

        // Create and add the line graphic to the story's layer
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

        // CALCULATE SEGMENT DISTANCES: Distance from prev and to next for each entry
        for (let i = 0; i < orderedMapPoints.length; i++) {
            let distFromPrev = 0, distToNext = 0;
            
            // Distance from previous entry (skip first entry)
            if (i > 0) {
                const prevToCurrent = new PolylineCtor({
                    paths: [[[orderedMapPoints[i - 1].x, orderedMapPoints[i - 1].y], [orderedMapPoints[i].x, orderedMapPoints[i].y]]],
                    spatialReference
                });
                distFromPrev = geometryEngineModule.geodesicLength(prevToCurrent, "miles");
            }
            
            // Distance to next entry (skip last entry)
            if (i < orderedMapPoints.length - 1) {
                const currentToNext = new PolylineCtor({
                    paths: [[[orderedMapPoints[i].x, orderedMapPoints[i].y], [orderedMapPoints[i + 1].x, orderedMapPoints[i + 1].y]]],
                    spatialReference
                });
                distToNext = geometryEngineModule.geodesicLength(currentToNext, "miles");
            }
            
            // Store distance info (validate finite numbers)
            segmentMiles.push({
                distFromPrev: Number.isFinite(distFromPrev) ? distFromPrev : 0,
                distToNext: Number.isFinite(distToNext) ? distToNext : 0
            });
        }
    }

    // Ensure segmentMiles array length matches storyEntries length
    while (segmentMiles.length < storyEntries.length) {
        segmentMiles.push({ distFromPrev: 0, distToNext: 0 });
    }

    // STEP 4: CLEANUP - Remove stale distance data from entries not in any story
    const allStoryEntryIds = new Set();
    stories.forEach((storyItem) => {
        storyItem.entryIds.forEach((entryId) => allStoryEntryIds.add(entryId));
    });

    // Clean from journalEntries array
    journalEntries.forEach((entry) => {
        if (!allStoryEntryIds.has(entry.id)) {
            delete entry.storyDistanceInfo;
        }
    });
    
    // Clean from pointStore entries
    pointStore.forEach((pointRecord) => {
        pointRecord.entries.forEach((entry) => {
            if (!allStoryEntryIds.has(entry.id)) {
                delete entry.storyDistanceInfo;
            }
        });
    });

    // STEP 5: ATTACH DISTANCE INFO - Add mileage data to both storage locations
    storyEntries.forEach((entry, idx) => {
        const mileageInfo = segmentMiles[idx] || { distFromPrev: 0, distToNext: 0 };
        entry.storyDistanceInfo = mileageInfo;  // Add to journalEntries entry

        // Also add to pointStore entry (for popup display)
        pointStore.forEach((pointRecord) => {
            const pointEntry = pointRecord.entries.find((item) => item.id === entry.id);
            if (pointEntry) {
                pointEntry.storyDistanceInfo = mileageInfo;
            }
        });
    });
    
    // STEP 6: UPDATE POINT GRAPHICS - Refresh markers for affected points
    // This changes marker color to black and updates popup templates
    affectedPointKeys.forEach((pointKey) => {
        const pointRecord = pointStore.get(pointKey);
        if (pointRecord && pointRecord.graphic) {
            updatePointGraphic(pointRecord);
        }
    });
}

// ============================================================================
// STORY VISIBILITY TOGGLE
// ============================================================================

/**
 * Toggles the visibility of a story's graphics layer on the map
 * 
 * When hidden:
 * - Line connecting entries disappears
 * - Entry markers remain visible (they're on point graphics, not story layer)
 * 
 * When shown:
 * - Line reappears
 * - Updates stories modal to show new button state
 * 
 * @param {number} storyId - ID of story to toggle
 */

/**
 * Toggles the visibility of a story's graphics layer on the map
 * 
 * When hidden:
 * - Line connecting entries disappears
 * - Entry markers remain visible (they're on point graphics, not story layer)
 * 
 * When shown:
 * - Line reappears
 * - Updates stories modal to show new button state
 * 
 * @param {number} storyId - ID of story to toggle
 */
function toggleStoryVisibility(storyId) {
    const story = stories.find(s => s.id === storyId);
    if (story) {
        story.visible = !story.visible;
        story.graphicsLayer.visible = story.visible;
        if (typeof queueSupabaseSync === 'function') {
            queueSupabaseSync();
        }
        openStoriesModal();  // Refresh modal to update button text
    }
}
