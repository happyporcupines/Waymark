/**
 * ============================================================
 * WAYMARK - Main Entry Point
 * ============================================================
 * 
 * This file serves as the main entry point for the Waymark
 * application. It contains legacy navigation code that may be
 * replaced by modern routing.
 * 
 * Current Status: Minimal - most functionality is in individual
 * JS modules. This file is kept for compatibility.
 * 
 * ============================================================
 */

/**
 * Legacy navigation function (deprecated - kept for compatibility)
 * Modern code should use the event handlers in eventHandlers.js
 * 
 * @param {string} an_id - The ID of the element to navigate to
 */
function navigate(an_id) {
    // Find the problem div by building the ID from the parameter
    const problem_div = document.getElementById("d" + an_id);
    const preview_div = document.getElementById("preview");
    
    // Update preview content
    if (preview_div) {
        preview_div.innerHTML = problem_div 
            ? problem_div.innerHTML 
            : "Select a problem element in tree";
    }
}
