// Popup and Point Graphic Management

function findStoryForEntry(entry) {
    if (!entry) {
        return null;
    }
    return stories.find((story) => story.entryIds.includes(entry.id)) || null;
}

// Builds a popup template for a given entry, including story mileage info if available
function buildEntryPopupTemplate(entry, pointStory = null) {
    const preview = truncateText(entry.textPlain, 180);
    const resolvedStory = pointStory || findStoryForEntry(entry);

    //Inject story mileage data if it exists!
    let storyHtml = '';
    if (resolvedStory && entry.storyDistanceInfo) {
        storyHtml = `
            <div style="background: #f8e8eb; padding: 10px; margin-bottom: 10px; border-radius: 6px; border-left: 4px solid #a43855;">
                <strong>Part of Story: ${escapeHtml(resolvedStory.title)}</strong><br/>
                <small>Distance from previous: ${entry.storyDistanceInfo.distFromPrev.toFixed(2)} mi</small><br/>
                <small>Distance to next: ${entry.storyDistanceInfo.distToNext.toFixed(2)} mi</small>
            </div>
        `;
    }
    // Build the popup content with the entry preview and story info if applicable
    return {
        title: entry.title,
        content: `
            <div>
                ${storyHtml}
                <p>${escapeHtml(preview)}</p>
                ${entry.textPlain.length > 180 ? '<p><em>Use "Read full entry" below to view everything.</em></p>' : ''}
            </div>
        `,
        actions: [
            { title: 'Read full entry', id: 'read-full-entry', className: 'esri-icon-documentation' },
            { title: 'Edit entry', id: 'edit-entry', className: 'esri-icon-edit' },
            { title: 'Add new entry to same point', id: 'add-same-point', className: 'esri-icon-plus-circled' },
            { title: 'Close', id: 'close-popup', className: 'esri-icon-close' }
        ]
    };
}

// Opens a popup for a specific entry at a point, optionally at a specific location (like from a click event)
function openEntryPopup(pointRecord, entry, location) {
    if (!pointRecord.graphic) {
        return;
    }
    const pointStory = findStoryForEntry(entry);
    // Update the graphic's attributes and popup template to reflect the selected entry
    pointRecord.graphic.attributes = {
        pointKey: pointRecord.pointKey,
        selectedEntryId: entry.id,
        title: entry.title
    };
    pointRecord.graphic.popupTemplate = buildEntryPopupTemplate(entry, pointStory);
    // Open the popup at the specified location or default to the point's map location
    appView.popup.open({
        features: [pointRecord.graphic],
        location: location || pointRecord.mapPoint
    });
}

// If a point has multiple entries, this function opens a popup that allows the user to select which entry they want to view
function openEntrySelectorPopup(pointRecord, location) {
    const features = pointRecord.entries.map((entry) => new GraphicCtor({
        geometry: pointRecord.mapPoint,
        symbol: pointRecord.graphic ? pointRecord.graphic.symbol : {
            type: 'simple-marker',
            color: [164, 56, 85],
            outline: { color: [255, 255, 255], width: 2 }
        },
        attributes: {
            pointKey: pointRecord.pointKey,
            selectedEntryId: entry.id,
            title: entry.title
        },
        popupTemplate: buildEntryPopupTemplate(entry, findStoryForEntry(entry))
    }));

    appView.popup.open({
        features,
        location: location || pointRecord.mapPoint
    });
}

// Updates the graphic for a point record, reflecting the latest entry and story status
function updatePointGraphic(pointRecord) {
    const latestEntry = getLatestEntry(pointRecord);
    if (!latestEntry || !pointRecord) { return; }

    // Check if this point is locked into a story
    let pointStory = null;
    stories.forEach(s => {
        s.entryIds.forEach(eid => {
            const je = journalEntries.find(j => j.id === eid);
            if (je && buildPointKey(je.lat, je.lon) === pointRecord.pointKey) { pointStory = s; }
        });
    });
    // Build the popup template with story info if this point is part of a story
    const popupTemplate = buildEntryPopupTemplate(latestEntry, pointStory);
    const targetLayer = pointStory ? pointStory.graphicsLayer : appGraphicsLayer;
    const targetMarkerColor = pointStory ? [0, 0, 0] : [164, 56, 85];

    if (!pointRecord.graphic) {
        // Create a new graphic
        pointRecord.graphic = new GraphicCtor({
            geometry: pointRecord.mapPoint,
            symbol: {
                type: 'simple-marker',
                color: targetMarkerColor,
                outline: { color: [255, 255, 255], width: 2 }
            },
            attributes: { pointKey: pointRecord.pointKey, selectedEntryId: latestEntry.id, title: latestEntry.title },
            popupTemplate
        });
        // Add the new graphic to the appropriate layer
        targetLayer.add(pointRecord.graphic);
    } else {
        // Check if we need to move the graphic to a different layer
        const currentLayer = pointRecord.graphic.layer;
        if (currentLayer && currentLayer !== targetLayer) {
            // Remove from old layer, add to new layer
            if (pointRecord.graphic in currentLayer.graphics) {
                try {
                    currentLayer.remove(pointRecord.graphic);
                } catch (e) {
                    // Layer removal might fail if graphic was already removed
                }
            }
            try {
                targetLayer.add(pointRecord.graphic);
            } catch (e) {
                // Layer add might fail due to graphic already in layer
            }
        }
        // Update the existing graphic's symbol, attributes, and popup template
        pointRecord.graphic.symbol = {
            type: 'simple-marker',
            color: targetMarkerColor,
            outline: { color: [255, 255, 255], width: 2 }
        };
        pointRecord.graphic.attributes = { pointKey: pointRecord.pointKey, selectedEntryId: latestEntry.id, title: latestEntry.title };
        pointRecord.graphic.popupTemplate = popupTemplate;
    }
}
