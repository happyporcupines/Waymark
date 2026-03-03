// Entry Management

// Track the current image being edited/uploaded
let currentEntryImage = null;

// Gets or creates a point record for tracking entries at a specific location
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

// Retrieves the latest entry for a point record, or null if there are no entries
function getLatestEntry(pointRecord) {
    if (!pointRecord || pointRecord.entries.length === 0) {
        return null;
    }
    return pointRecord.entries[pointRecord.entries.length - 1];
}

// When in guest mode, this function ensures that the journalEntries array is kept up to date with the latest entry data for each point
function upsertGuestArrayEntry(entry, pointRecord) {
    if (!isGuestMode) {
        return;
    }
    // Check if an entry for this point already exists in the journalEntries array; if so, update it, otherwise add a new entry
    const existingIndex = journalEntries.findIndex((item) => item.id === entry.id);
    const guestEntry = {
        id: entry.id,
        title: entry.title,
        text: entry.textPlain,
        lat: pointRecord.lat,
        lon: pointRecord.lon,
        image: entry.image || null
    };

    if (existingIndex >= 0) {
        journalEntries[existingIndex] = guestEntry;
    } else {
        journalEntries.push(guestEntry);
    }
}

// Saves the current entry being edited or created, updating the point record, the map graphic, and the sidebar list accordingly
function saveEntry() {
    if (!currentPointKey || !pointStore.has(currentPointKey)) {
        return;
    }
    // Get the current point record based on the currentPointKey, and extract the title and text from the modal inputs
    const pointRecord = pointStore.get(currentPointKey);
    const title = document.getElementById('entryTitle').value.trim();
    const textHtml = document.getElementById('entryEditor').innerHTML.trim();
    const textPlain = htmlToText(textHtml);
    // Validate that both the title and the text are not empty; if either is empty, show an alert and do not save
    if (!title || !textPlain) {
        alert("Don't be lazy, fill out both the title and your memory! 🖤");
        return;
    }
    // If we're editing an existing entry, update its title, text, and image
    // if we're creating a new entry, create it and add it to the point record's entries array
    if (currentEditingEntryId) {
        const editingEntry = pointRecord.entries.find((entry) => entry.id === currentEditingEntryId);
        if (editingEntry) {
            editingEntry.title = title;
            editingEntry.textHtml = textHtml;
            editingEntry.textPlain = textPlain;
            editingEntry.image = currentEntryImage;
            upsertGuestArrayEntry(editingEntry, pointRecord);
        }
    } else {
        const newEntry = {
            id: nextEntryId++,
            title,
            textHtml,
            textPlain,
            createdAt: Date.now(),
            image: currentEntryImage
        };
        pointRecord.entries.push(newEntry);
        upsertGuestArrayEntry(newEntry, pointRecord);
    }
    // After saving the entry, update the graphic for the point to reflect any changes
    updatePointGraphic(pointRecord);
    updateSidebarList();
    closeEntryModal();
}

// When a user clicks on a point with multiple entries, this function helps determine which entry to show based on the selected entry ID from the popup
// if no matching entry is found, it defaults to showing the latest entry for that point  
function findEntryById(pointRecord, entryId) {
    return pointRecord.entries.find((entry) => entry.id === entryId) || getLatestEntry(pointRecord);
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
