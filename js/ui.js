/**
 * ============================================================
 * UI MANAGEMENT - Modals, Panels, and Layout
 * ============================================================
 * 
 * This module manages all UI elements except the map:
 * - Entry editor modal (create/edit entries)
 * - Detail panel (read-only entry view)
 * - Sidebar (entry list)
 * - Navigation
 * - Modal open/close operations
 * 
 * Related modules handle specific features:
 * - stories.js - Story modals
 * - eventHandlers.js - Event listeners
 * - map.js - Map interactions
 * 
 * DEPENDENCIES: state.js, utils.js, entries.js, popups.js, stories.js
 * 
 * ============================================================
 */

// ============================================================
// ENTRY MODAL - Create/Edit Dialog
// ============================================================

/**
 * Opens the entry editor modal for creating new or editing existing entries.
 * Pre-fills all form fields based on whether editing or creating.
 * 
 * @param {string} mode - 'new' or 'edit'
 * @param {Object} pointRecord - The point where entry will be saved
 * @param {Object} entryToEdit - Entry object if editing, null if creating
 * 
 * Sets up:
 * - Title and date inputs
 * - Rich text editor
 * - Image upload
 * - Location display
 */
function openEntryModal(mode, pointRecord, entryToEdit) {
    const titleInput = document.getElementById('entryTitle');
    const dateInput = document.getElementById('entryDate');
    const editor = document.getElementById('entryEditor');
    const modal = document.getElementById('entryModal');
    const modalTitle = document.getElementById('entryModalTitle');
    const imageInput = document.getElementById('entryImageInput');
    const imagePreview = document.getElementById('imagePreview');
    const removeImageBtn = document.getElementById('removeImageBtn');

    // Set global vars for saving
    currentPointKey = pointRecord.pointKey;
    currentEditingEntryId = entryToEdit ? entryToEdit.id : null;
    currentEntryImage = null;
    
    // Display location coordinates for reference
    document.getElementById('entryCoords').innerText = 
        `Location: ${pointRecord.lat}, ${pointRecord.lon}`;
    
    // Update modal title based on mode
    modalTitle.innerText = mode === 'edit' 
        ? 'Edit Diary Entry ✏️' 
        : 'New Diary Entry 📓';
    
    // Pre-fill form if editing, or clear if creating
    if (entryToEdit) {
        titleInput.value = entryToEdit.title;
        editor.innerHTML = entryToEdit.textHtml;
        dateInput.value = timestampToDatetimeLocal(entryToEdit.createdAt);
        
        // Load existing image if present
        if (entryToEdit.image) {
            currentEntryImage = entryToEdit.image;
            imagePreview.innerHTML = 
                `<img src="${entryToEdit.image}" alt="Entry image" style="max-width: 200px; max-height: 200px; margin-top: 10px; border-radius: 4px;">`;
            removeImageBtn.style.display = 'inline-block';
        } else {
            imagePreview.innerHTML = '';
            removeImageBtn.style.display = 'none';
        }
    } else {
        // Clear all fields for new entry
        titleInput.value = '';
        editor.innerHTML = '';
        dateInput.value = timestampToDatetimeLocal(Date.now());
        imagePreview.innerHTML = '';
        removeImageBtn.style.display = 'none';
    }
    
    // Reset file input
    imageInput.value = '';

    // Show modal
    modal.style.display = 'flex';
}


/**
 * Closes the entry editor modal and cleans up state.
 * Removes any temporary UI elements like long-press indicators.
 */
function closeEntryModal() {
    document.getElementById('entryModal').style.display = 'none';
    document.getElementById('entryTitle').value = '';
    document.getElementById('entryEditor').innerHTML = '';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('entryImageInput').value = '';
    currentEditingEntryId = null;
    currentEntryImage = null;
    
    // Clean up any pending long-press indicators
    const indicators = document.querySelectorAll('.long-press-indicator');
    indicators.forEach(indicator => {
        try {
            indicator.remove();
        } catch (e) {
            // Might already be removed
        }
    });
}


// ============================================================
// SIDEBAR - Entry List
// ============================================================

/**
 * Updates the sidebar list to display all entries.
 * Shows entry title, truncated preview, location, image, and date.
 * Clicking entry title opens detail panel for reading.
 */
function updateSidebarList() {
    const listContainer = document.getElementById('entriesList');
    listContainer.innerHTML = '';
    
    // Show message if no entries
    if (journalEntries.length === 0) {
        listContainer.innerHTML = '<p>No entries yet. Tap the map to create one!</p>';
        return;
    }
    
    // Create entry item for each journal entry
    journalEntries.forEach((entry) => {
        const entryDiv = document.createElement('div');
        entryDiv.style.borderBottom = '1px solid #ccc';
        entryDiv.style.padding = '10px 0';
        
        // Include entry image if exists
        let imageHtml = '';
        if (entry.image) {
            imageHtml = `<img src="${entry.image}" alt="Entry image" style="width: 100%; height: 80px; object-fit: cover; margin: 8px 0; border-radius: 4px;">`;
        }
        
        // Format date for display
        const entryDate = entry.createdAt ? formatDate(entry.createdAt) : '';
        
        entryDiv.innerHTML = `
            <h4 class="entry-title-link" data-entry-id="${entry.id}" style="margin: 0 0 5px 0; color: #a43855; cursor: pointer;">
                ${entry.title}
            </h4>
            ${entryDate ? `<small style="color: #888; display: block; margin-bottom: 5px;">${entryDate}</small>` : ''}
            ${imageHtml}
            <p style="margin: 0; font-size: 0.9em;">${truncateText(entry.text, 120)}</p>
            <small style="color: #666;">Lat: ${entry.lat}, Lon: ${entry.lon}</small>
        `;
        listContainer.appendChild(entryDiv);
    });
}


// ============================================================
// DETAIL PANEL - Read-Only View
// ============================================================

/**
 * Opens the detail panel (read-only view) for an entry.
 * Displays full text, image, story info, and metadata.
 * 
 * @param {Object} pointRecord - The point containing the entry
 * @param {Object} entry - The entry to display
 */
function openDetailPanel(pointRecord, entry) {
    const detailPanel = document.getElementById('entryDetailPanel');
    
    // Set title and metadata
    document.getElementById('detailTitle').innerText = entry.title;
    const dateStr = entry.createdAt ? formatDate(entry.createdAt) : '';
    const locationStr = `Location: ${pointRecord.lat}, ${pointRecord.lon}`;
    document.getElementById('detailMeta').innerText = 
        dateStr ? `${dateStr} • ${locationStr}` : locationStr;

    // Check if entry is part of a story
    const pointStory = stories.find((story) => story.entryIds.includes(entry.id)) || null;
    
    // Build detail content
    let detailHtml = '';
    
    // Include image if present
    if (entry.image) {
        detailHtml = `<img src="${entry.image}" alt="Entry image" style="width: 100%; max-height: 300px; object-fit: contain; margin-bottom: 15px; border-radius: 4px;">`;
    }
    
    // Include story info if in a story
    if (pointStory && entry.storyDistanceInfo) {
        detailHtml += `
            <div style="background: #f8e8eb; padding: 10px; margin-bottom: 12px; border-radius: 6px; border-left: 4px solid #a43855;">
                <strong>Part of Story: ${escapeHtml(pointStory.title)}</strong><br/>
                <small>Distance from previous: ${entry.storyDistanceInfo.distFromPrev.toFixed(2)} mi</small><br/>
                <small>Distance to next: ${entry.storyDistanceInfo.distToNext.toFixed(2)} mi</small>
            </div>
        `;
    }
    
    // Add entry text content
    detailHtml += entry.textHtml;
    
    document.getElementById('detailContent').innerHTML = detailHtml;
    
    // Show panel
    detailPanel.classList.add('active');
}


/**
 * Closes the detail panel.
 */
function closeDetailPanel() {
    document.getElementById('entryDetailPanel').classList.remove('active');
}


// ============================================================
// NAVIGATION & APP STATE
// ============================================================

/**
 * Enters the main app after login.
 * Hides login screen, initializes map, and sets user label.
 * 
 * @param {string} userLabel - Label to display (e.g., "User: john@example.com")
 * @param {boolean} guestMode - Whether user chose guest mode
 */
function enterApp(userLabel, guestMode) {
    isGuestMode = guestMode;
    
    // Reset guest warning if not in guest mode
    if (!isGuestMode) {
        guestEntryWarningShown = false;
    }
    
    // Hide login, show app
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';
    document.getElementById('userInfo').innerText = userLabel;

    // Show map by default
    document.getElementById('sidebar').classList.remove('active');
    document.querySelector('.map-container').style.display = 'block';

    // Initialize map if not yet done
    if (!mapInitialized) {
        initMap();
        mapInitialized = true;
    }
}


// ============================================================
// HELPER FUNCTIONS - Entry Lookup
// ============================================================

/**
 * Finds an entry by ID within a point record.
 * Returns the latest entry as fallback if specific entry not found.
 * 
 * @param {Object} pointRecord - Point record to search
 * @param {number} entryId - Entry ID to find
 * @returns {Object|null} Entry object or null
 */
function findEntryById(pointRecord, entryId) {
    return pointRecord.entries.find((entry) => entry.id === entryId) 
        || getLatestEntry(pointRecord);
}


/**
 * Finds the point record that contains a specific entry.
 * Searches through all points in pointStore.
 * 
 * @param {number} entryId - Entry ID to search for
 * @returns {Object|null} Point record or null
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


// ============================================================
// TEXT EDITOR - Formatting Commands
// ============================================================

/**
 * Applies text formatting commands to the entry editor.
 * Handles both standard execCommand and custom formatting.
 * 
 * @param {string} command - Formatting command (bold, italic, alphaList, checkList, etc.)
 */
function applyEditorCommand(command) {
    const editor = document.getElementById('entryEditor');
    editor.focus();
    
    // Handle custom alpha list (upper-case counter: A, B, C, ...)
    if (command === 'alphaList') {
        document.execCommand('insertOrderedList', false);
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
    
    // Handle custom checklist (☐ boxes)
    if (command === 'checkList') {
        document.execCommand('insertHTML', false, 
            '<ul style="list-style-type:none;"><li>☐ Checklist item</li></ul>');
        return;
    }

    // All other commands use standard execCommand
    document.execCommand(command, false);
}

