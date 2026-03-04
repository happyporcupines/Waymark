/**
 * ============================================================================
 * POPUPS.JS - Map Popup and Graphic Management
 * ============================================================================
 * 
 * This file manages:
 * - Building popup templates for entry display on the map
 * - Opening popups for single and multiple entries at a point
 * - Creating and updating map graphics (point markers)
 * - Handling story-related visual enhancements
 * 
 * Popups are ArcGIS's way of displaying information when clicking map features.
 * Each entry gets a custom popup with actions for reading, editing, and creating entries.
 */

// ============================================================================
// STORY LOOKUP UTILITIES
// ============================================================================

/**
 * Finds the story that contains a given entry
 * 
 * Used to determine if an entry is part of a journey, which affects:
 * - Popup display (adds story info banner)
 * - Map marker appearance (black for story entries, burgundy for standalone)
 * - Distance calculations shown in popups
 * 
 * @param {Object} entry - Entry object with id property
 * @returns {Object|null} Story object if entry is in a story, null otherwise
 * 
 * @example
 * const story = findStoryForEntry(myEntry);
 * if (story) {
 *   console.log(`This entry is part of: ${story.title}`);
 * }
 */
function findStoryForEntry(entry) {
    if (!entry) {
        return null;
    }
    return stories.find((story) => story.entryIds.includes(entry.id)) || null;
}

// ============================================================================
// POPUP TEMPLATE CONSTRUCTION
// ============================================================================

/**
 * Builds a complete popup template configuration for displaying an entry
 * 
 * Popup templates define:
 * - Title (entry title)
 * - Content (preview text, story info if applicable)
 * - Actions (buttons for reading, editing, adding entries)
 * 
 * Story integration:
 * If the entry is part of a story, adds a colored banner showing:
 * - Story title
 * - Distance from previous entry in story
 * - Distance to next entry in story
 * 
 * Text preview:
 * - Shows first 180 characters of entry
 * - Adds note if text is truncated
 * - Prompts user to "Read full entry" for complete text
 * 
 * @param {Object} entry - Entry object with title, textPlain, storyDistanceInfo
 * @param {Object|null} [pointStory=null] - Pre-fetched story object (optional optimization)
 * @returns {Object} ArcGIS popup template configuration
 * 
 * @example
 * const template = buildEntryPopupTemplate(entry);
 * graphic.popupTemplate = template;
 */
function buildEntryPopupTemplate(entry, pointStory = null) {
    const preview = truncateText(entry.textPlain, 180);
    const resolvedStory = pointStory || findStoryForEntry(entry);

    // Build story information banner if this entry is part of a journey
    let storyHtml = '';
    if (resolvedStory && entry.storyDistanceInfo) {
        storyHtml = `
            <div style="background: #f8e8eb; padding: 10px; margin-bottom: 10px; border-radius: 6px; border-left: 4px solid #a43855;">
                <strong>Part of Story: ${escapeHtml(resolvedStory.title)}</strong><br/>
                <small>Distance from previous: ${entry.storyDistanceInfo.distFromPrev.toFixed(2)} mi</small><br/>
                <small>Distance to next: ${entry.storyDistanceInfo.distToNext.toFixed(2)} mi</small>
            </div>
        `;
    }
    
    // Construct the full popup template with title, content, and action buttons
    return {
        title: entry.title,
        content: `
            <div>
                ${storyHtml}
                <p>${escapeHtml(preview)}</p>
                ${entry.textPlain.length > 180 ? '<p><em>Use "Read full entry" below to view everything.</em></p>' : ''}
            </div>
        `,
        actions: [
            { title: 'Read full entry', id: 'read-full-entry', className: 'esri-icon-documentation' },
            { title: 'Edit entry', id: 'edit-entry', className: 'esri-icon-edit' },
            { title: 'Add new entry to same point', id: 'add-same-point', className: 'esri-icon-plus-circled' },
            { title: 'Close', id: 'close-popup', className: 'esri-icon-close' }
        ]
    };
}

// ============================================================================
// POPUP DISPLAY FUNCTIONS
// ============================================================================

/**
 * Opens a popup for a specific entry at a point on the map
 * 
 * This function:
 * 1. Updates the point's graphic attributes to reference the selected entry
 * 2. Builds a fresh popup template with current entry data
 * 3. Opens the ArcGIS popup at the specified location
 * 
 * The popup location parameter allows flexibility:
 * - Pass event.mapPoint to open at click location
 * - Pass null to open at the point's actual coordinates
 * 
 * @param {Object} pointRecord - Point record containing the graphic and entries
 * @param {Object} entry - Specific entry to display in the popup
 * @param {Object} location - ArcGIS Point geometry for popup placement
 * 
 * @example
 * // Open popup at click location:
 * openEntryPopup(pointRecord, entry, event.mapPoint);
 * 
 * // Open popup at point's natural location:
 * openEntryPopup(pointRecord, entry, pointRecord.mapPoint);
 */
function openEntryPopup(pointRecord, entry, location) {
    if (!pointRecord.graphic) {
        return;
    }
    
    const pointStory = findStoryForEntry(entry);
    
    // Update graphic's attributes to reflect which entry is being shown
    pointRecord.graphic.attributes = {
        pointKey: pointRecord.pointKey,
        selectedEntryId: entry.id,
        title: entry.title
    };
    
    // Build fresh popup template with current story data
    pointRecord.graphic.popupTemplate = buildEntryPopupTemplate(entry, pointStory);
    
    // Open the popup at specified location or default to point location
    appView.popup.open({
        features: [pointRecord.graphic],
        location: location || pointRecord.mapPoint
    });
}

/**
 * Opens a multi-entry selector popup when a point has multiple diary entries
 * 
 * When users create multiple entries at the same coordinates, clicking the
 * point should show all entries in a carousel-style popup. This function:
 * 
 * 1. Creates a temporary Graphic for each entry at the same location
 * 2. Each graphic has the same marker symbol but different attributes/popup
 * 3. Opens popup with all graphics as "features" array
 * 4. User can page through entries using popup's feature navigation
 * 
 * The graphics created here are temporary - they're not added to the map layer,
 * just used as popup feature data. The actual persistent graphic remains in pointRecord.
 * 
 * @param {Object} pointRecord - Point record with entries array and mapPoint
 * @param {Object} location - ArcGIS Point geometry for popup placement
 * 
 * @example
 * if (pointRecord.entries.length > 1) {
 *   openEntrySelectorPopup(pointRecord, event.mapPoint);
 * } else {
 *   openEntryPopup(pointRecord, pointRecord.entries[0], event.mapPoint);
 * }
 */
function openEntrySelectorPopup(pointRecord, location) {
    // Create a feature Graphic for each entry, all at the same point
    const features = pointRecord.entries.map((entry) => new GraphicCtor({
        geometry: pointRecord.mapPoint,
        symbol: pointRecord.graphic ? pointRecord.graphic.symbol : {
            type: 'simple-marker',
            color: [164, 56, 85],
            outline: { color: [255, 255, 255], width: 2 }
        },
        attributes: {
            pointKey: pointRecord.pointKey,
            selectedEntryId: entry.id,
            title: entry.title
        },
        popupTemplate: buildEntryPopupTemplate(entry, findStoryForEntry(entry))
    }));

    // Open popup with all features - user can navigate between them
    appView.popup.open({
        features,
        location: location || pointRecord.mapPoint
    });
}

// ============================================================================
// MAP GRAPHIC MANAGEMENT
// ============================================================================

/**
 * Updates or creates the map graphic (point marker) for a point record
 * 
 * This is a critical function that handles the visual representation of entries
 * on the map. It manages:
 * 
 * - **Graphic creation**: If point has no graphic, create a new one
 * - **Graphic updates**: If graphic exists, update its appearance and popup
 * - **Story integration**: Move graphics between layers based on story membership
 * - **Color coding**: Black markers for story entries, burgundy for standalone
 * - **Popup templates**: Update with latest entry data and story info
 * 
 * Story layer management:
 * - Entries not in a story → appGraphicsLayer (burgundy markers)
 * - Entries in a story → story.graphicsLayer (black markers)
 * - When story membership changes, graphic is moved between layers
 * 
 * The function is called:
 * - After saving/editing an entry
 * - After updating story composition
 * - When entry content changes
 * 
 * @param {Object} pointRecord - Point record containing entries, graphic, and mapPoint
 * 
 * @example
 * // After saving an entry:
 * saveEntry();
 * updatePointGraphic(pointRecord);  // Refresh the map marker
 * 
 * // After updating a story:
 * updateStoryMapGraphics(story);
 * story.affectedPoints.forEach(pointKey => {
 *   updatePointGraphic(pointStore.get(pointKey));
 * });
 */
function updatePointGraphic(pointRecord) {
    const latestEntry = getLatestEntry(pointRecord);
    if (!latestEntry || !pointRecord) { return; }

    // Determine if this point is part of a story
    let pointStory = null;
    stories.forEach(s => {
        s.entryIds.forEach(eid => {
            const je = journalEntries.find(j => j.id === eid);
            if (je && buildPointKey(je.lat, je.lon) === pointRecord.pointKey) { 
                pointStory = s; 
            }
        });
    });
    
    // Build popup template with story info if applicable
    const popupTemplate = buildEntryPopupTemplate(latestEntry, pointStory);
    
    // Determine target layer and color based on story membership
    const targetLayer = pointStory ? pointStory.graphicsLayer : appGraphicsLayer;
    const targetMarkerColor = pointStory ? [0, 0, 0] : [164, 56, 85];  // Black for stories, burgundy for standalone

    // CREATE NEW GRAPHIC
    if (!pointRecord.graphic) {
        pointRecord.graphic = new GraphicCtor({
            geometry: pointRecord.mapPoint,
            symbol: {
                type: 'simple-marker',
                color: targetMarkerColor,
                outline: { color: [255, 255, 255], width: 2 }
            },
            attributes: { 
                pointKey: pointRecord.pointKey, 
                selectedEntryId: latestEntry.id, 
                title: latestEntry.title 
            },
            popupTemplate
        });
        targetLayer.add(pointRecord.graphic);
    } 
    // UPDATE EXISTING GRAPHIC
    else {
        // Check if graphic needs to move to a different layer (story membership changed)
        const currentLayer = pointRecord.graphic.layer;
        if (currentLayer && currentLayer !== targetLayer) {
            // Remove from old layer
            if (pointRecord.graphic in currentLayer.graphics) {
                try {
                    currentLayer.remove(pointRecord.graphic);
                } catch (e) {
                    // Layer removal might fail if graphic was already removed
                }
            }
            // Add to new layer
            try {
                targetLayer.add(pointRecord.graphic);
            } catch (e) {
                // Layer add might fail due to graphic already in layer
            }
        }
        
        // Update the graphic's visual properties and popup
        pointRecord.graphic.symbol = {
            type: 'simple-marker',
            color: targetMarkerColor,
            outline: { color: [255, 255, 255], width: 2 }
        };
        pointRecord.graphic.attributes = { 
            pointKey: pointRecord.pointKey, 
            selectedEntryId: latestEntry.id, 
            title: latestEntry.title 
        };
        pointRecord.graphic.popupTemplate = popupTemplate;
    }
}
