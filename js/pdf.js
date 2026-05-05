// ============================================================================
// PDF.JS — Story/Entry PDF Export
// Always prints a purpose-built export document (browser + Electron).
//
// Map rendering uses pure 2D canvas + OSM tile fetching — no WebGL.
// This works on mobile WebView where a second MapLibre context would fail.
//
// Printing uses window.open() so that on Android the generated document
// is what gets printed (iframe.print() prints the parent page on Android).
// ============================================================================

// ============================================================================
// TILE-BASED MAP RENDERING  (2D canvas, no WebGL)
// ============================================================================

function _lngToTileX(lng, zoom) {
    return (lng + 180) / 360 * Math.pow(2, zoom);
}

function _latToTileY(lat, zoom) {
    const latRad = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom);
}

function _loadTileImage(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

/**
 * Render an OSM tile map with a route line and numbered markers to a data URL.
 * coords: Array of [lng, lat] pairs. lineColor: CSS color string.
 */
async function renderMapToDataUrl(coords, lineColor) {
    const TILE_SIZE = 256;
    const W = 900;
    const H = 500;

    if (!coords || coords.length === 0) return '';

    // Bounding box
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
    }

    // Pad bounding box
    const lngPad = Math.max((maxLng - minLng) * 0.25, 0.008);
    const latPad = Math.max((maxLat - minLat) * 0.25, 0.005);
    minLng -= lngPad; maxLng += lngPad;
    minLat -= latPad; maxLat += latPad;

    // Pick zoom so bbox fits inside 85% of canvas
    let zoom = 14;
    for (; zoom >= 1; zoom--) {
        const xSpan = (_lngToTileX(maxLng, zoom) - _lngToTileX(minLng, zoom)) * TILE_SIZE;
        const ySpan = (_latToTileY(minLat, zoom) - _latToTileY(maxLat, zoom)) * TILE_SIZE;
        if (xSpan <= W * 0.85 && ySpan <= H * 0.85) break;
    }

    // Center the bounding box in the canvas
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    const tileOriginX = _lngToTileX(centerLng, zoom) - W / 2 / TILE_SIZE;
    const tileOriginY = _latToTileY(centerLat, zoom) - H / 2 / TILE_SIZE;

    // Tile range needed
    const txMin = Math.floor(tileOriginX);
    const txMax = Math.floor(tileOriginX + W / TILE_SIZE) + 1;
    const tyMin = Math.floor(tileOriginY);
    const tyMax = Math.floor(tileOriginY + H / TILE_SIZE) + 1;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#e8e0d8';
    ctx.fillRect(0, 0, W, H);

    // Load and draw tiles in parallel
    const tilePromises = [];
    for (let tx = txMin; tx <= txMax; tx++) {
        for (let ty = tyMin; ty <= tyMax; ty++) {
            const pixX = (tx - tileOriginX) * TILE_SIZE;
            const pixY = (ty - tileOriginY) * TILE_SIZE;
            tilePromises.push(
                _loadTileImage(`https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`)
                    .then((img) => {
                        if (img) ctx.drawImage(img, Math.round(pixX), Math.round(pixY), TILE_SIZE, TILE_SIZE);
                    })
            );
        }
    }
    await Promise.all(tilePromises);

    // Convert lng/lat → canvas pixel
    const toPixel = (lng, lat) => [
        (_lngToTileX(lng, zoom) - tileOriginX) * TILE_SIZE,
        (_latToTileY(lat, zoom) - tileOriginY) * TILE_SIZE
    ];

    const color = lineColor || '#a43855';

    // Route line
    if (coords.length >= 2) {
        ctx.beginPath();
        const [sx, sy] = toPixel(coords[0][0], coords[0][1]);
        ctx.moveTo(sx, sy);
        for (let i = 1; i < coords.length; i++) {
            const [cx, cy] = toPixel(coords[i][0], coords[i][1]);
            ctx.lineTo(cx, cy);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.88;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Numbered markers
    for (let i = 0; i < coords.length; i++) {
        const [px, py] = toPixel(coords[i][0], coords[i][1]);
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = '#222';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), px, py);
    }

    // OSM attribution on canvas
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const attrText = '© OpenStreetMap contributors';
    ctx.font = '10px sans-serif';
    const tw = ctx.measureText(attrText).width;
    ctx.fillRect(W - tw - 10, H - 18, tw + 8, 18);
    ctx.fillStyle = '#333';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(attrText, W - 4, H - 2);

    return canvas.toDataURL('image/png');
}

function openPdfExportModal() {
    const modal = document.getElementById('pdfExportModal');
    const storySelect = document.getElementById('pdfStorySelect');
    const statusEl = document.getElementById('pdfExportStatus');
    const offlineOption = document.getElementById('pdfOfflineOption');
    const scopeEl = document.getElementById('pdfScopeSelect');
    if (!modal || !storySelect) return;

    // Populate story list
    storySelect.innerHTML = '';
    (stories || []).forEach((story) => {
        const opt = document.createElement('option');
        opt.value = story.id;
        opt.textContent = story.title || 'Untitled Story';
        storySelect.appendChild(opt);
    });

    // Show "Offline map extent" option only when one is active
    const hasOfflineExtent = typeof getSelectedOfflineExtentId === 'function' && !!getSelectedOfflineExtentId();
    if (offlineOption) {
        offlineOption.style.display = hasOfflineExtent ? '' : 'none';
    }

    // Reset scope to "all" when opening
    if (scopeEl) scopeEl.value = 'all';
    _updatePdfScopeUi('all');

    if (statusEl) statusEl.textContent = '';
    modal.style.display = 'flex';
}

function closePdfExportModal() {
    const modal = document.getElementById('pdfExportModal');
    if (modal) modal.style.display = 'none';
}

/** Update hint and sub-selects when scope changes. */
function _updatePdfScopeUi(scope) {
    const storyWrap = document.getElementById('pdfStorySelectWrap');
    const hint = document.getElementById('pdfAllEntriesHint');
    if (storyWrap) storyWrap.style.display = scope === 'story' ? 'block' : 'none';
    if (hint) hint.style.display = scope === 'all' ? 'block' : 'none';
}

/** Return all entries belonging to a story, including those without GPS coords. */
function getStoryEntries(story) {
    if (!story || !Array.isArray(story.entryIds)) return [];
    const byId = new Map((journalEntries || []).map((e) => [e.id, e]));
    return story.entryIds.map((id) => byId.get(id)).filter(Boolean);
}

/** Return the [lng, lat] coords for a story's entries that have a location. */
function _storyCoordsWithLocation(story) {
    return getStoryEntries(story)
        .filter((e) => Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lon)))
        .map((e) => [Number(e.lon), Number(e.lat)]);
}

/** Render a map for an offline extent (bounding box). */
async function _renderOfflineExtentMap(extent) {
    if (!extent || !extent.bounds) return '';
    const b = extent.bounds; // { north, south, east, west }
    // Use four corners so renderMapToDataUrl can compute the bbox
    const coords = [
        [b.west, b.north],
        [b.east, b.north],
        [b.east, b.south],
        [b.west, b.south]
    ];
    return renderMapToDataUrl(coords, '#2563a8');
}

function _renderEntryRows(entries) {
    return (entries || []).map((entry) => {
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
}

const PDF_STYLES = `
  @page { size: PAGE_SIZE ORIENTATION; margin: 12mm; }
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
`;

function _buildHtml(heading, pageSize, landscape, mapSection, rows) {
    const orientation = landscape ? 'landscape' : 'portrait';
    const styles = PDF_STYLES
        .replace('PAGE_SIZE', pageSize)
        .replace('ORIENTATION', orientation);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${heading}</title>
<style>${styles}</style>
</head>
<body>
<h1 class="report-title">${heading}</h1>
<p class="report-date">Exported ${new Date().toLocaleDateString()}</p>
${mapSection}
${rows || '<p class="empty">No entries to export.</p>'}
</body>
</html>`;
}

async function buildPdfContent(scope, storyId, pageSize, landscape) {
    // ── All Entries ──────────────────────────────────────────────────────────
    if (scope !== 'story' && scope !== 'offline') {
        const rows = _renderEntryRows(journalEntries || []);
        return _buildHtml('Waymark — All Entries', pageSize, landscape, '', rows);
    }

    // ── Story ────────────────────────────────────────────────────────────────
    if (scope === 'story') {
        const selectedStory = (stories || []).find((s) => s.id === Number(storyId)) || null;
        if (!selectedStory) {
            return _buildHtml('Waymark — Story', pageSize, landscape, '', '');
        }
        const heading = `Waymark — ${selectedStory.title || 'Story'}`;
        const entriesToPrint = getStoryEntries(selectedStory);
        const rows = _renderEntryRows(entriesToPrint);

        const coords = _storyCoordsWithLocation(selectedStory);
        let mapSection = '';
        if (coords.length >= 1) {
            const mapImageUrl = await renderMapToDataUrl(coords, selectedStory.lineColor || '#a43855');
            if (mapImageUrl) {
                mapSection = `
                    <section class="story-map-section">
                        <h2>Story Route Map</h2>
                        <img src="${mapImageUrl}" alt="Story route map" class="story-map-image" />
                    </section>`;
            }
        }
        return _buildHtml(heading, pageSize, landscape, mapSection, rows);
    }

    // ── Offline Extent ───────────────────────────────────────────────────────
    if (scope === 'offline') {
        const extent = typeof getSelectedOfflineExtent === 'function' ? getSelectedOfflineExtent() : null;
        const extentName = (extent && extent.name) ? extent.name : 'Offline Map Extent';
        const heading = `Waymark — ${extentName}`;
        const rows = _renderEntryRows(journalEntries || []);

        let mapSection = '';
        if (extent) {
            const mapImageUrl = await _renderOfflineExtentMap(extent);
            if (mapImageUrl) {
                mapSection = `
                    <section class="story-map-section">
                        <h2>Offline Map Extent</h2>
                        <img src="${mapImageUrl}" alt="Offline map extent" class="story-map-image" />
                    </section>`;
            }
        }
        return _buildHtml(heading, pageSize, landscape, mapSection, rows);
    }

    return _buildHtml('Waymark', pageSize, landscape, '', '');
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
        statusEl.textContent = scope === 'all'
            ? 'Preparing export…'
            : 'Rendering map and preparing export…';
    }

    closePdfExportModal();

    const content = await buildPdfContent(scope, storyId, pageSize, landscape);

    // Use window.open() so the generated document is what prints.
    // iframe.print() on Android WebView prints the parent page, not the iframe.
    const printWin = window.open('', '_blank');
    if (!printWin) {
        if (statusEl) statusEl.textContent = 'Pop-up blocked — please allow pop-ups and try again.';
        return;
    }
    printWin.document.open();
    printWin.document.write(content);
    printWin.document.close();

    // Wait for images (map tiles baked into data URLs) to be ready, then print.
    printWin.addEventListener('load', () => {
        printWin.focus();
        printWin.print();
    });
    // Fallback in case load already fired
    setTimeout(() => {
        try { printWin.focus(); printWin.print(); } catch (_) {}
    }, 1200);
}
