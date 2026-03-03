// Global application state
let mapInitialized = false;
let isGuestMode = false;
let guestEntryWarningShown = false;

// Data structures
let journalEntries = [];
let currentClickCoords = null;
let currentPointKey = null;
let currentEditingEntryId = null;

// ArcGIS objects (initialized in initMap)
let nextEntryId = 1;
const pointStore = new Map();

// Map & UI references
let appView = null;
let appGraphicsLayer = null;
let GraphicCtor = null;

// Storytelling additions
let PolylineCtor = null;
let geometryEngineModule = null;
let GraphicsLayerCtor = null;
let mapInstance = null;

// Storytelling data
let stories = [];
let currentEditingStoryId = null;
let currentStoryEditEntries = [];
let nextStoryId = 1;
let draggedEntryItem = null;
