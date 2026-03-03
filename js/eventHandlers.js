// Global Event Handlers - Clicks, Drag & Drop

// Main click delegation for login, navigation, and entry interactions
document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }
    // Login & Navigation
    if (target.closest('#loginBtn')) {
        const email = document.getElementById('emailInput').value;
        if (email) {
            enterApp(`User: ${email}`, false);
        } else {
            alert("Please enter an email to log in!");
        }
        return;
    }
    // Guest mode button
    if (target.closest('#guestBtn')) {
        enterApp('Guest mode: data will not be saved', true);
        return;
    }
    // Navigation buttons
    if (target.closest('#navMap')) {
        document.getElementById('sidebar').classList.remove('active');
        document.querySelector('.map-container').style.display = 'block';
        document.getElementById('entryDetailPanel').classList.remove('active');
        updateMobileNavState('navMap');
        return;
    }
    if (target.closest('#navList')) {
        document.getElementById('sidebar').classList.add('active');
        document.querySelector('.map-container').style.display = 'none';
        updateMobileNavState('navList');
        return;
    }
    if (target.closest('#navProfile')) {
        // Profile view - for now, just show the sidebar
        document.getElementById('sidebar').classList.add('active');
        document.querySelector('.map-container').style.display = 'none';
        updateMobileNavState('navProfile');
        return;
    }
    // Entry Modal buttons
    if (target.closest('#cancelEntryBtn')) {
        closeEntryModal();
        return;
    }
    // Detail Panel buttons
    if (target.closest('#saveEntryBtn')) {
        saveEntry();
        return;
    }
    if (target.closest('#closeDetailBtn')) {
        closeDetailPanel();
        return;
    }
    // Editor formatting buttons
    const editorBtn = target.closest('.editor-btn');
    if (editorBtn) {
        applyEditorCommand(editorBtn.getAttribute('data-cmd'));
    }
    
    // Image removal button
    if (target.closest('#removeImageBtn')) {
        currentEntryImage = null;
        document.getElementById('imagePreview').innerHTML = '';
        document.getElementById('entryImageInput').value = '';
        document.getElementById('removeImageBtn').style.display = 'none';
        return;
    }
});

// Story-related click listeners
document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('#storiesBtn')) { openStoriesModal(); return; }
    if (target.closest('#closeStoriesBtn')) { document.getElementById('storiesModal').style.display = 'none'; return; }
    if (target.closest('#createNewStoryBtn')) { openStoryEditModal(null); return; }
    if (target.closest('#cancelStoryBtn')) { document.getElementById('storyEditModal').style.display = 'none'; return; }
    if (target.closest('#saveStoryBtn')) { saveStory(); return; }

    if (target.closest('.add-to-story-btn')) { moveEntryToStory(parseInt(target.getAttribute('data-id'), 10)); }
    if (target.closest('.remove-from-story-btn')) { removeEntryFromStory(parseInt(target.getAttribute('data-id'), 10)); }
    if (target.closest('.toggle-story-vis-btn')) { toggleStoryVisibility(parseInt(target.getAttribute('data-id'), 10)); }
    if (target.closest('.edit-story-btn')) { openStoryEditModal(parseInt(target.getAttribute('data-id'), 10)); }
});

// HTML5 Native Drag & Drop Listeners for story entry reordering
document.addEventListener('dragstart', e => {
    if (e.target.closest('#storyEntriesList .draggable-item')) {
        draggedEntryItem = e.target.closest('.draggable-item');
        e.dataTransfer.effectAllowed = 'move';
    }
});

document.addEventListener('dragover', e => {
    const list = document.getElementById('storyEntriesList');
    if (list && list.contains(e.target)) {
        e.preventDefault();
        const targetItem = e.target.closest('.draggable-item');
        if (targetItem && targetItem !== draggedEntryItem && draggedEntryItem) {
            const rect = targetItem.getBoundingClientRect();
            const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
            list.insertBefore(draggedEntryItem, next ? targetItem.nextSibling : targetItem);
        }
    }
});

document.addEventListener('dragend', e => { draggedEntryItem = null; });
// Image upload handler
document.getElementById('entryImageInput')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) {
        return;
    }
    
    // Validate file type
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
        alert('Please select a JPG or PNG image');
        event.target.value = '';
        return;
    }
    
    // Validate file size (limit to 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        alert('Image must be smaller than 5MB');
        event.target.value = '';
        return;
    }
    
    // Read the file and convert to base64
    const reader = new FileReader();
    reader.onload = (e) => {
        currentEntryImage = e.target?.result;
        const imagePreview = document.getElementById('imagePreview');
        imagePreview.innerHTML = `<img src="${currentEntryImage}" alt="Entry image" style="max-width: 200px; max-height: 200px; margin-top: 10px; border-radius: 4px;">`;
        document.getElementById('removeImageBtn').style.display = 'inline-block';
    };
    reader.onerror = () => {
        alert('Error reading image file');
        event.target.value = '';
    };
    reader.readAsDataURL(file);
});

// Mobile navigation state management
function updateMobileNavState(activeNavId) {
    const navButtons = document.querySelectorAll('.mobile-nav button');
    navButtons.forEach((btn) => {
        btn.classList.remove('active');
    });
    const activeButton = document.getElementById(activeNavId);
    if (activeButton) {
        activeButton.classList.add('active');
    }
}