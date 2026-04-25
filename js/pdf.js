// ============================================================================
// PDF.JS — Story/Entry PDF Export
// Always prints a purpose-built export document (browser + Electron).
// ============================================================================

function openPdfExportModal() {
    const modal = document.getElementById('pdfExportModal');
    const storySelect = document.getElementById('pdfStorySelect');
    const statusEl = document.getElementById('pdfExportStatus');
    if (!modal || !storySelect) return;

    storySelect.innerHTML = '';
    (stories || []).forEach((story) => {
        const opt = document.createElement('option');
        opt.value = story.id;
        opt.textContent = story.title || 'Untitled Story';
        storySelect.appendChild(opt);
    });

    if (statusEl) statusEl.textContent = '';
    modal.style.display = 'flex';
}

function closePdfExportModal() {
    const modal = document.getElementById('pdfExportModal');
    if (modal) modal.style.display = 'none';
}

function getStoryEntries(story) {
    if (!story || !Array.isArray(story.entryIds)) return [];
    const byId = new Map((journalEntries || []).map((e) => [e.id, e]));
    return story.entryIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .filter((e) => Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lon)));
}

function getMapStyleForExport() {
    const cfg = window.WAYMARK_CONFIG || {};
    const key = cfg.MAPTILER_KEY || '';
    if (!key) return null;
    return `https://api.maptiler.com/maps/dataviz/style.json?key=${key}`;
}

function waitForMapIdle(map, timeoutMs = 7000) {
    return new Promise((resolve) => {
        let finished = false;
        const done = () => {
            if (finished) return;
            finished = true;
            resolve();
        };
        const timeout = setTimeout(done, timeoutMs);
        map.once('idle', () => {
            clearTimeout(timeout);
            done();
        });
    });
}

function getBoundsForCoordinates(coords) {
    const bounds = new maplibregl.LngLatBounds(coords[0], coords[0]);
    for (let i = 1; i < coords.length; i += 1) {
        bounds.extend(coords[i]);
    }
    return bounds;
}

async function generateStoryMapImageDataUrl(story) {
    if (!story || typeof maplibregl === 'undefined') return '';
    const styleUrl = getMapStyleForExport();
    if (!styleUrl) return '';

    const entries = getStoryEntries(story);
    if (!entries.length) return '';

    const coords = entries.map((e) => [Number(e.lon), Number(e.lat)]);
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-99999px;top:-99999px;width:1000px;height:560px;pointer-events:none;';
    document.body.appendChild(container);

    const exportMap = new maplibregl.Map({
        container,
        style: styleUrl,
        center: coords[0],
        zoom: 10,
        interactive: false,
        preserveDrawingBuffer: true
    });

    try {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Map image render timed out')), 10000);
            exportMap.once('load', () => {
                clearTimeout(timeout);
                resolve();
            });
            exportMap.once('error', (evt) => {
                clearTimeout(timeout);
                reject(evt?.error || new Error('Map image render failed'));
            });
        });

        exportMap.addSource('story-route', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: coords },
                        properties: {}
                    }
                ]
            }
        });
        exportMap.addLayer({
            id: 'story-route-line',
            type: 'line',
            source: 'story-route',
            paint: {
                'line-color': story.lineColor || '#a43855',
                'line-width': 4,
                'line-opacity': 0.9
            }
        });

        exportMap.addSource('story-points', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: coords.map((c, idx) => ({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: c },
                    properties: { order: idx + 1 }
                }))
            }
        });
        exportMap.addLayer({
            id: 'story-points-circle',
            type: 'circle',
            source: 'story-points',
            paint: {
                'circle-radius': 6,
                'circle-color': '#ffffff',
                'circle-stroke-color': story.lineColor || '#a43855',
                'circle-stroke-width': 2
            }
        });

        const bounds = getBoundsForCoordinates(coords);
        exportMap.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 13 });
        await waitForMapIdle(exportMap, 7000);

        const dataUrl = exportMap.getCanvas().toDataURL('image/png');
        return dataUrl;
    } catch (error) {
        console.error('[Waymark] Could not generate story map image for PDF:', error);
        return '';
    } finally {
        exportMap.remove();
        container.remove();
    }
}

async function buildPdfContent(scope, storyId, pageSize, landscape) {
    let entriesToPrint = [];
    let heading = 'Waymark — All Entries';
    let mapSection = '';

    let selectedStory = null;
    if (scope === 'story' && storyId) {
        selectedStory = (stories || []).find((s) => s.id === Number(storyId)) || null;
        if (selectedStory) {
            heading = `Waymark — ${selectedStory.title}`;
            entriesToPrint = getStoryEntries(selectedStory);
            const mapImageUrl = await generateStoryMapImageDataUrl(selectedStory);
            if (mapImageUrl) {
                mapSection = `
                    <section class="story-map-section">
                        <h2>Story Route Map</h2>
                        <img src="${mapImageUrl}" alt="Story route map" class="story-map-image" />
                    </section>
                `;
            }
        }
    }

    if (!entriesToPrint.length) {
        entriesToPrint = journalEntries || [];
    }

    const rows = entriesToPrint.map((entry) => {
        const date = entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '';
        const hasCoords = Number.isFinite(Number(entry.lat)) && Number.isFinite(Number(entry.lon));
        const image = entry.image
            ? `<img src="${entry.image}" class="entry-image" alt="Entry photo" />`
            : '';
        return `
            <div class="entry">
                <h2>${entry.title || 'Untitled Entry'}</h2>
                <p class="meta">${date}${hasCoords ? ` · ${Number(entry.lat).toFixed(4)}°, ${Number(entry.lon).toFixed(4)}°` : ''}</p>
                ${image}
                <div class="body">${entry.textHtml || entry.text || ''}</div>
            </div>`;
    }).join('\n');

    const orientation = landscape ? 'landscape' : 'portrait';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${heading}</title>
<style>
  @page { size: ${pageSize} ${orientation}; margin: 12mm; }
  body { font-family: Georgia, serif; margin: 0; color: #1a1a1a; }
  h1.report-title { font-size: 1.8em; color: #a43855; margin: 0 0 0.2em; }
  .report-date { font-size: 0.85em; color: #666; margin: 0 0 1.4em; }
  .story-map-section { margin: 0 0 1.4em; page-break-inside: avoid; }
  .story-map-section h2 { margin: 0 0 8px; font-size: 1.2em; color: #a43855; }
  .story-map-image { width: 100%; max-height: 420px; object-fit: contain; border: 1px solid #ddd; border-radius: 6px; }
  .entry { border-top: 2px solid #a43855; padding: 1.2em 0; page-break-inside: avoid; }
  .entry h2 { margin: 0 0 0.2em; font-size: 1.2em; color: #a43855; }
  .meta { margin: 0 0 0.8em; font-size: 0.8em; color: #777; }
  .entry-image { max-width: 100%; max-height: 220px; border-radius: 4px; margin: 8px 0; }
  .body { font-size: 0.95em; line-height: 1.55; }
  .empty { color: #888; font-style: italic; margin-top: 2em; }
</style>
</head>
<body>
<h1 class="report-title">${heading}</h1>
<p class="report-date">Exported ${new Date().toLocaleDateString()}</p>
${mapSection}
${rows || '<p class="empty">No entries to export.</p>'}
</body>
</html>`;
}

async function performPdfExport() {
    const scopeEl = document.getElementById('pdfScopeSelect');
    const storyEl = document.getElementById('pdfStorySelect');
    const pageSizeEl = document.querySelector('input[name="pdfPageSize"]:checked');
    const orientationEl = document.querySelector('input[name="pdfOrientation"]:checked');
    const statusEl = document.getElementById('pdfExportStatus');

    const scope = scopeEl ? scopeEl.value : 'all';
    const storyId = storyEl ? storyEl.value : null;
    const pageSize = pageSizeEl ? pageSizeEl.value : 'A4';
    const landscape = orientationEl ? orientationEl.value === 'landscape' : false;

    if (statusEl) {
        statusEl.textContent = scope === 'story' ? 'Rendering story map and preparing export…' : 'Preparing export…';
    }

    const content = await buildPdfContent(scope, storyId, pageSize, landscape);

    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
        if (statusEl) statusEl.textContent = 'Pop-up blocked. Please allow pop-ups for this site.';
        return;
    }

    printWindow.document.open();
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();

    // Let fonts/images/layout settle before print to avoid blank map image.
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 700);

    closePdfExportModal();
}
