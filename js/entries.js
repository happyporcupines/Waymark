/**
 * ============================================================
 * ENTRY MANAGEMENT - Diary Entry Creation & Editing
 * ============================================================
 * 
 * This module handles the creation, editing, and storage of
 * diary entries. It manages:
 * - Entry point records (groups of entries at same location)
 * - Entry CRUD operations
 * - Image attachment for entries
 * - Guest mode persistence
 * 
 * DEPENDENCIES: state.js, utils.js
 * 
 * ============================================================
 */

/** Currently selected image data (base64) for entry being edited */
let currentEntryImage = null;


/**
 * Gets or creates a point record - a container for all entries at a location.
 * Multiple entries can exist at the same point.
 * 
 * @param {Object} coords - Coordinate object with shape {lat, lon, mapPoint}
 * @returns {Object} pointRecord with entries array and map graphic
 * 
 * EXAMPLE:
 *   const point = getOrCreatePointRecord({lat: 35.126, lon: -106.644, mapPoint: arcgisPoint});
 *   point.entries.push(newEntry);
 */
function getOrCreatePointRecord(coords) {
    // Build unique key from rounded coordinates
    const pointKey = buildPointKey(coords.lat, coords.lon);
    
    // Return existing record if found
    if (!pointStore.has(pointKey)) {
        // Create new point record structure
        pointStore.set(pointKey, {
            pointKey,
            lat: coords.lat,
            lon: coords.lon,
            mapPoint: coords.mapPoint,
            entries: [],           // Array of entries at this location
            graphic: null          // ArcGIS graphic shown on map
        });
    }
    
    return pointStore.get(pointKey);
}


/**
 * Gets the most recent entry at a point record.
 * Used for displaying the latest info in popups and markers.
 * 
 * @param {Object} pointRecord - The point record to check
 * @returns {Object|null} The latest entry or null if no entries exist
 */
function getLatestEntry(pointRecord) {
    if (!pointRecord || pointRecord.entries.length === 0) {
        return null;
    }
    return pointRecord.entries[pointRecord.entries.length - 1];
}


/**
 * In guest mode, keeps journalEntries array in sync with point store.
 * Guest mode doesn't have a database, so we maintain a flat array
 * that's used for the sidebar list.
 * 
 * @param {Object} entry - The entry that was saved
 * @param {Object} pointRecord - The point record containing the entry
 */
function upsertGuestArrayEntry(entry, pointRecord) {
    // Only do this in guest mode
    if (!isGuestMode) {
        return;
    }
    
    // Create guest entry object with essential data
    const guestEntry = {
        id: entry.id,
        title: entry.title,
        text: entry.textPlain,
        lat: pointRecord.lat,
        lon: pointRecord.lon,
        image: entry.image || null,
        createdAt: entry.createdAt
    };

    // Update existing entry or add new one
    const existingIndex = journalEntries.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) {
        journalEntries[existingIndex] = guestEntry;
    } else {
        journalEntries.push(guestEntry);
    }
}


/**
 * Saves the current entry being edited or created.
 * Updates point records, map graphics, sidebar, and guest array as needed.
 * 
 * This is the main save function called from the Save button in the modal.
 * Handles validation, entry creation vs editing, and UI updates.
 */
function saveEntry() {
    // Verify we have a valid point to save to
    if (!currentPointKey || !pointStore.has(currentPointKey)) {
        return;
    }
    
    // Get the point record and form data
    const pointRecord = pointStore.get(currentPointKey);
    const title = document.getElementById('entryTitle').value.trim();
    const textHtml = document.getElementById('entryEditor').innerHTML.trim();
    const textPlain = htmlToText(textHtml);
    const dateValue = document.getElementById('entryDate').value;
    const createdAt = dateValue ? datetimeLocalToTimestamp(dateValue) : Date.now();
    
    // Validate required fields
    if (!title || !textPlain) {
        alert("Don't be lazy, fill out both the title and your memory! 🖤");
        return;
    }
    
    // Handle editing existing entry
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
    } else {
        // Creating new entry
        const newEntry = {
            id: nextEntryId++,
            title,
            textHtml,
            textPlain,
            createdAt: createdAt,
            image: currentEntryImage
        };
        pointRecord.entries.push(newEntry);
        upsertGuestArrayEntry(newEntry, pointRecord);
    }
    
    // Update the map display and sidebar
    updatePointGraphic(pointRecord);
    updateSidebarList();
    closeEntryModal();
}


// When a user clicks on a point with multiple entries, this function helps determine which entry to show based on the selected entry ID from the popup
// if no matching entry is found, it defaults to showing the latest entry for that point  
function findEntryById(pointRecord, entryId) {
    return pointRecord.entries.find((entry) => entry.id === entryId) || getLatestEntry(pointRecord);
}

function findPointRecordByEntryId(entryId) {
    let matchedPointRecord = null;
    pointStore.forEach((pointRecord) => {
        if (!matchedPointRecord && pointRecord.entries.some((entry) => entry.id === entryId)) {
            matchedPointRecord = pointRecord;
        }
    });
    return matchedPointRecord;
}

// Applies formatting commands to the entry editor when the user clicks on the formatting buttons in the modal
function applyEditorCommand(command) {
    const editor = document.getElementById('entryEditor');
    editor.focus();
    // Handle custom commands for ordered list with upper-alpha and checklist, since these require special handling beyond simple execCommand calls
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
    // For the checklist command, we insert a custom HTML snippet that represents an unchecked checklist item
    // since execCommand doesn't have native support for checklists
    if (command === 'checkList') {
        document.execCommand('insertHTML', false, '<ul style="list-style-type:none;"><li>☐ Checklist item</li></ul>');
        return;
    }

    document.execCommand(command, false);
}
