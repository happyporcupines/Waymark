/**
 * ============================================================
 * UTILITY FUNCTIONS - Helpers & Formatters
 * ============================================================
 * 
 * This module contains helper functions used throughout the
 * Waymark application. Functions are organized by category:
 * - Coordinate handling
 * - Text/HTML processing
 * - Formatting (dates, text truncation)
 * 
 * DEPENDENCIES: None - this should be loaded first
 * 
 * ============================================================
 */

// ============================================================
// COORDINATES - Point Identification
// ============================================================

/**
 * Rounds a coordinate value to 3 decimal places for consistent point keys.
 * This ensures that nearby clicks (within ~111 meters) are treated as
 * the same location.
 * 
 * @param {number} value - Latitude or longitude to round
 * @returns {number} Rounded value with 3 decimal places
 * 
 * EXAMPLE: roundCoord(35.1264569) => 35.126
 */
function roundCoord(value) {
    return Math.round(value * 1000) / 1000;
}


/**
 * Builds a unique key for a point based on rounded lat/lon.
 * Used as Map key in pointStore to group entries at same location.
 * 
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {string} Point key in format "35.126,-106.644"
 * 
 * EXAMPLE: buildPointKey(35.1264, -106.6456) => "35.126,-106.646"
 */
function buildPointKey(lat, lon) {
    return `${roundCoord(lat)},${roundCoord(lon)}`;
}


// ============================================================
// TEXT PROCESSING - HTML & Plain Text
// ============================================================

/**
 * Converts HTML content to plain text for previews and storage.
 * Removes all HTML tags but preserves the text content.
 * 
 * @param {string} html - HTML string to convert
 * @returns {string} Plain text without HTML tags
 * 
 * EXAMPLE: htmlToText("<p>Hello <b>world</b></p>") => "Hello world"
 */
function htmlToText(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return (temp.textContent || '').trim();
}


/**
 * Truncates text to a maximum length and adds ellipsis if needed.
 * Used for displaying entry previews in the sidebar and popups.
 * 
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length (default 180 characters)
 * @returns {string} Truncated text with "..." appended if truncated
 * 
 * EXAMPLE: truncateText("A very long entry...", 10) => "A very lon..."
 */
function truncateText(text, maxLength = 180) {
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength)}...`;
}


/**
 * Escapes HTML special characters to prevent injection attacks.
 * Converts characters that have special meaning in HTML to entity codes.
 * CRITICAL for user input displayed in popups and sidebars.
 * 
 * @param {string} value - Text to escape
 * @returns {string} HTML-safe text
 * 
 * EXAMPLE: escapeHtml('<script>alert("XSS")</script>') => "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;"
 */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')    // & -> &amp;
        .replace(/</g, '&lt;')     // < -> &lt;
        .replace(/>/g, '&gt;')     // > -> &gt;
        .replace(/"/g, '&quot;')   // " -> &quot;
        .replace(/'/g, '&#39;');   // ' -> &#39;
}


// ============================================================
// FORMATTING - Dates & Display
// ============================================================

/**
 * Formats a timestamp to a readable date string for display.
 * 
 * @param {number} timestamp - Milliseconds since epoch
 * @returns {string} Formatted date like "Jan 15, 2024, 02:30 PM"
 * 
 * EXAMPLE: formatDate(Date.now()) => "Jan 15, 2024, 02:30 PM"
 */
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    };
    return date.toLocaleDateString('en-US', options);
}


/**
 * Converts a timestamp to HTML5 datetime-local input format.
 * HTML5 datetime-local inputs require format "YYYY-MM-DDTHH:MM"
 * 
 * @param {number} timestamp - Milliseconds since epoch
 * @returns {string} Datetime string in format "2024-01-15T14:30"
 * 
 * EXAMPLE: timestampToDatetimeLocal(Date.now()) => "2024-01-15T14:30"
 */
function timestampToDatetimeLocal(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}


/**
 * Converts HTML5 datetime-local input value to timestamp.
 * Reverse of timestampToDatetimeLocal() function.
 * 
 * @param {string} datetimeLocalValue - Datetime string in format "2024-01-15T14:30"
 * @returns {number} Milliseconds since epoch
 * 
 * EXAMPLE: datetimeLocalToTimestamp("2024-01-15T14:30") => 1705334400000
 */
function datetimeLocalToTimestamp(datetimeLocalValue) {
    return new Date(datetimeLocalValue).getTime();
}

