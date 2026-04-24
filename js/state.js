/**
 * ============================================================================
 * STATE.JS - Global Application State Management
 * ============================================================================
 * 
 * This file defines all global state variables used throughout the Waymark
 * application. State is organized into logical sections for easier management.
 * 
 * IMPORTANT: This is a client-side application with no backend persistence.
 * All data is stored in memory and will be lost on page refresh.
 */

// ============================================================================
// INITIALIZATION & USER MODE STATE
// ============================================================================

/**
 * Tracks whether the ArcGIS map has been initialized
 * Used to prevent duplicate initialization when switching views
 * @type {boolean}
 */
let mapInitialized = false;
let mapLoaded = false;

/**
 * Indicates if the user is in guest mode (no authentication)
 * Guest mode allows users to test the app without login, but data isn't persisted
 * @type {boolean}
 */
let isGuestMode = false;

/**
 * Tracks whether we've shown the guest mode warning about temporary data storage
 * Prevents showing the same warning multiple times during a session
 * @type {boolean}
 */
let guestEntryWarningShown = false;

// ============================================================================
// JOURNAL ENTRY DATA
// ============================================================================

/**
 * Master array of all journal entries in simplified format
 * Used for sidebar display and providing data to story creation
 * Each entry contains: { id, title, text, lat, lon, image, createdAt }
 * @type {Array<Object>}
 */
let journalEntries = [];

/**
 * Stores coordinates {lat, lon, mapPoint} when user initiates entry creation
 * Set during long-press or when clicking "Add new entry to same point"
 * Cleared after entry modal is closed
 * @type {Object|null}
 */
let currentClickCoords = null;

/**
 * The unique point key (formatted as "lat,lon") for the entry being created/edited
 * Used to locate the corresponding point record in pointStore
 * @type {string|null}
 */
let currentPointKey = null;

/**
 * ID of the entry currently being edited (null if creating new entry)
 * Used to determine whether to update existing or create new in saveEntry()
 * @type {number|null}
 */
let currentEditingEntryId = null;

/**
 * Auto-incrementing ID counter for generating unique entry identifiers
 * Each new entry gets the current value, then this increments
 * @type {number}
 */
let nextEntryId = 1;

/**
 * Primary data store mapping point keys to point records
 * Key format: "lat,lon" (coordinates rounded to 3 decimal places)
 * Value format: { pointKey, lat, lon, mapPoint, entries[], graphic }
 * 
 * Each point can have multiple entries at the same location
 * The graphic reference allows us to update the map marker when entries change
 * @type {Map<string, Object>}
 */
const pointStore = new Map();

// ============================================================================
// ARCGIS MAP OBJECTS & REFERENCES
// ============================================================================

/**
 * Reference to the ArcGIS MapView instance
 * Provides access to map navigation, popup, and hit testing functionality
 * Initialized in initMap() after ArcGIS modules are loaded
 * @type {Object|null}
 */
let appView = null;

/**
 * Main graphics layer for displaying entry point markers
 * When entries are part of a story, they move to the story's dedicated layer
 * @type {Object|null}
 */
let appGraphicsLayer = null;

/**
 * Reference to the main map instance (Mapbox GL)
 * Needed when adding event listeners and managing the map
 * @type {Object|null}
 */
let mapInstance = null;

// ============================================================================
// STORY/JOURNEY STATE
// ============================================================================

/**
 * Array of all story objects
 * Each story contains: { id, title, entryIds[], visible, totalMiles, graphicsLayer, lineColor }
 * Stories connect multiple entries into a journey with visual path and distance info
 * @type {Array<Object>}
 */
let stories = [];

/**
 * ID of the story currently being created or edited (null if creating new)
 * Used in story edit modal to determine save behavior
 * @type {number|null}
 */
let currentEditingStoryId = null;

/**
 * Array of entry IDs currently selected for the story being edited
 * Users can add/remove entries which updates this array
 * Order matters: determines the sequence of the story path
 * @type {Array<number>}
 */
let currentStoryEditEntries = [];

/**
 * Auto-incrementing ID counter for generating unique story identifiers
 * @type {number}
 */
let nextStoryId = 1;

/**
 * Reference to the DOM element currently being dragged in story entry reordering
 * Used by HTML5 drag & drop handlers to manage drop target positioning
 * @type {HTMLElement|null}
 */
let draggedEntryItem = null;

// ============================================================================
// AUTHENTICATION & REMOTE SYNC STATE
// ============================================================================

/**
 * Active Supabase auth user object for authenticated sessions
 * @type {Object|null}
 */
let authenticatedUser = null;

/**
 * Prevents remote sync from firing while we are hydrating server data
 * @type {boolean}
 */
let isHydratingRemoteData = false;
