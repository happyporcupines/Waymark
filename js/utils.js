/**
 * ============================================================================
 * UTILS.JS - Utility Functions
 * ============================================================================
 * 
 * This file contains reusable helper functions used throughout the application.
 * Functions are organized by category: coordinate handling, text processing,
 * HTML sanitization, and date/time formatting.
 */

// ============================================================================
// COORDINATE UTILITIES
// ============================================================================

/**
 * Rounds a coordinate value to 3 decimal places for consistent point identification
 * 
 * This precision level (~111 meters at the equator) is sufficient for diary entries
 * while preventing floating-point comparison issues
 * 
 * @param {number} value - The coordinate value (latitude or longitude)
 * @returns {number} The rounded coordinate value
 * 
 * @example
 * roundCoord(35.123456) // Returns: 35.123
 * roundCoord(-106.644568) // Returns: -106.645
 */
function roundCoord(value) {
    return Math.round(value * 1000) / 1000;
}

/**
 * Builds a unique string key for a geographic point based on rounded coordinates
 * 
 * Point keys are used as Map keys in pointStore to manage entries at the same location.
 * Multiple entries can share the same point key if they're at the same coordinates.
 * 
 * @param {number} lat - Latitude value
 * @param {number} lon - Longitude value
 * @returns {string} Formatted key in "lat,lon" format with 3 decimal precision
 * 
 * @example
 * buildPointKey(35.123456, -106.644568) // Returns: "35.123,-106.645"
 */
function buildPointKey(lat, lon) {
    return `${roundCoord(lat)},${roundCoord(lon)}`;
}

/**
 * Calculates the great-circle distance between two points on Earth in miles
 * 
 * Uses the haversine formula for accurate geodesic distance calculation.
 * This replaces ArcGIS geometryEngine for Maptiler compatibility.
 * 
 * @param {number} lat1 - First point latitude
 * @param {number} lon1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lon2 - Second point longitude
 * @returns {number} Distance in miles
 * 
 * @example
 * const dist = haversineDistance(35.12, -106.64, 35.14, -106.62);
 * console.log(dist); // ~1.5 miles
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ============================================================================
// TEXT PROCESSING UTILITIES
// ============================================================================

/**
 * Converts HTML content to plain text by stripping all HTML tags
 * 
 * Used to extract readable text from the contenteditable editor for:
 * - Entry previews in the sidebar
 * - Plain text storage in journalEntries array
 * - Popup preview text
 * 
 * @param {string} html - HTML content (potentially containing tags)
 * @returns {string} Plain text content with whitespace trimmed
 * 
 * @example
 * htmlToText('<p>Hello <strong>world</strong>!</p>') // Returns: "Hello world!"
 */
function htmlToText(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return (temp.textContent || '').trim();
}

/**
 * Truncates text to a specified maximum length and adds ellipsis if needed
 * 
 * Used for creating entry previews in:
 * - Sidebar entry list (120 chars)
 * - Map popups (180 chars)
 * 
 * @param {string} text - The text to potentially truncate
 * @param {number} [maxLength=180] - Maximum character length before truncation
 * @returns {string} Original text or truncated text with "..." appended
 * 
 * @example
 * truncateText("A very long diary entry...", 10) // Returns: "A very lon..."
 * truncateText("Short", 10) // Returns: "Short"
 */
function truncateText(text, maxLength = 180) {
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength)}...`;
}

// ============================================================================
// HTML SANITIZATION
// ============================================================================

/**
 * Escapes HTML special characters to prevent XSS attacks and rendering issues
 * 
 * Critical for security when displaying user-generated content in popups,
 * story titles, and other dynamic HTML contexts.
 * 
 * Converts these characters:
 * - & → &amp;
 * - < → &lt;
 * - > → &gt;
 * - " → &quot;
 * - ' → &#39;
 * 
 * @param {*} value - Value to escape (converted to string first)
 * @returns {string} Escaped string safe for HTML insertion
 * 
 * @example
 * escapeHtml('<script>alert("XSS")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================================
// DATE/TIME FORMATTING UTILITIES
// ============================================================================

/**
 * Formats a Unix timestamp into a human-readable date/time string
 * 
 * Output format: "Jan 1, 2026, 12:30 PM"
 * 
 * Used for displaying entry creation times in:
 * - Sidebar entry list
 * - Entry detail panel
 * - Entry metadata
 * 
 * @param {number} timestamp - Unix timestamp (milliseconds since epoch)
 * @returns {string} Formatted date string in US locale format
 * 
 * @example
 * formatDate(1735689000000) // Returns: "Dec 31, 2024, 09:30 PM"
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
 * Converts a Unix timestamp to datetime-local input format
 * 
 * HTML datetime-local inputs require the format: "YYYY-MM-DDTHH:MM"
 * This function ensures proper zero-padding for all components.
 * 
 * Used when pre-filling the entry date input field during editing.
 * 
 * @param {number} timestamp - Unix timestamp (milliseconds since epoch)
 * @returns {string} Datetime string in "YYYY-MM-DDTHH:MM" format
 * 
 * @example
 * timestampToDatetimeLocal(1735689000000) // Returns: "2024-12-31T21:30"
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
 * Converts a datetime-local input value to a Unix timestamp
 * 
 * Parses the HTML datetime-local format back into milliseconds since epoch.
 * Used when saving entries to store the selected date as a timestamp.
 * 
 * @param {string} datetimeLocalValue - Datetime string from datetime-local input
 * @returns {number} Unix timestamp (milliseconds since epoch)
 * 
 * @example
 * datetimeLocalToTimestamp("2024-12-31T21:30") // Returns: 1735689000000
 */
function datetimeLocalToTimestamp(datetimeLocalValue) {
    return new Date(datetimeLocalValue).getTime();
}
