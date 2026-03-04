/**
 * ============================================================
 * STATE MANAGEMENT - Global Application State
 * ============================================================
 * 
 * This module defines all global variables used throughout the
 * Waymark application. It acts as a centralized state store that
 * is modified by various modules.
 * 
 * IMPORTANT: This should be loaded FIRST before any other JS modules.
 * 
 * State Categories:
 * 1. Authentication & User Mode
 * 2. Entry Data Structures
 * 3. Map & UI References
 * 4. Story Management
 * 5. Editing Context
 * 
 * ============================================================
 */

// ============================================================
// AUTHENTICATION & USER MODE
// ============================================================

/** Whether the map is initialized and ready to use */
let mapInitialized = false;

/** Whether user is in guest mode (data not saved) */
let isGuestMode = false;

/** Whether the guest mode warning has been shown to user */
let guestEntryWarningShown = false;


// ============================================================
// ENTRY DATA STRUCTURES
// ============================================================

/** Array of all diary entries created by user (guest mode only) */
let journalEntries = [];

/** Current coordinates where user clicked to create/edit entry */
let currentClickCoords = null;

/** Unique key for current point being edited (e.g., "35.126,106.644") */
let currentPointKey = null;

/** ID of entry currently being edited in modal */
let currentEditingEntryId = null;

/** Counter for generating unique entry IDs */
let nextEntryId = 1;

/**
 * Map that stores all points with their entries
 * Key: pointKey (rounded coordinates), Value: pointRecord object
 * 
 * pointRecord structure:
 * {
 *   pointKey: "35.126,106.644",
 *   lat: 35.126,
 *   lon: 106.644,
 *   mapPoint: {x, y, spatialReference}, // ArcGIS Point object
 *   entries: [entry1, entry2, ...],     // Array of entries at this point
 *   graphic: null                       // ArcGIS Graphic for map display
 * }
 */
const pointStore = new Map();


// ============================================================
// MAP & UI REFERENCES
// ============================================================

/** ArcGIS MapView instance - the main interactive map display */
let appView = null;

/** ArcGIS GraphicsLayer - layer that displays point markers */
let appGraphicsLayer = null;

/** Constructor function for ArcGIS Graphic objects (saved at init) */
let GraphicCtor = null;

/** Constructor function for ArcGIS GraphicsLayer (saved at init) */
let GraphicsLayerCtor = null;

/** Constructor function for ArcGIS Polyline (saved at init) */
let PolylineCtor = null;

/** ArcGIS geometryEngine module for calculating distances */
let geometryEngineModule = null;

/** Reference to the ArcGIS Map instance */
let mapInstance = null;


// ============================================================
// STORY MANAGEMENT
// ============================================================

/**
 * Array of all user-created stories
 * 
 * story structure:
 * {
 *   id: 1,                           // Unique story ID
 *   title: "Summer Road Trip",       // User-given title
 *   entryIds: [1, 3, 5],            // IDs of entries in this story
 *   visible: true,                   // Whether story is visible on map
 *   totalMiles: 147.5,              // Total distance of journey
 *   graphicsLayer: GraphicsLayer,   // Layer for drawing story line
 *   lineColor: "#a43855"             // Hex color for story line
 * }
 */
let stories = [];

/** Counter for generating unique story IDs */
let nextStoryId = 1;

/** ID of story currently being edited in modal */
let currentEditingStoryId = null;

/**
 * Array of entry IDs currently selected for story being edited
 * Used to track which entries belong to the current story edit session
 */
let currentStoryEditEntries = [];

/** Reference to the drag-and-drop entry item being reordered in story */
let draggedEntryItem = null;

