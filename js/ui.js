/**
 * ============================================================================
 * UI.JS - User Interface Management
 * ============================================================================
 * 
 * This file manages all UI components and modal interactions:
 * - Entry modal (create/edit entries)
 * - Detail panel (read-only entry view)
 * - Sidebar entry list
 * - App initialization and login flow
 * 
 * The UI layer is responsible for:
 * - Opening/closing modals and panels
 * - Pre-filling forms with data
 * - Rendering dynamic lists
 * - Managing view state transitions
 */

// ============================================================================
// ENTRY MODAL MANAGEMENT
// ============================================================================

/**
 * Opens the entry modal for creating or editing a diary entry
 * 
 * This modal provides a rich text editor interface with:
 * - Title input field
 * - Date/time picker (pre-filled with creation time or current time)
 * - ContentEditable rich text editor with formatting toolbar
 * - Image upload capability
 * - Coordinate display for context
 * 
 * The modal operates in two modes:
 * 
 * CREATE MODE ('new'):
 * - Clear all form fields
 * - Set date to current time
 * - Modal title: "New Diary Entry 📓"
 * - No image preview
 * 
 * EDIT MODE ('edit'):
 * - Pre-fill with existing entry data
 * - Load entry's HTML content into editor
 * - Show existing image if present
 * - Modal title: "Edit Diary Entry ✏️"
 * 
 * State management:
 * - Sets currentPointKey for save operation
 * - Sets currentEditingEntryId (null for new, entry ID for edit)
 * - Sets currentEntryImage from existing entry or null
 * 
 * @param {string} mode - Either 'new' or 'edit' to determine modal behavior
 * @param {Object} pointRecord - Point record containing lat/lon and pointKey
 * @param {Object|null} entryToEdit - Entry object when editing, null when creating
 * 
 * @example
 * // Create new entry:
 * openEntryModal('new', pointRecord, null);
 * 
 * // Edit existing entry:
 * openEntryModal('edit', pointRecord, existingEntry);
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

    // Set global state for save operation
    currentPointKey = pointRecord.pointKey;
    currentEditingEntryId = entryToEdit ? entryToEdit.id : null;
    currentEntryImage = null;
    
    // Display coordinates for user context
    document.getElementById('entryCoords').innerText = `Location: ${pointRecord.lat}, ${pointRecord.lon}`;
    modalTitle.innerText = mode === 'edit' ? 'Edit Diary Entry ✏️' : 'New Diary Entry 📓';
    
    // EDIT MODE: Pre-fill form with existing entry data
    if (entryToEdit) {
        titleInput.value = entryToEdit.title;
        editor.innerHTML = entryToEdit.textHtml;  // Load rich HTML content
        dateInput.value = timestampToDatetimeLocal(entryToEdit.createdAt);
        
        // Load existing image if present
        if (entryToEdit.image) {
            currentEntryImage = entryToEdit.image;
            imagePreview.innerHTML = `<img src="${entryToEdit.image}" alt="Entry image" style="max-width: 200px; max-height: 200px; margin-top: 10px; border-radius: 4px;">`;
            removeImageBtn.style.display = 'inline-block';
        } else {
            imagePreview.innerHTML = '';
            removeImageBtn.style.display = 'none';
        }
    } 
    // CREATE MODE: Clear form and set defaults
    else {
        titleInput.value = '';
        editor.innerHTML = '';
        dateInput.value = timestampToDatetimeLocal(Date.now());
        imagePreview.innerHTML = '';
        removeImageBtn.style.display = 'none';
    }
    
    // Reset file input (prevents issues with re-uploading same filename)
    imageInput.value = '';

    // Display the modal
    modal.style.display = 'flex';
}

/**
 * Closes the entry modal and resets all form state
 * 
 * This function performs complete cleanup:
 * - Hides the modal element
 * - Clears title input and rich text editor
 * - Removes image preview and resets file input
 * - Clears currentEditingEntryId and currentEntryImage state
 * - Removes any lingering long-press indicators (mobile cleanup)
 * 
 * Called when:
 * - User clicks Cancel button
 * - User successfully saves entry
 * - User closes modal via other means
 * 
 * @example
 * // After saving an entry:
 * saveEntry();  // This internally calls:
 * closeEntryModal();
 */
function closeEntryModal() {
    document.getElementById('entryModal').style.display = 'none';
    document.getElementById('entryTitle').value = '';
    document.getElementById('entryEditor').innerHTML = '';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('entryImageInput').value = '';
    currentEditingEntryId = null;
    currentEntryImage = null;
    
    // Clean up any pending long-press indicators (mobile touch cleanup)
    const indicators = document.querySelectorAll('.long-press-indicator');
    indicators.forEach(indicator => {
        try {
            indicator.remove();
        } catch (e) {
            // Indicator might already be removed
        }
    });
}

// ============================================================================
// SIDEBAR ENTRY LIST
// ============================================================================

/**
 * Updates the sidebar with a list of all diary entries
 * 
 * Renders the journalEntries array as an interactive list in the sidebar.
 * Each entry displays:
 * - Title (clickable to open edit modal)
 * - Creation date/time (formatted)
 * - Image thumbnail (if image exists)
 * - Text preview (truncated to 120 characters)
 * - Coordinates (lat/lon)
 * 
 * The list is regenerated from scratch each time (simple but effective
 * for small datasets). For large datasets, consider incremental updates.
 * 
 * Empty state:
 * If no entries exist, shows friendly message: "No entries yet. Tap the map to create one!"
 * 
 * Interaction:
 * - Click entry title → Opens edit modal for that entry
 * 
 * Called when:
 * - App first loads
 * - User saves/edits an entry
 * - User deletes an entry (if deletion is implemented)
 * - View switches to sidebar
 * 
 * @example
 * // After saving an entry:
 * updateSidebarList();  // Refresh to show new entry
 */
function updateSidebarList() {
    const listContainer = document.getElementById('entriesList');
    listContainer.innerHTML = '';
    
    // EMPTY STATE: No entries yet
    if (journalEntries.length === 0) {
        listContainer.innerHTML = '<p>No entries yet. Tap the map to create one!</p>';
        return;
    }
    
    // RENDER EACH ENTRY: Build HTML for each journal entry
    journalEntries.forEach((entry) => {
        const entryDiv = document.createElement('div');
        entryDiv.style.borderBottom = '1px solid #ccc';
        entryDiv.style.padding = '10px 0';
        
        // Build image thumbnail HTML if image exists
        let imageHtml = '';
        if (entry.image) {
            imageHtml = `<img src="${entry.image}" alt="Entry image" style="width: 100%; height: 80px; object-fit: cover; margin: 8px 0; border-radius: 4px;">`;
        }
        
        // Format creation date
        const entryDate = entry.createdAt ? formatDate(entry.createdAt) : '';
        
        // Construct entry HTML with title, date, image, preview, and coordinates
        entryDiv.innerHTML = `
            <h4 class="entry-title-link" data-entry-id="${entry.id}" style="margin: 0 0 5px 0; color: #a43855; cursor: pointer;">${entry.title}</h4>
            ${entryDate ? `<small style="color: #888; display: block; margin-bottom: 5px;">${entryDate}</small>` : ''}
            ${imageHtml}
            <p style="margin: 0; font-size: 0.9em;">${truncateText(entry.text, 120)}</p>
            <small style="color: #666;">Lat: ${entry.lat}, Lon: ${entry.lon}</small>
        `;
        listContainer.appendChild(entryDiv);
    });
}

// ============================================================================
// ENTRY DETAIL PANEL
// ============================================================================

/**
 * Opens the read-only detail panel to display full entry content
 * 
 * The detail panel provides an expanded view for reading entries without
 * the clutter of edit controls. It displays:
 * - Entry title
 * - Creation date and location
 * - Full-size image (if present)
 * - Story information banner (if entry is part of a journey)
 * - Complete rich HTML content
 * 
 * Story integration:
 * If the entry is part of a story, displays a colored banner with:
 * - Story title
 * - Distance from previous entry
 * - Distance to next entry
 * 
 * Layout:
 * - Slides in from the side on desktop
 * - Overlays on mobile
 * - Close button in header
 * 
 * @param {Object} pointRecord - Point record containing lat/lon data
 * @param {Object} entry - Entry object with title, textHtml, image, createdAt
 * 
 * @example
 * // Called from popup action:
 * openDetailPanel(pointRecord, entry);
 */
function openDetailPanel(pointRecord, entry) {
    const detailPanel = document.getElementById('entryDetailPanel');
    document.getElementById('detailTitle').innerText = entry.title;
    
    // Build metadata line: "Jan 1, 2026, 12:00 PM • Location: 35.123, -106.645"
    const dateStr = entry.createdAt ? formatDate(entry.createdAt) : '';
    const locationStr = `Location: ${pointRecord.lat}, ${pointRecord.lon}`;
    document.getElementById('detailMeta').innerText = dateStr ? `${dateStr} • ${locationStr}` : locationStr;

    // Check if entry is part of a story
    const pointStory = stories.find((story) => story.entryIds.includes(entry.id)) || null;
    
    // Build detail content HTML
    let detailHtml = '';
    
    // Add image first if it exists
    if (entry.image) {
        detailHtml = `<img src="${entry.image}" alt="Entry image" style="width: 100%; max-height: 300px; object-fit: contain; margin-bottom: 15px; border-radius: 4px;">`;
    }
    
    // Add story banner if entry is part of a journey
    if (pointStory && entry.storyDistanceInfo) {
        detailHtml += `
            <div style="background: #f8e8eb; padding: 10px; margin-bottom: 12px; border-radius: 6px; border-left: 4px solid #a43855;">
                <strong>Part of Story: ${escapeHtml(pointStory.title)}</strong><br/>
                <small>Distance from previous: ${entry.storyDistanceInfo.distFromPrev.toFixed(2)} mi</small><br/>
                <small>Distance to next: ${entry.storyDistanceInfo.distToNext.toFixed(2)} mi</small>
            </div>
        `;
    }
    
    // Add full rich HTML content
    detailHtml += entry.textHtml;
    
    document.getElementById('detailContent').innerHTML = detailHtml;
    
    // Show the panel with active class (triggers CSS animation)
    detailPanel.classList.add('active');
}

/**
 * Closes the entry detail panel
 * 
 * Removes the 'active' class which triggers CSS transition to slide/fade out.
 * 
 * @example
 * // Called when user clicks Close button:
 * closeDetailPanel();
 */
function closeDetailPanel() {
    document.getElementById('entryDetailPanel').classList.remove('active');
}

/**
 * Updates feature controls based on detected runtime capabilities.
 * Offline extent controls are only shown for Electron and Play-store installs.
 *
 * @param {Object} caps - Runtime capability flags
 */
function updateRuntimeCapabilityUI(caps) {
    const offlineBtn = document.getElementById('offlineMapsBtn');
    const exportBtn = document.getElementById('exportPdfBtn');
    const hintEl = document.getElementById('runtimeFeatureHint');

    if (offlineBtn) {
        offlineBtn.style.display = caps && caps.supportsOfflineExtentSave ? 'inline-block' : 'none';
    }

    if (exportBtn) {
        exportBtn.style.display = caps && caps.supportsPdfExport ? 'inline-block' : 'none';
    }

    if (hintEl) {
        if (caps && caps.supportsOfflineExtentSave) {
            hintEl.style.display = 'block';
            hintEl.textContent = 'Offline maps are available on this installed app.';
        } else {
            hintEl.style.display = 'none';
            hintEl.textContent = '';
        }
    }
}

// ============================================================================
// APP INITIALIZATION & LOGIN
// ============================================================================

/**
 * Handles app entry after login or guest mode selection
 * 
 * This function transitions from the login screen to the main application.
 * It performs several initialization tasks:
 * 
 * 1. Sets global user mode (guest or authenticated)
 * 2. Hides login overlay
 * 3. Shows main app container
 * 4. Updates user info display in header
 * 5. Sets initial view state (map view)
 * 6. Initializes ArcGIS map (first time only)
 * 
 * Guest mode specifics:
 * - Data stored only in memory
 * - Warning shown on first entry creation
 * - guestEntryWarningShown reset for new sessions
 * 
 * Map initialization:
 * - Only happens once (tracked by mapInitialized flag)
 * - Subsequent calls don't re-initialize map
 * 
 * @param {string} userLabel - Display text for user info (e.g., "User: email@example.com" or "Guest mode: data will not be saved")
 * @param {boolean} guestMode - True if user selected guest mode, false for authenticated
 * 
 * @example
 * // User clicks "Guest Mode" button:
 * enterApp('Guest mode: data will not be saved', true);
 * 
 * // User logs in:
 * enterApp(`User: ${email}`, false);
 */
function enterApp(userLabel, guestMode) {
    console.log('[Waymark] Entering app:', userLabel);
    
    // Set global user mode
    isGuestMode = guestMode;
    if (!isGuestMode) {
        guestEntryWarningShown = false;  // Reset for authenticated users
    }
    
    // Transition from login to main app
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';
    document.getElementById('userInfo').innerText = userLabel;
    
    if (typeof updateAuthUi === 'function') {
        updateAuthUi();
    }

    // Set initial view state: show map, hide sidebar
    document.getElementById('sidebar').classList.remove('active');
    const mapContainer = document.querySelector('.map-container');
    if (mapContainer) {
        mapContainer.style.display = 'block';
        console.log('[Waymark] Map container shown');
    } else {
        console.error('[Waymark] Map container not found in DOM');
        return;
    }

    // Initialize map on first app entry
    if (!mapInitialized) {
        console.log('[Waymark] Initializing map (first entry)...');
        try {
            initMap();
            mapInitialized = true;
            console.log('[Waymark] Map initialization started');
        } catch (error) {
            console.error('[Waymark] Map initialization failed:', error);
        }
    } else {
        console.log('[Waymark] Map already initialized, skipping');
    }
}
