# Waymark - Diary Map Application

A web-based diary application that lets users record personal journal entries directly on an interactive map. Create entries at locations, add rich text content, upload images, and build stories by connecting multiple entries into journeys.

## Overview

Waymark combines traditional journaling with geospatial storytelling. Instead of writing in a linear diary, users mark locations on a map where significant moments occurred and attach diary entries to those points. The app supports creating "stories"—journeys that connect multiple entries with visualized paths and distance calculations.

## Features

### Core Features
- **Interactive Map**: Built on ArcGIS JavaScript API for intuitive geospatial interaction
- **Location-Based Entries**: Click on the map to create diary entries at specific coordinates
- **Rich Text Editing**: Format entries with bold, italic, links, bullet lists, numbered lists, and checklists
- **Image Support**: Upload and attach images to diary entries
- **Story Creation**: Connect multiple entries into journeys with:
  - Polyline visualization connecting entry locations
  - Distance calculations for segments and total journey
  - Color customization for each story
  - Drag-and-drop reordering of entries

### User Interface
- **Responsive Design**: Works on desktop and mobile devices
- **Sidebar Navigation**: View entry list and switch between Map, Entries, and Profile views
- **Detail Panel**: Read-only view of individual entries
- **Entry Editor Modal**: Create and edit entries with timestamp, title, and formatted content
- **Guest Mode**: Use the app without authentication (data stored locally in browser)

## Project Structure

```
Waymark/
├── index.html           # Main HTML file with UI layout
├── css/
│   ├── base.css         # Core styling
│   └── components.css   # Component-specific styles
└── js/
    ├── main.js          # Application entry point
    ├── state.js         # Global state management
    ├── map.js           # ArcGIS map initialization and handlers
    ├── entries.js       # Entry creation and CRUD operations
    ├── stories.js       # Story/journey management
    ├── popups.js        # Popup and modal interactions
    ├── eventHandlers.js # Event listeners and user interactions
    ├── ui.js            # UI updates and rendering
    └── utils.js         # Utility functions
```

## Architecture

### Modular JavaScript Design
The application is organized into focused modules that handle specific responsibilities:

- **State Management** (`state.js`): Centralized storage for all application state including entries, stories, user mode, and map references
- **Map Integration** (`map.js`): Manages ArcGIS map initialization, graphics layers, and map interactions
- **Data Operations** (`entries.js`): CRUD operations for diary entries stored in browser memory
- **Story System** (`stories.js`): Creates and manages story narratives connecting multiple entries with visual paths
- **UI Layer** (`ui.js`, `popups.js`): Renders entries, stories, and handles modal/panel displays
- **Event Handling** (`eventHandlers.js`): Routes user interactions to appropriate handlers
- **Utilities** (`utils.js`): Common helper functions used across modules

### Data Flow
1. **User clicks map** → Map click handler triggers entry creation modal
2. **User enters data** → Entry stored in `journalEntries` state array
3. **Entry visualized** → Graphics added to ArcGIS map layer
4. **User creates story** → Multiple entries selected and connected with polylines
5. **Story persisted** → Story metadata stored and displayed alongside entries

### Key Design Decisions
- **Guest Mode First**: Designed for users who want to start journaling immediately without authentication
- **Client-Side Storage**: Uses browser memory for simplicity; suitable for personal journaling sessions
- **ArcGIS Integration**: Leverages enterprise-grade mapping library for robust geospatial features
- **Rich Text Editing**: Uses browser's native `contenteditable` API with formatting toolbar
- **Responsive Layout**: Single-page app with mobile navigation for multiple screen sizes

## Getting Started

### Requirements
- Modern web browser with JavaScript enabled
- Internet connection (for ArcGIS API and map tiles)

### Usage
1. Open `index.html` in a web browser
2. The map will load with your current region centered
3. Click on the map to create a diary entry at that location
4. Fill in the entry title, date, and formatted text content
5. Optionally add an image
6. Click "Save Entry" to create the entry marker on the map
7. Click on entry markers to view or edit entries
8. Create stories by selecting multiple entries and connecting them into journeys

### Navigation
- **🗺️ Map**: View the interactive map with all entries
- **📝 Entries**: List view of all diary entries
- **👤 Profile**: User information and settings
- **📖 Stories**: Create and manage story journeys

## Technologies Used

- **ArcGIS JavaScript API 4.28**: Mapping and geospatial visualization
- **HTML5**: Semantic markup and form elements
- **CSS3**: Responsive styling and layout
- **Vanilla JavaScript (ES6)**: Core application logic
- **Browser APIs**: 
  - Geolocation API for user location
  - File API for image uploads
  - LocalStorage (potential for data persistence)

## Browser Compatibility

Works on modern browsers that support:
- ES6 JavaScript
- CSS Grid and Flexbox
- ArcGIS API 4.28

Tested on:
- Chrome/Chromium (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Future Enhancements

Potential improvements for future versions:
- User authentication and cloud-based data persistence
- Export entries to PDF or markdown formats
- Social sharing of stories
- Collaborative journeys with multiple users
- Offline mode support
- Custom map themes and layers
- Advanced story analytics (distance, duration, speed)
- Entry templates for different types of journeys
- Integration with external services (weather, photos from date)

## Author

Created by Brooke Fandrich

## License

[Add license information if applicable]
