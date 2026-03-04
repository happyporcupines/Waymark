/**
 * ============================================================
 * POPUP & GRAPHICS MANAGEMENT - Map Display
 * ============================================================
 * 
 * This module handles the creation and display of map popups
 * that appear when users click on entry points. Also manages
 * the graphics (markers) that represent entries on the map.
 * 
 * Key Functionality:
 * - Build popup templates with entry content
 * - Open popups for single or multiple entries
 * - Update point graphics (markers) on map
 * - Sync graphics between story and main layers
 * 
 * DEPENDENCIES: state.js, utils.js, stories.js
 * 
 * ============================================================
 */

// ============================================================
// POPUP CONTENT BUILDING
// ============================================================

/**
 * Finds which story an entry belongs to (if any).
 * Used to display story information in popups.
 * 
 * @param {Object} entry - The entry to check
 * @returns {Object|null} Story object if entry is in a story, null otherwise
 */
function findStoryForEntry(entry) {
    if (!entry) {
        return null;
    }
    return stories.find((story) => story.entryIds.includes(entry.id)) || null;
}


/**
 * Builds the popup template for a map popup showing an entry.
 * Includes entry preview, story information if applicable,
 * and action buttons for reading, editing, and creating new entries.
 * 
 * @param {Object} entry - The entry to display
 * @param {Object} pointStory - Optional story object if entry is in a story
 * @returns {Object} ArcGIS PopupTemplate configuration
 * 
 * Template includes:
 * - Entry preview text (truncated)
 * - Story name and distance info (if in story)
 * - Four action buttons (Read, Edit, Add new, Close)
 */
function buildEntryPopupTemplate(entry, pointStory = null) {
    // Create preview: truncate long entries to 180 characters
    const preview = truncateText(entry.textPlain, 180);
    
    // Find story if not provided
    const resolvedStory = pointStory || findStoryForEntry(entry);

    // Build story information box if this entry is part of a story
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
    
    // Return ArcGIS PopupTemplate object
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


// ============================================================
// POPUP OPENING
// ============================================================

/**
 * Opens a popup for a single entry at its location.
 * Updates the graphics layer with the entry information.
 * 
 * @param {Object} pointRecord - The point where entry is located
 * @param {Object} entry - The entry to display
 * @param {Object} location - Optional map location to open popup at
 */
function openEntryPopup(pointRecord, entry, location) {
    if (!pointRecord.graphic) {
        return;
    }
    
    // Get story info if this entry is part of one
    const pointStory = findStoryForEntry(entry);
    
    // Update the graphic's popup with this entry's information
    pointRecord.graphic.attributes = {
        pointKey: pointRecord.pointKey,
        selectedEntryId: entry.id,
        title: entry.title
    };
    pointRecord.graphic.popupTemplate = buildEntryPopupTemplate(entry, pointStory);
    
    // Open the popup at the specified location or point's map location
    appView.popup.open({
        features: [pointRecord.graphic],
        location: location || pointRecord.mapPoint
    });
}


/**
 * Opens a popup with entry selector when a point has multiple entries.
 * Allows user to choose which entry to view.
 * 
 * @param {Object} pointRecord - The point with multiple entries
 * @param {Object} location - Map location to open popup at
 */
function openEntrySelectorPopup(pointRecord, location) {
    // Create a feature for each entry at this point
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

    // Open popup showing all entries as options
    appView.popup.open({
        features,
        location: location || pointRecord.mapPoint
    });
}


// ============================================================
// GRAPHICS UPDATES
// ============================================================

/**
 * Updates the map marker (graphic) for a point record.
 * Creates new marker or updates existing one with latest entry info.
 * Handles moving graphics between layers if point is added to a story.
 * 
 * @param {Object} pointRecord - The point record with entries
 */
function updatePointGraphic(pointRecord) {
    const latestEntry = getLatestEntry(pointRecord);
    if (!latestEntry || !pointRecord) {
        return;
    }

    // Check if this point is part of a story
    let pointStory = null;
    stories.forEach(s => {
        s.entryIds.forEach(eid => {
            const je = journalEntries.find(j => j.id === eid);
            if (je && buildPointKey(je.lat, je.lon) === pointRecord.pointKey) {
                pointStory = s;
            }
        });
    });
    
    // Get popup template for latest entry
    const popupTemplate = buildEntryPopupTemplate(latestEntry, pointStory);
    
    // Determine which layer to add marker to:
    // - Story layer if point is part of story
    // - Main layer if standalone
    const targetLayer = pointStory ? pointStory.graphicsLayer : appGraphicsLayer;
    
    // Marker color: black for story, red for regular
    const targetMarkerColor = pointStory ? [0, 0, 0] : [164, 56, 85];

    // Create new graphic if it doesn't exist
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
    } else {
        // Update existing graphic
        const currentLayer = pointRecord.graphic.layer;
        
        // Move to different layer if needed (e.g., point added to story)
        if (currentLayer && currentLayer !== targetLayer) {
            try {
                currentLayer.remove(pointRecord.graphic);
            } catch (e) {
                // Might already be removed
            }
            try {
                targetLayer.add(pointRecord.graphic);
            } catch (e) {
                // Might already be in layer
            }
        }
        
        // Update marker symbol and popup
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

