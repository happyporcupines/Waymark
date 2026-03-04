// UI Management - Modals, Detail Panel, Sidebar

// Opens the entry modal for creating a new entry or editing an existing one, pre-filling data if editing
function openEntryModal(mode, pointRecord, entryToEdit) {
    const titleInput = document.getElementById('entryTitle');
    const dateInput = document.getElementById('entryDate');
    const editor = document.getElementById('entryEditor');
    const modal = document.getElementById('entryModal');
    const modalTitle = document.getElementById('entryModalTitle');
    const imageInput = document.getElementById('entryImageInput');
    const imagePreview = document.getElementById('imagePreview');
    const removeImageBtn = document.getElementById('removeImageBtn');

    currentPointKey = pointRecord.pointKey;
    currentEditingEntryId = entryToEdit ? entryToEdit.id : null;
    currentEntryImage = null;
    
    // Display the coordinates in the modal for context
    document.getElementById('entryCoords').innerText = `Location: ${pointRecord.lat}, ${pointRecord.lon}`;
    modalTitle.innerText = mode === 'edit' ? 'Edit Diary Entry ✏️' : 'New Diary Entry 📓';
    
    // If editing, pre-fill the title, editor, date, and image with the existing entry data; if creating new, clear the fields
    if (entryToEdit) {
        titleInput.value = entryToEdit.title;
        editor.innerHTML = entryToEdit.textHtml;
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
    } else {
        titleInput.value = '';
        editor.innerHTML = '';
        dateInput.value = timestampToDatetimeLocal(Date.now());
        imagePreview.innerHTML = '';
        removeImageBtn.style.display = 'none';
    }
    
    // Reset file input
    imageInput.value = '';

    modal.style.display = 'flex';
}

// Closes the entry modal and resets the current editing state
function closeEntryModal() {
    document.getElementById('entryModal').style.display = 'none';
    document.getElementById('entryTitle').value = '';
    document.getElementById('entryEditor').innerHTML = '';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('entryImageInput').value = '';
    currentEditingEntryId = null;
    currentEntryImage = null;
    
    // Clean up any pending long-press indicators if they're still present
    const indicators = document.querySelectorAll('.long-press-indicator');
    indicators.forEach(indicator => {
        try {
            indicator.remove();
        } catch (e) {
            // Indicator might already be removed
        }
    });
}

// Updates the sidebar list of entries, showing a preview of each entry and its location
function updateSidebarList() {
    const listContainer = document.getElementById('entriesList');
    listContainer.innerHTML = '';
    // If there are no entries, show a friendly message encouraging the user to create one
    if (journalEntries.length === 0) {
        listContainer.innerHTML = '<p>No entries yet. Tap the map to create one!</p>';
        return;
    }
    // For each entry in the journalEntries array, create a div that shows the title, 
    // a truncated preview of the text, the coordinates, and an image thumbnail if available
    // clicking on it will open the detail panel for that entry
    journalEntries.forEach((entry) => {
        const entryDiv = document.createElement('div');
        entryDiv.style.borderBottom = '1px solid #ccc';
        entryDiv.style.padding = '10px 0';
        
        let imageHtml = '';
        if (entry.image) {
            imageHtml = `<img src="${entry.image}" alt="Entry image" style="width: 100%; height: 80px; object-fit: cover; margin: 8px 0; border-radius: 4px;">`;
        }
        
        const entryDate = entry.createdAt ? formatDate(entry.createdAt) : '';
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

// Opens the detail panel for a specific entry, showing the full text and location information
function openDetailPanel(pointRecord, entry) {
    const detailPanel = document.getElementById('entryDetailPanel');
    document.getElementById('detailTitle').innerText = entry.title;
    const dateStr = entry.createdAt ? formatDate(entry.createdAt) : '';
    const locationStr = `Location: ${pointRecord.lat}, ${pointRecord.lon}`;
    document.getElementById('detailMeta').innerText = dateStr ? `${dateStr} • ${locationStr}` : locationStr;

    const pointStory = stories.find((story) => story.entryIds.includes(entry.id)) || null;
    
    let detailHtml = '';
    if (entry.image) {
        detailHtml = `<img src="${entry.image}" alt="Entry image" style="width: 100%; max-height: 300px; object-fit: contain; margin-bottom: 15px; border-radius: 4px;">`;
    }
    if (pointStory && entry.storyDistanceInfo) {
        detailHtml += `
            <div style="background: #f8e8eb; padding: 10px; margin-bottom: 12px; border-radius: 6px; border-left: 4px solid #a43855;">
                <strong>Part of Story: ${escapeHtml(pointStory.title)}</strong><br/>
                <small>Distance from previous: ${entry.storyDistanceInfo.distFromPrev.toFixed(2)} mi</small><br/>
                <small>Distance to next: ${entry.storyDistanceInfo.distToNext.toFixed(2)} mi</small>
            </div>
        `;
    }
    detailHtml += entry.textHtml;
    
    document.getElementById('detailContent').innerHTML = detailHtml;
    detailPanel.classList.add('active');
}

// Closes the entry detail panel
function closeDetailPanel() {
    document.getElementById('entryDetailPanel').classList.remove('active');
}

// Handles app entry (login or guest mode)
function enterApp(userLabel, guestMode) {
    isGuestMode = guestMode;
    if (!isGuestMode) {
        guestEntryWarningShown = false;
    }
    
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';
    document.getElementById('userInfo').innerText = userLabel;

    document.getElementById('sidebar').classList.remove('active');
    document.querySelector('.map-container').style.display = 'block';

    if (!mapInitialized) {
        initMap();
        mapInitialized = true;
    }
}
