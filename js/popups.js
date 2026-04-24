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
    };
}

// ============================================================================
// POPUP DISPLAY FUNCTIONS (Maptiler - now handled in map.js)
// ============================================================================

/**
 * Legacy stub for ArcGIS popup - replaced by openEntryPopupMaptiler in map.js
 * Kept for backward compatibility with old code that might reference it.
 */
function openEntryPopup(pointRecord, entry, location) {
    // Delegate to Maptiler version in map.js
    if (typeof openEntryPopupMaptiler === 'function') {
        openEntryPopupMaptiler(pointRecord, entry, location || pointRecord.mapPoint);
    }
}

/**
 * Legacy stub for ArcGIS popup selector - replaced by openEntrySelectorPopupMaptiler in map.js
 */
function openEntrySelectorPopup(pointRecord, location) {
    // Delegate to Maptiler version in map.js
    if (typeof openEntrySelectorPopupMaptiler === 'function') {
        openEntrySelectorPopupMaptiler(pointRecord, location || pointRecord.mapPoint);
    }
}

// ============================================================================
// MAP MARKER MANAGEMENT (GeoJSON-based for Maptiler)
// ============================================================================

/**
 * Updates entry markers on the map by refreshing the GeoJSON source
 * 
 * This replaces the ArcGIS Graphic management system. Instead of managing
 * individual Graphic objects, we update the GeoJSON source which Maptiler uses.
 * 
 * @param {Object} pointRecord - Point record containing entries
 */
function updatePointGraphic(pointRecord) {
    if (!pointRecord) return;
    
    // Call the Maptiler function to refresh all markers
    if (typeof updateMapEntryMarkers === 'function') {
        updateMapEntryMarkers();
    }
}
