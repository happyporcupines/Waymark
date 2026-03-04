// Utility Functions

// Rounds coordinates to 3 decimal places for consistent point keys
function roundCoord(value) {
    return Math.round(value * 1000) / 1000;
}

// Builds a unique key for a point based on its rounded latitude and longitude
function buildPointKey(lat, lon) {
    return `${roundCoord(lat)},${roundCoord(lon)}`;
}

// Converts HTML content to plain text for previews and storage
function htmlToText(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return (temp.textContent || '').trim();
}

// Truncates text to a specified length and adds ellipsis if needed
function truncateText(text, maxLength = 180) {
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength)}...`;
}

// Escapes HTML special characters to prevent injection in popups and lists
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Formats a timestamp to a readable date string
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

// Converts a timestamp to datetime-local input format (YYYY-MM-DDTHH:MM)
function timestampToDatetimeLocal(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Converts datetime-local input value to timestamp
function datetimeLocalToTimestamp(datetimeLocalValue) {
    return new Date(datetimeLocalValue).getTime();
}
