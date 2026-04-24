/**
 * ============================================================================
 * ENTRIES.JS - Journal Entry Management
 * ============================================================================
 * 
 * This file handles all CRUD operations for diary entries, including:
 * - Creating and retrieving point records at specific map coordinates
 * - Saving and updating entry data
 * - Managing the relationship between entries and map points
 * - Handling text formatting commands in the entry editor
 * 
 * Key concepts:
 * - A "point record" represents a geographic location that can have multiple entries
 * - The pointStore Map uses rounded coordinates as keys to group entries by location
 * - Each entry contains both HTML (for display) and plain text (for previews)
 */

// ============================================================================
// IMAGE UPLOAD STATE
// ============================================================================

/**
 * Stores the current entry's image as a base64 data URL
 * Set when user uploads an image via file input
 * Cleared when entry modal is closed or image is removed
 * @type {string|null}
 */
let currentEntryImage = null;

// ============================================================================
// POINT RECORD MANAGEMENT
// ============================================================================

/**
 * Retrieves an existing point record or creates a new one for the given coordinates
 * 
 * Point records are the primary organizational structure for entries. Each point
 * can have multiple entries at the same location, and they share one map graphic.
 * 
 * The function:
 * 1. Generates a rounded point key from coordinates
 * 2. Checks if a record exists in pointStore
 * 3. Creates a new record if needed with empty entries array
 * 4. Returns the point record for use
 * 
 * @param {Object} coords - Coordinate object with lat, lon, and mapPoint properties
 * @param {number} coords.lat - Latitude value
 * @param {number} coords.lon - Longitude value
 * @param {Object} coords.mapPoint - ArcGIS Point geometry object
 * @returns {Object} Point record with structure: { pointKey, lat, lon, mapPoint, entries[], graphic }
 * 
 * @example
 * const coords = { lat: 35.123, lon: -106.645, mapPoint: arcgisPointObj };
 * const pointRecord = getOrCreatePointRecord(coords);
 * // pointRecord.entries is now ready to receive entry objects
 */
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

/**
 * Retrieves the most recently added entry for a given point record
 * 
 * The "latest" entry is used as the default when:
 * - Displaying the point's popup (if no specific entry is selected)
 * - Updating the map marker's appearance
 * - Showing quick preview information
 * 
 * @param {Object} pointRecord - Point record object containing entries array
 * @returns {Object|null} The last entry in the entries array, or null if no entries exist
 * 
 * @example
 * const latestEntry = getLatestEntry(pointRecord);
 * if (latestEntry) {
 *   console.log(latestEntry.title); // Display the most recent entry title
 * }
 */
function getLatestEntry(pointRecord) {
    if (!pointRecord || pointRecord.entries.length === 0) {
        return null;
    }
    return pointRecord.entries[pointRecord.entries.length - 1];
}

// ============================================================================
// GUEST MODE DATA SYNCHRONIZATION
// ============================================================================

/**
 * Synchronizes entry data to the journalEntries array when in guest mode
 * 
 * In guest mode, the journalEntries array serves as the primary data source
 * for features like:
 * - Sidebar entry list display
 * - Story creation (selecting entries to connect)
 * - Quick access to all entries without traversing pointStore
 * 
 * This function:
 * 1. Only operates when isGuestMode is true
 * 2. Creates a simplified entry object with essential fields
 * 3. Updates existing entry if found (by ID match)
 * 4. Appends new entry if not found
 * 
 * Note: In a full implementation with backend, this would be replaced by
 * database operations and the journalEntries array would be server-synced.
 * 
 * @param {Object} entry - Full entry object from pointRecord.entries
 * @param {Object} pointRecord - Parent point record containing lat/lon
 * 
 * @example
 * // After saving an entry, sync it to the main array:
 * upsertGuestArrayEntry(newEntry, pointRecord);
 * // Now the entry appears in sidebar and story creation lists
 */
function upsertGuestArrayEntry(entry, pointRecord) {
    // Check if an entry for this point already exists in the journalEntries array
    const existingIndex = journalEntries.findIndex((item) => item.id === entry.id);
    
    // Create simplified entry object with only the fields needed for UI display
    const guestEntry = {
        id: entry.id,
        title: entry.title,
        text: entry.textPlain,        // Store plain text for previews
        lat: pointRecord.lat,
        lon: pointRecord.lon,
        image: entry.image || null,
        createdAt: entry.createdAt
    };

    // Update existing or append new
    if (existingIndex >= 0) {
        journalEntries[existingIndex] = guestEntry;
    } else {
        journalEntries.push(guestEntry);
    }
}

// ============================================================================
// ENTRY SAVE OPERATION
// ============================================================================

/**
 * Saves or updates a diary entry from the entry modal form
 * 
 * This is the core entry save function that handles both creating new entries
 * and updating existing ones. The function:
 * 
 * 1. Validates current state (must have valid point key)
 * 2. Extracts form data (title, rich text content, date, image)
 * 3. Validates required fields
 * 4. Creates new entry OR updates existing (based on currentEditingEntryId)
 * 5. Syncs to journalEntries array (guest mode)
 * 6. Updates map graphic to reflect changes
 * 7. Refreshes sidebar list
 * 8. Closes the entry modal
 * 
 * Form validation:
 * - Title and text content are required
 * - Shows friendly error message if validation fails
 * - Date defaults to current time if not provided
 * 
 * @fires updatePointGraphic - Updates the map marker appearance
 * @fires updateSidebarList - Refreshes the entries list in sidebar
 * @fires closeEntryModal - Closes the modal and resets state
 * 
 * @example
 * // Called when user clicks "Save Entry" button in modal
 * // The function reads from DOM elements:
 * // - #entryTitle
 * // - #entryEditor (contenteditable)
 * // - #entryDate
 */
function saveEntry() {
    // Validate we have a valid point to save to
    if (!currentPointKey || !pointStore.has(currentPointKey)) {
        return;
    }
    
    // Extract form data from the entry modal
    const pointRecord = pointStore.get(currentPointKey);
    const title = document.getElementById('entryTitle').value.trim();
    const textHtml = document.getElementById('entryEditor').innerHTML.trim();
    const textPlain = htmlToText(textHtml);
    const dateValue = document.getElementById('entryDate').value;
    const createdAt = dateValue ? datetimeLocalToTimestamp(dateValue) : Date.now();
    
    // Validate required fields with friendly error message
    if (!title || !textPlain) {
        alert("Don't be lazy, fill out both the title and your memory! 🖤");
        return;
    }
    
    // UPDATE EXISTING ENTRY
    if (currentEditingEntryId) {
        const editingEntry = pointRecord.entries.find((entry) => entry.id === currentEditingEntryId);
        if (editingEntry) {
            editingEntry.title = title;
            editingEntry.textHtml = textHtml;
            editingEntry.textPlain = textPlain;
            editingEntry.createdAt = createdAt;
            editingEntry.image = currentEntryImage;
            upsertGuestArrayEntry(editingEntry, pointRecord);
        }
    } 
    // CREATE NEW ENTRY
    else {
        const newEntry = {
            id: nextEntryId++,           // Generate unique ID and increment counter
            title,
            textHtml,                     // Rich HTML content for display
            textPlain,                    // Plain text for previews and search
            createdAt: createdAt,
            image: currentEntryImage      // Base64 data URL or null
        };
        pointRecord.entries.push(newEntry);
        upsertGuestArrayEntry(newEntry, pointRecord);
    }
    
    // Update UI to reflect the changes
    updatePointGraphic(pointRecord);  // Refresh map marker
    updateSidebarList();               // Refresh entry list
    if (typeof queueSupabaseSync === 'function') {
        queueSupabaseSync();
    }
    closeEntryModal();                 // Close modal and reset state
}

// ============================================================================
// ENTRY LOOKUP FUNCTIONS
// ============================================================================

/**
 * Finds a specific entry by ID within a point record, with fallback to latest entry
 * 
 * Used when:
 * - User clicks on a specific entry in a multi-entry popup
 * - Navigating from sidebar to a specific entry
 * - Opening entry detail panel for editing
 * 
 * @param {Object} pointRecord - Point record containing entries array
 * @param {number} entryId - Unique entry identifier to search for
 * @returns {Object} Matching entry object, or latest entry if not found
 * 
 * @example
 * const entry = findEntryById(pointRecord, 42);
 * openEntryPopup(pointRecord, entry, mapPoint);
 */
function findEntryById(pointRecord, entryId) {
    return pointRecord.entries.find((entry) => entry.id === entryId) || getLatestEntry(pointRecord);
}

/**
 * Searches all point records to find the one containing a specific entry ID
 * 
 * Useful when you have an entry ID (e.g., from sidebar click) but need to
 * find its parent point record to access location data and other entries.
 * 
 * This is a linear search through pointStore, so it's O(n*m) where n is the
 * number of points and m is average entries per point. Fine for typical
 * diary usage, but could be optimized with an entry ID -> pointKey map if needed.
 * 
 * @param {number} entryId - Unique entry identifier to search for
 * @returns {Object|null} Point record containing the entry, or null if not found
 * 
 * @example
 * // User clicks entry #42 in sidebar
 * const pointRecord = findPointRecordByEntryId(42);
 * if (pointRecord) {
 *   const entry = findEntryById(pointRecord, 42);
 *   openEntryModal('edit', pointRecord, entry);
 * }
 */
function findPointRecordByEntryId(entryId) {
    let matchedPointRecord = null;
    pointStore.forEach((pointRecord) => {
        if (!matchedPointRecord && pointRecord.entries.some((entry) => entry.id === entryId)) {
            matchedPointRecord = pointRecord;
        }
    });
    return matchedPointRecord;
}

// ============================================================================
// TEXT EDITOR FORMATTING
// ============================================================================

/**
 * Applies rich text formatting commands to the contenteditable entry editor
 * 
 * Uses the browser's execCommand API to apply formatting like bold, italic,
 * lists, etc. Also handles custom commands that require special logic.
 * 
 * Standard commands (passed directly to execCommand):
 * - 'bold' - Makes selected text bold
 * - 'italic' - Makes selected text italic
 * - 'createLink' - Creates a hyperlink (prompts for URL)
 * - 'insertUnorderedList' - Creates bullet list
 * - 'insertOrderedList' - Creates numbered list
 * 
 * Custom commands (require special handling):
 * - 'alphaList' - Creates alphabetically ordered list (A, B, C...)
 * - 'checkList' - Inserts checklist with checkbox symbols
 * 
 * @param {string} command - The formatting command to execute
 * 
 * @example
 * // Called from editor toolbar buttons:
 * applyEditorCommand('bold');         // Bolds selected text
 * applyEditorCommand('alphaList');    // Creates A. B. C. list
 * applyEditorCommand('checkList');    // Inserts ☐ checklist item
 */
function applyEditorCommand(command) {
    const editor = document.getElementById('entryEditor');
    editor.focus();
    
    // CUSTOM COMMAND: Alphabetical ordered list (A, B, C...)
    if (command === 'alphaList') {
        // First create standard ordered list
        document.execCommand('insertOrderedList', false);
        
        // Then find it and modify the list style
        const selection = window.getSelection();
        if (selection && selection.anchorNode) {
            const parent = selection.anchorNode.nodeType === 1 
                ? selection.anchorNode 
                : selection.anchorNode.parentElement;
            const orderedList = parent ? parent.closest('ol') : null;
            if (orderedList) {
                orderedList.style.listStyleType = 'upper-alpha';
            }
        }
        return;
    }
    
    // CUSTOM COMMAND: Checklist with checkbox symbols
    if (command === 'checkList') {
        // Insert HTML for a checklist item with checkbox symbol
        // Uses unicode box drawing character (☐ = U+2610)
        document.execCommand('insertHTML', false, 
            '<ul style="list-style-type:none;"><li>☐ Checklist item</li></ul>');
        return;
    }

    // STANDARD COMMANDS: Pass through to native execCommand
    document.execCommand(command, false);
}
