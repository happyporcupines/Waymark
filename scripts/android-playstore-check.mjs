#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

const manifestPath = path.join(projectRoot, 'manifest.webmanifest');
const swPath = path.join(projectRoot, 'sw.js');
const assetLinksPath = path.join(projectRoot, '.well-known', 'assetlinks.json');
const assetLinksTemplatePath = path.join(projectRoot, '.well-known', 'assetlinks.json.template');

const failures = [];
const warnings = [];

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function mustExist(relativePath) {
    const absolutePath = path.join(projectRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
        failures.push(`Missing required file: ${relativePath}`);
        return false;
    }
    return true;
}

if (!fs.existsSync(manifestPath)) {
    failures.push('Missing manifest.webmanifest');
} else {
    const manifest = readJson(manifestPath);

    if (!manifest.name || !manifest.short_name) {
        failures.push('Manifest needs name and short_name.');
    }

    if (!manifest.display || !['standalone', 'fullscreen'].includes(manifest.display)) {
        failures.push('Manifest display must be standalone or fullscreen.');
    }

    if (!manifest.start_url || !manifest.scope) {
        failures.push('Manifest must define start_url and scope.');
    }

    if (!manifest.theme_color || !manifest.background_color) {
        failures.push('Manifest must define theme_color and background_color.');
    }

    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    const requiredIcons = [
        { src: 'icons/icon-192.png', sizes: '192x192', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', purpose: 'any' },
        { src: 'icons/icon-512-maskable.png', sizes: '512x512', purpose: 'maskable' }
    ];

    for (const required of requiredIcons) {
        const found = icons.find((icon) =>
            icon &&
            icon.src === required.src &&
            icon.sizes === required.sizes &&
            typeof icon.purpose === 'string' &&
            icon.purpose.includes(required.purpose)
        );

        if (!found) {
            failures.push(`Manifest missing icon entry: ${required.src} (${required.sizes}, ${required.purpose})`);
        }

        mustExist(required.src);
    }
}

if (!fs.existsSync(swPath)) {
    failures.push('Missing sw.js');
} else {
    const swContents = fs.readFileSync(swPath, 'utf8');
    for (const iconPath of ['.\/icons\/icon-192.png', '.\/icons\/icon-512.png', '.\/icons\/icon-512-maskable.png']) {
        if (!swContents.includes(iconPath.replace(/\\/g, ''))) {
            failures.push(`sw.js should cache ${iconPath.replace(/\\/g, '')}`);
        }
    }
}

const hasAssetLinks = fs.existsSync(assetLinksPath);
const hasAssetLinksTemplate = fs.existsSync(assetLinksTemplatePath);

if (!hasAssetLinks && !hasAssetLinksTemplate) {
    failures.push('Missing .well-known/assetlinks.json or .well-known/assetlinks.json.template');
}

if (hasAssetLinks) {
    const assetLinks = fs.readFileSync(assetLinksPath, 'utf8');
    if (assetLinks.includes('YOUR_PACKAGE_NAME') || assetLinks.includes('YOUR_SHA256_CERT_FINGERPRINT')) {
        warnings.push('.well-known/assetlinks.json still has placeholder values.');
    }
}

if (failures.length) {
    console.error('\nPlay Store readiness check failed:\n');
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exit(1);
}

console.log('\nPlay Store readiness check passed.');

if (warnings.length) {
    console.log('\nWarnings:');
    for (const warning of warnings) {
        console.log(`- ${warning}`);
    }
}
