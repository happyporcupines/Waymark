/**
 * ============================================================================
 * EVENTHANDLERS.JS - Global Event Listeners & User Interactions
 * ============================================================================
 * 
 * This file sets up all DOM event listeners for user interactions throughout
 * the application. Uses event delegation for efficiency and dynamic content.
 * 
 * EVENT CATEGORIES:
 * 
 * 1. LOGIN & NAVIGATION:
 *    - Login button, guest mode button
 *    - Mobile navigation (Map/Entries/Profile)
 * 
 * 2. ENTRY MANAGEMENT:
 *    - Entry modal buttons (save, cancel)
 *    - Editor toolbar (formatting commands)
 *    - Sidebar entry clicks
 *    - Image upload and removal
 * 
 * 3. STORY MANAGEMENT:
 *    - Stories modal (open, close, create)
 *    - Story editor (add/remove entries, save, cancel)
 *    - Drag & drop entry reordering
 *    - Story visibility toggle
 * 
 * 4. COLOR PICKER:
 *    - Custom HSL sliders
 *    - Hex input fields
 *    - Quick color preset buttons
 * 
 * 5. DETAIL PANEL:
 *    - Close button
 * 
 * EVENT DELEGATION STRATEGY:
 * Most handlers use event delegation on document.addEventListener('click')
 * checking event.target.closest() to match specific elements. This works
 * for both static and dynamically created elements.
 */

// ============================================================================
// LOGIN, NAVIGATION & ENTRY MANAGEMENT EVENTS
// ============================================================================

/**
 * Main click delegation handler for login, navigation, and entry interactions
 * 
 * Uses event.target.closest() to match button selectors, allowing the
 * handler to work with dynamically created elements and nested DOM structures.
 */
document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }
    // Login & Navigation
    if (target.closest('#loginBtn')) {
        const email = document.getElementById('emailInput').value.trim();
        const password = document.getElementById('passwordInput').value;
        if (email && password) {
            if (typeof handleLoginAction === 'function') {
                handleLoginAction(email, password);
            } else {
                enterApp(`User: ${email}`, false);
            }
        } else {
            alert('Please enter both email and password to continue.');
        }
        return;
    }
    // Guest mode button
    if (target.closest('#guestBtn')) {
        enterApp('Guest mode: data will not be saved', true);
        return;
    }
    if (target.closest('#logoutBtn')) {
        if (typeof handleLogoutAction === 'function') {
            handleLogoutAction();
        }
        return;
    }
    if (target.closest('#profileSummaryBtn')) {
        if (typeof openProfileModal === 'function') {
            openProfileModal();
        }
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
        if (typeof openProfileModal === 'function') {
            openProfileModal();
            if (!authenticatedUser) {
                alert('Sign in to edit your profile.');
            }
        }
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
    if (target.closest('#cancelProfileBtn')) {
        if (typeof closeProfileModal === 'function') {
            closeProfileModal();
        }
        return;
    }
    if (target.closest('#saveProfileBtn')) {
        if (typeof saveProfileChanges === 'function') {
            saveProfileChanges();
        }
        return;
    }
    // Editor formatting buttons
    const editorBtn = target.closest('.editor-btn');
    if (editorBtn) {
        applyEditorCommand(editorBtn.getAttribute('data-cmd'));
        return;
    }

    const sidebarTitle = target.closest('.entry-title-link');
    if (sidebarTitle) {
        const entryId = parseInt(sidebarTitle.getAttribute('data-entry-id'), 10);
        if (!Number.isFinite(entryId)) {
            return;
        }
        const pointRecord = findPointRecordByEntryId(entryId);
        if (!pointRecord) {
            return;
        }
        const entry = findEntryById(pointRecord, entryId);
        if (!entry) {
            return;
        }
        openEntryModal('edit', pointRecord, entry);
        return;
    }
    
    // ========================================================================
    // IMAGE UPLOAD & REMOVAL
    // ========================================================================
    
    // Remove currently uploaded image from entry
    if (target.closest('#removeImageBtn')) {
        currentEntryImage = null;
        document.getElementById('imagePreview').innerHTML = '';
        document.getElementById('entryImageInput').value = '';
        document.getElementById('removeImageBtn').style.display = 'none';
        return;
    }
});

// ============================================================================
// STORY MANAGEMENT EVENTS
// ============================================================================

/**
 * Story-related click handlers
 * 
 * Handles:
 * - Opening/closing story modals
 * - Creating new stories
 * - Editing existing stories
 * - Adding/removing entries from stories
 * - Toggling story visibility
 * - Color picker interactions
 */
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
    
    // Color picker modal handlers
    if (target.closest('#openColorPickerBtn') || target.id === 'colorPreview') {
        const currentColor = document.getElementById('colorHexInput')?.value || '#a43855';
        if (typeof setColorFromHex === 'function') {
            setColorFromHex(currentColor);
        }
        const modal = document.getElementById('colorPickerModal');
        if (modal) modal.style.display = 'flex';
        return;
    }
    
    if (target.closest('#applyColorBtn')) {
        if (typeof hslToHex === 'function' && typeof currentHue !== 'undefined') {
            const hexColor = hslToHex(currentHue, currentSat, currentLight);
            if (typeof applyColorToStory === 'function') {
                applyColorToStory(hexColor);
            }
        }
        const modal = document.getElementById('colorPickerModal');
        if (modal) modal.style.display = 'none';
        return;
    }
    
    if (target.closest('#cancelColorBtn')) {
        const modal = document.getElementById('colorPickerModal');
        if (modal) modal.style.display = 'none';
        return;
    }
    
    // ========================================================================
    // COLOR PICKER: Quick preset buttons
    // ========================================================================
    const quickColorBtn = target.closest('.quick-color-btn');
    if (quickColorBtn) {
        const color = quickColorBtn.getAttribute('data-color');
        if (color) {
            // Apply to story editor immediately
            if (typeof applyColorToStory === 'function') {
                applyColorToStory(color);
            }
            // Update sliders in modal if it's open
            if (typeof setColorFromHex === 'function') {
                setColorFromHex(color);
            }
        }
        return;
    }
});

// ============================================================================
// HTML5 DRAG & DROP: Story Entry Reordering
// ============================================================================

/**
 * Drag and drop handlers for reordering entries within a story
 * 
 * Allows users to drag entries in the "Selected Entries" list to
 * change the story sequence. The order determines the path direction
 * and distance calculations.
 * 
 * Uses HTML5 drag & drop API with dragstart, dragover, and dragend events.
 */
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

// ============================================================================
// IMAGE UPLOAD HANDLER
// ============================================================================

/**
 * Handles image file selection and preview for diary entries
 * 
 * Validation:
 * - File type: JPG or PNG only
 * - File size: Max 5MB
 * 
 * Process:
 * 1. Validate file type and size
 * 2. Read file as base64 data URL using FileReader
 * 3. Store in currentEntryImage variable
 * 4. Display preview thumbnail
 * 5. Show remove button
 */
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

// ============================================================================
// KEYBOARD EVENT HANDLERS
// ============================================================================

/**
 * Handle Enter key in contenteditable editor
 * 
 * Ensures proper line breaks on mobile keyboards by allowing
 * browser's natural Enter key handling (no preventDefault).
 */
document.addEventListener('keydown', (event) => {
    const editor = document.getElementById('entryEditor');
    if (!editor || event.target !== editor) {
        return;
    }
    
    // Check for Enter/Return key (keyCode 13 for better mobile compatibility)
    if (event.key === 'Enter' || event.keyCode === 13) {
        // Don't prevent default - let the browser handle it naturally
        // The issue was likely preventDefault breaking mobile keyboard behavior
        return;
    }
});

// Additional handler to catch any form submission attempts
document.addEventListener('submit', (event) => {
    event.preventDefault();
    return false;
});

/**
 * Updates mobile navigation button active states
 * 
 * Highlights the currently active view button (Map/Entries/Profile)
 */
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

// ============================================================================
// CUSTOM COLOR PICKER LOGIC
// ============================================================================

/**
 * Custom HSL color picker for story line customization
 * 
 * Provides three sliders for:
 * - Hue (0-360): Color selection
 * - Saturation (0-100): Color intensity
 * - Lightness (0-100): Brightness
 * 
 * Features:
 * - Live preview with gradient backgrounds on sliders
 * - Hex input/output for precise color entry
 * - Conversion between HSL and hex formats
 * - Syncs with quick color presets
 * 
 * The picker updates both the modal preview and the main story editor
 * color field in real-time.
 */

// Current HSL values (default to burgundy #a43855)
let currentHue = 341;
let currentSat = 67;
let currentLight = 40;

// Helper functions for color conversion
function hslToHex(h, s, l) {
    s = s / 100;
    l = l / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    
    if (h >= 0 && h < 60) {
        r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
        r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
        r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
        r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
        r = x; g = 0; b = c;
    } else if (h >= 300 && h < 360) {
        r = c; g = 0; b = x;
    }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    const toHex = (n) => {
        const hex = n.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

function hexToHSL(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { h: 0, s: 0, l: 0 };
    
    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    
    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    };
}

function updateColorFromHSL() {
    const hexColor = hslToHex(currentHue, currentSat, currentLight);
    
    // Update modal preview
    const previewLarge = document.getElementById('colorPreviewLarge');
    const hexInputModal = document.getElementById('colorHexInputModal');
    if (previewLarge) previewLarge.style.backgroundColor = hexColor;
    if (hexInputModal) hexInputModal.value = hexColor.toUpperCase();
    
    // Update saturation gradient
    const satSlider = document.getElementById('satSlider');
    if (satSlider) {
        const hueColor = hslToHex(currentHue, 100, 50);
        satSlider.style.background = `linear-gradient(to right, #808080, ${hueColor})`;
    }
    
    // Update lightness gradient
    const lightSlider = document.getElementById('lightSlider');
    if (lightSlider) {
        const darkColor = hslToHex(currentHue, currentSat, 0);
        const midColor = hslToHex(currentHue, currentSat, 50);
        const lightColor = hslToHex(currentHue, currentSat, 100);
        lightSlider.style.background = `linear-gradient(to right, ${darkColor}, ${midColor}, ${lightColor})`;
    }
}

function setColorFromHex(hex) {
    // Validate and clean hex
    hex = hex.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (!/^#[0-9A-F]{6}$/i.test(hex)) return false;
    
    const hsl = hexToHSL(hex);
    currentHue = hsl.h;
    currentSat = hsl.s;
    currentLight = hsl.l;
    
    const hueSlider = document.getElementById('hueSlider');
    const satSlider = document.getElementById('satSlider');
    const lightSlider = document.getElementById('lightSlider');
    
    if (hueSlider) hueSlider.value = currentHue;
    if (satSlider) satSlider.value = currentSat;
    if (lightSlider) lightSlider.value = currentLight;
    
    updateColorFromHSL();
    return true;
}

function applyColorToStory(hexColor) {
    const preview = document.getElementById('colorPreview');
    const hexInput = document.getElementById('colorHexInput');
    const nativeInput = document.getElementById('storyLineColor');
    
    if (preview) preview.style.backgroundColor = hexColor;
    if (hexInput) hexInput.value = hexColor.toUpperCase();
    if (nativeInput) nativeInput.value = hexColor;
}

// Color picker event listeners
document.addEventListener('input', (event) => {
    if (event.target.id === 'hueSlider') {
        currentHue = parseInt(event.target.value, 10);
        updateColorFromHSL();
    } else if (event.target.id === 'satSlider') {
        currentSat = parseInt(event.target.value, 10);
        updateColorFromHSL();
    } else if (event.target.id === 'lightSlider') {
        currentLight = parseInt(event.target.value, 10);
        updateColorFromHSL();
    } else if (event.target.id === 'colorHexInputModal') {
        // User typing in modal hex input
        let hex = event.target.value.toUpperCase();
        event.target.value = hex;
        if (hex.length === 7 && setColorFromHex(hex)) {
            applyColorToStory(hex);
        }
    } else if (event.target.id === 'colorHexInput') {
        // User typing in main hex input - auto uppercase
        let hex = event.target.value.toUpperCase();
        event.target.value = hex;
        if (hex.length === 7 && /^#[0-9A-F]{6}$/i.test(hex)) {
            const preview = document.getElementById('colorPreview');
            if (preview) preview.style.backgroundColor = hex;
        }
    }
});