// ============================================================================
// PDF.JS — PDF Export
// Works in all platforms: browser (window.print) and Electron (printToPDF)
// ============================================================================

/**
 * Opens the PDF export modal, populating the story dropdown from current state.
 */
function openPdfExportModal() {
    const modal = document.getElementById('pdfExportModal');
    const storySelect = document.getElementById('pdfStorySelect');
    const statusEl = document.getElementById('pdfExportStatus');
    if (!modal) return;

    // Populate story dropdown
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

/**
 * Builds a printable HTML document string from the selected scope.
 * Injected into a hidden iframe for printing.
 */
function buildPdfContent(scope, storyId) {
    let entriesToPrint = [];
    let heading = 'Waymark — All Entries';

    if (scope === 'story' && storyId) {
        const story = (stories || []).find(s => s.id === Number(storyId));
        if (story) {
            heading = `Waymark — ${story.title}`;
            const ids = new Set(story.entryIds);
            entriesToPrint = (journalEntries || []).filter(e => ids.has(e.id));
        }
    } else {
        entriesToPrint = journalEntries || [];
    }

    const rows = entriesToPrint.map((entry) => {
        const date = entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '';
        const image = entry.image
            ? `<img src="${entry.image}" style="max-width:100%;max-height:200px;border-radius:4px;margin:8px 0;" />`
            : '';
        return `
            <div class="entry">
                <h2>${entry.title || 'Untitled Entry'}</h2>
                <p class="meta">${date}${entry.lat ? ` · ${entry.lat.toFixed(4)}°, ${entry.lon.toFixed(4)}°` : ''}</p>
                ${image}
                <div class="body">${entry.textHtml || entry.text || ''}</div>
            </div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${heading}</title>
<style>
  body { font-family: Georgia, serif; margin: 2cm; color: #1a1a1a; }
  h1.report-title { font-size: 1.8em; color: #a43855; margin-bottom: 0.2em; }
  .report-date { font-size: 0.85em; color: #666; margin-bottom: 2em; }
  .entry { border-top: 2px solid #a43855; padding: 1.2em 0; page-break-inside: avoid; }
  .entry h2 { margin: 0 0 0.2em; font-size: 1.3em; color: #a43855; }
  .meta { margin: 0 0 0.8em; font-size: 0.8em; color: #777; }
  .body { font-size: 0.95em; line-height: 1.6; }
  .empty { color: #888; font-style: italic; margin-top: 2em; }
  @media print {
    body { margin: 1.5cm; }
  }
</style>
</head>
<body>
<h1 class="report-title">${heading}</h1>
<p class="report-date">Exported ${new Date().toLocaleDateString()}</p>
${rows || '<p class="empty">No entries to export.</p>'}
</body>
</html>`;
}

/**
 * Performs the export:
 * - Electron: calls electronAPI.exportPdf() for native print-to-PDF with a save dialog
 * - Browser: injects content into a hidden iframe and calls window.print()
 */
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

    if (statusEl) statusEl.textContent = 'Preparing export…';

    // ── Electron path ────────────────────────────────────────────────────────
    if (window.electronAPI && typeof window.electronAPI.exportPdf === 'function') {
        // Build the content in a hidden iframe so printToPDF captures it
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;';
        document.body.appendChild(iframe);

        iframe.srcdoc = buildPdfContent(scope, storyId);
        await new Promise(resolve => iframe.addEventListener('load', resolve, { once: true }));

        const result = await window.electronAPI.exportPdf({ pageSize, landscape });
        document.body.removeChild(iframe);

        if (result && result.canceled) {
            if (statusEl) statusEl.textContent = 'Export cancelled.';
            return;
        }
        if (result && result.error) {
            if (statusEl) statusEl.textContent = `Export failed: ${result.error}`;
            return;
        }
        closePdfExportModal();
        return;
    }

    // ── Browser path ─────────────────────────────────────────────────────────
    const content = buildPdfContent(scope, storyId);

    // Open in a new window so the user can use the browser's native print dialog
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
        if (statusEl) statusEl.textContent = 'Pop-up blocked. Please allow pop-ups for this site.';
        return;
    }
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    // Small delay to let images load before triggering print
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);

    closePdfExportModal();
}
