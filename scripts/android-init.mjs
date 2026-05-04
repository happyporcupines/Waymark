#!/usr/bin/env node

import { execSync } from 'node:child_process';

const rawOrigin = process.env.WAYMARK_APP_ORIGIN;

if (!rawOrigin) {
    console.error('Missing WAYMARK_APP_ORIGIN. Example:');
    console.error('WAYMARK_APP_ORIGIN=https://waymark.example.com npm run android:init');
    process.exit(1);
}

let manifestUrl;
try {
    const parsed = new URL(rawOrigin);
    if (parsed.protocol !== 'https:') {
        throw new Error('Origin must use HTTPS.');
    }
    // Preserve the full path (e.g. /Waymark) — .origin strips path so use href instead
    const base = parsed.href.endsWith('/') ? parsed.href : parsed.href + '/';
    manifestUrl = `${base}manifest.webmanifest`;
} catch (error) {
    console.error('Invalid WAYMARK_APP_ORIGIN:', error.message);
    process.exit(1);
}
console.log(`Initializing Bubblewrap with manifest: ${manifestUrl}`);

execSync(`npx @bubblewrap/cli init --manifest ${manifestUrl}`, {
    stdio: 'inherit'
});
