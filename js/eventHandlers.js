/**
 * ============================================================
 * EVENT HANDLERS & INTERACTIONS
 * ============================================================
 * 
 * This module contains all event listeners for the application:
 * - Button click handlers (login, navigation, modals)
 * - Drag & drop for story entry reordering
 * - Image upload and processing
 * - Color picker interactions
 * - Text editor commands
 * - Form submissions
 * 
 * DEPENDENCIES: state.js, ui.js, map.js, stories.js, eventHandlers.js
 * 
 * ============================================================
 */

// ============================================================
// MAIN CLICK HANDLER - Login, Navigation, Modals
// ============================================================

/**
 * Central click delegation handler for:
 * - Login/navigation buttons
 * - Modal buttons (open/close)
 * - Entry interaction buttons
 * - Editor formatting buttons
 * 
 * Uses event.target.closest() to handle button clicks
 * anywhere within the button element.
 */
document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }
    
    // ============================================================
    // LOGIN & NAVIGATION
    // ============================================================
    
    // Login button
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
    
    // Navigation: Map view
    if (target.closest('#navMap')) {
        document.getElementById('sidebar').classList.remove('active');
        document.querySelector('.map-container').style.display = 'block';
        document.getElementById('entryDetailPanel').classList.remove('active');
        updateMobileNavState('navMap');
        return;
    }
    
    // Navigation: Entry list view
    if (target.closest('#navList')) {
        document.getElementById('sidebar').classList.add('active');
        document.querySelector('.map-container').style.display = 'none';
        updateMobileNavState('navList');
        return;
    }
    
    // Navigation: Profile view
    if (target.closest('#navProfile')) {
        document.getElementById('sidebar').classList.add('active');
        document.querySelector('.map-container').style.display = 'none';
        updateMobileNavState('navProfile');
        return;
    }
    
    // ============================================================
    // ENTRY MODAL BUTTONS
    // ============================================================
    
    // Cancel/close entry modal
    if (target.closest('#cancelEntryBtn')) {
        closeEntryModal();
        return;
    }
    
    // Save entry
    if (target.closest('#saveEntryBtn')) {
        saveEntry();
        return;
    }
    
    // Close detail panel
    if (target.closest('#closeDetailBtn')) {
        closeDetailPanel();
        return;
    }
    
    // ============================================================
    // TEXT EDITOR FORMATTING BUTTONS
    // ============================================================
    
    const editorBtn = target.closest('.editor-btn');
    if (editorBtn) {
        applyEditorCommand(editorBtn.getAttribute('data-cmd'));
        return;
    }

    // ============================================================
    // SIDEBAR ENTRY LINKS
    // ============================================================
    
    // Click on entry in sidebar to edit it
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
    
    // ============================================================
    // IMAGE MANAGEMENT
    // ============================================================
    
    // Remove image from entry
    if (target.closest('#removeImageBtn')) {
        currentEntryImage = null;
        document.getElementById('imagePreview').innerHTML = '';
        document.getElementById('entryImageInput').value = '';
        document.getElementById('removeImageBtn').style.display = 'none';
    }
});


// ============================================================
// STORY-RELATED CLICK HANDLERS
// ============================================================

/**
 * Story modal and editor button handlers.
 * Separated from main handler for clarity.
 */
document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    // Modal buttons
    if (target.closest('#storiesBtn')) { openStoriesModal(); return; }
    if (target.closest('#closeStoriesBtn')) { document.getElementById('storiesModal').style.display = 'none'; return; }
    if (target.closest('#createNewStoryBtn')) { openStoryEditModal(null); return; }
    if (target.closest('#cancelStoryBtn')) { document.getElementById('storyEditModal').style.display = 'none'; return; }
    if (target.closest('#saveStoryBtn')) { saveStory(); return; }

    // Story entry management
    if (target.closest('.add-to-story-btn')) { moveEntryToStory(parseInt(target.getAttribute('data-id'), 10)); }
    if (target.closest('.remove-from-story-btn')) { removeEntryFromStory(parseInt(target.getAttribute('data-id'), 10)); }
    if (target.closest('.toggle-story-vis-btn')) { toggleStoryVisibility(parseInt(target.getAttribute('data-id'), 10)); }
    if (target.closest('.edit-story-btn')) { openStoryEditModal(parseInt(target.getAttribute('data-id'), 10)); }
    
    // ============================================================
    // COLOR PICKER MODAL
    // ============================================================
    
    if (target.closest('#openColorPickerBtn') || target.id === 'colorPreview') {
        const currentColor = document.getElementById('colorHexInput')?.value || '#a43855';
        if (typeof setColorFromHex === 'function') {
            setColorFromHex(currentColor);
        }
        const modal = document.getElementById('colorPickerModal');
        if (modal) modal.style.display = 'flex';
        return;
    }
    
    // Apply color from picker
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
    
    // Cancel color picker
    if (target.closest('#cancelColorBtn')) {
        const modal = document.getElementById('colorPickerModal');
        if (modal) modal.style.display = 'none';
        return;
    }
    
    // Quick color preset buttons
    const quickColorBtn = target.closest('.quick-color-btn');
    if (quickColorBtn) {
        const color = quickColorBtn.getAttribute('data-color');
        if (color) {
            if (typeof applyColorToStory === 'function') {
                applyColorToStory(color);
            }
            if (typeof setColorFromHex === 'function') {
                setColorFromHex(color);
            }
        }
    }
});


// ============================================================
// DRAG & DROP - Story Entry Reordering
// ============================================================

/**
 * HTML5 native drag & drop for reordering entries in story editor.
 * User can drag entries to change the order of the journey.
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


// ============================================================
// IMAGE UPLOAD
// ============================================================

/**
 * Handle image file selection and conversion to base64.
 * Validates file type (JPEG/PNG) and size (max 5MB).
 * Displays preview in entry modal.
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
    
    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        alert('Image must be smaller than 5MB');
        event.target.value = '';
        return;
    }
    
    // Read file and convert to base64
    const reader = new FileReader();
    reader.onload = (e) => {
        currentEntryImage = e.target?.result;
        const imagePreview = document.getElementById('imagePreview');
        imagePreview.innerHTML = 
            `<img src="${currentEntryImage}" alt="Entry image" style="max-width: 200px; max-height: 200px; margin-top: 10px; border-radius: 4px;">`;
        document.getElementById('removeImageBtn').style.display = 'inline-block';
    };
    reader.onerror = () => {
        alert('Error reading image file');
        event.target.value = '';
    };
    reader.readAsDataURL(file);
});


// ============================================================
// TEXT EDITOR - Special Key Handling
// ============================================================

/**
 * Handle Enter key in contenteditable editor.
 * Ensures proper line breaks on mobile.
 */
document.addEventListener('keydown', (event) => {
    const editor = document.getElementById('entryEditor');
    if (!editor || event.target !== editor) {
        return;
    }
    
    // Let browser handle Enter naturally
    if (event.key === 'Enter' || event.keyCode === 13) {
        return;
    }
});


// ============================================================
// FORM SUBMISSION PREVENTION
// ============================================================

/**
 * Prevent form submission (modals don't use forms)
 */
document.addEventListener('submit', (event) => {
    event.preventDefault();
    return false;
});


// ============================================================
// MOBILE NAVIGATION STATE
// ============================================================

/**
 * Updates mobile nav button active states.
 * Visual indicator for which view is currently active.
 * 
 * @param {string} activeNavId - ID of active nav button
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


// ============================================================
// COLOR PICKER - HSL Color Management
// ============================================================

/**
 * Global color picker state (HSL format)
 * Used for both main editor and color picker modal
 */
let currentHue = 341;      // 0-360 (red zone)
let currentSat = 67;       // 0-100 (saturation %)
let currentLight = 40;     // 0-100 (lightness %)



/**
 * Converts HSL color values to hexadecimal format.
 * Used for color picker preview and application.
 * 
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {string} Hex color code (e.g., "#a43855")
 */
function hslToHex(h, s, l) {
    s = s / 100;
    l = l / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    
    // Determine RGB quadrant based on hue
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
    
    // Convert to 0-255 range
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    // Convert to hex
    const toHex = (n) => {
        const hex = n.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    
    return '#' + toHex(r) + toHex(g) + toHex(b);
}


/**
 * Converts hexadecimal color to HSL format.
 * Used to initialize color picker from hex input.
 * 
 * @param {string} hex - Hex color code (e.g., "#a43855")
 * @returns {Object} {h: 0-360, s: 0-100, l: 0-100}
 */
function hexToHSL(hex) {
    // Parse hex string to RGB values
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { h: 0, s: 0, l: 0 };
    
    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    
    // Calculate saturation and hue
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


/**
 * Updates color picker display from current HSL values.
 * Updates preview box and gradient slider backgrounds.
 */
function updateColorFromHSL() {
    const hexColor = hslToHex(currentHue, currentSat, currentLight);
    
    // Update modal preview box
    const previewLarge = document.getElementById('colorPreviewLarge');
    const hexInputModal = document.getElementById('colorHexInputModal');
    if (previewLarge) previewLarge.style.backgroundColor = hexColor;
    if (hexInputModal) hexInputModal.value = hexColor.toUpperCase();
    
    // Update saturation slider gradient (grayscale to full hue)
    const satSlider = document.getElementById('satSlider');
    if (satSlider) {
        const hueColor = hslToHex(currentHue, 100, 50);
        satSlider.style.background = `linear-gradient(to right, #808080, ${hueColor})`;
    }
    
    // Update lightness slider gradient (dark to light)
    const lightSlider = document.getElementById('lightSlider');
    if (lightSlider) {
        const darkColor = hslToHex(currentHue, currentSat, 0);
        const midColor = hslToHex(currentHue, currentSat, 50);
        const lightColor = hslToHex(currentHue, currentSat, 100);
        lightSlider.style.background = `linear-gradient(to right, ${darkColor}, ${midColor}, ${lightColor})`;
    }
}


/**
 * Sets color picker sliders from hex color value.
 * Used when loading a color into the picker.
 * 
 * @param {string} hex - Hex color code
 * @returns {boolean} True if valid, false otherwise
 */
function setColorFromHex(hex) {
    // Validate and normalize hex
    hex = hex.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (!/^#[0-9A-F]{6}$/i.test(hex)) return false;
    
    // Convert to HSL and update globals
    const hsl = hexToHSL(hex);
    currentHue = hsl.h;
    currentSat = hsl.s;
    currentLight = hsl.l;
    
    // Update slider values
    const hueSlider = document.getElementById('hueSlider');
    const satSlider = document.getElementById('satSlider');
    const lightSlider = document.getElementById('lightSlider');
    
    if (hueSlider) hueSlider.value = currentHue;
    if (satSlider) satSlider.value = currentSat;
    if (lightSlider) lightSlider.value = currentLight;
    
    // Update display
    updateColorFromHSL();
    return true;
}


/**
 * Applies selected color to story editor.
 * Updates color preview and hidden input values.
 * 
 * @param {string} hexColor - Hex color code to apply
 */
function applyColorToStory(hexColor) {
    const preview = document.getElementById('colorPreview');
    const hexInput = document.getElementById('colorHexInput');
    const nativeInput = document.getElementById('storyLineColor');
    
    if (preview) preview.style.backgroundColor = hexColor;
    if (hexInput) hexInput.value = hexColor.toUpperCase();
    if (nativeInput) nativeInput.value = hexColor;
}


// ============================================================
// COLOR PICKER - Slider and Input Listeners
// ============================================================

/**
 * Handle color picker slider and input changes.
 * Updates color in real-time as user adjusts sliders.
 * Supports both HSL sliders and direct hex input.
 */
document.addEventListener('input', (event) => {
    // Hue slider (0-360)
    if (event.target.id === 'hueSlider') {
        currentHue = parseInt(event.target.value, 10);
        updateColorFromHSL();
    }
    // Saturation slider (0-100)
    else if (event.target.id === 'satSlider') {
        currentSat = parseInt(event.target.value, 10);
        updateColorFromHSL();
    }
    // Lightness slider (0-100)
    else if (event.target.id === 'lightSlider') {
        currentLight = parseInt(event.target.value, 10);
        updateColorFromHSL();
    }
    // Hex input in color picker modal
    else if (event.target.id === 'colorHexInputModal') {
        let hex = event.target.value.toUpperCase();
        event.target.value = hex;
        if (hex.length === 7 && setColorFromHex(hex)) {
            applyColorToStory(hex);
        }
    }
    // Hex input in story editor
    else if (event.target.id === 'colorHexInput') {
        let hex = event.target.value.toUpperCase();
        event.target.value = hex;
        if (hex.length === 7 && /^#[0-9A-F]{6}$/i.test(hex)) {
            const preview = document.getElementById('colorPreview');
            if (preview) preview.style.backgroundColor = hex;
        }
    }
});