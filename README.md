# Waymark

Waymark is a browser-based map diary that lets users pin journal entries to locations and connect entries into story routes.

This project is now prepared for:

- Supabase Auth (email/password)
- Supabase database persistence for per-user entries and stories
- Progressive Web App support (manifest + service worker)

## Download Waymark (Desktop)

Download the latest Electron desktop builds from GitHub Releases:

- Windows (.exe): https://github.com/happyporcupines/Waymark/releases
- macOS (.dmg/.zip): https://github.com/happyporcupines/Waymark/releases
- Linux (.AppImage): https://github.com/happyporcupines/Waymark/releases

Direct latest release page:

- https://github.com/happyporcupines/Waymark/releases/latest

## Launch on Google Play (TWA)

Quick launch path:

1. Deploy the web app to your production HTTPS domain.
2. Create `/.well-known/assetlinks.json` from `/.well-known/assetlinks.json.template` with your real package name and SHA-256 signing fingerprint.
3. Run `npm run android:icons`.
4. Run `npm run android:check`.
5. Run `npm run android:doctor`.
6. Run `WAYMARK_APP_ORIGIN=https://YOUR_DOMAIN npm run android:init`.
7. Run `npm run android:build` and upload the generated `.aab` to Google Play Console (Internal testing first).

Detailed guide: [docs/android-playstore-bubblewrap.md](docs/android-playstore-bubblewrap.md)

## Current state

- Guest mode works as before (session-only local state).
- Authenticated mode is wired to Supabase and restores saved data per user.
- Login button behavior is: sign in first, and if account does not exist, sign up.

## Project structure

```
Waymark/
├── index.html
├── manifest.webmanifest
├── sw.js
├── css/
│   └── style.css
├── icons/
│   ├── icon-192.svg
│   └── icon-512.svg
├── js/
│   ├── config.js
│   ├── config.example.js
│   ├── supabase.js
│   ├── pwa.js
│   ├── state.js
│   ├── utils.js
│   ├── entries.js
│   ├── popups.js
│   ├── ui.js
│   ├── stories.js
│   ├── map.js
│   └── eventHandlers.js
└── supabase/
    └── schema.sql
```

## Supabase setup

1. Create a Supabase project.
2. In Supabase dashboard, enable Email auth provider.
3. Open SQL Editor and run [supabase/schema.sql](supabase/schema.sql).
4. Copy your Project URL and anon public key.
5. Edit [js/config.js](js/config.js):

```js
window.WAYMARK_CONFIG = {
    SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
    SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_PUBLIC_KEY'
};
```

You can reference [js/config.example.js](js/config.example.js) as a template.

## Data model

Two tables are used:

- `entries`: per-user journal entries mapped to geographic point keys
- `stories`: per-user story routes, entry ordering, visibility, color

Row Level Security is enabled and scoped to `auth.uid() = user_id`.

## Hosting from Supabase

This app is static, so host the built folder as static files (for example with Supabase Storage + CDN or any static host) while keeping Auth + Postgres in Supabase.

Requirements for hosting:

- Serve over HTTPS.
- Keep file paths unchanged (root-based static hosting).
- Ensure `index.html`, `manifest.webmanifest`, and `sw.js` are served with correct content types.

## PWA support

PWA pieces included:

- [manifest.webmanifest](manifest.webmanifest)
- [sw.js](sw.js) with app-shell caching
- Service worker registration in [js/pwa.js](js/pwa.js)

Notes:

- Supabase and ArcGIS network requests stay network-first.
- Static local assets are cached for improved repeat load and basic offline shell behavior.

## Platform boundaries (single repo, no code forks)

Waymark uses one shared web runtime for all platforms.

- Shared runtime (must stay platform-neutral):
    - [index.html](index.html)
    - [css/style.css](css/style.css)
    - [js/](js/)
    - [manifest.webmanifest](manifest.webmanifest)
    - [sw.js](sw.js)
- Android wrapper (packaging layer only):
    - Bubblewrap/TWA generated files (created during Android setup)
    - Android scripts in [package.json](package.json)
    - Android process docs in [docs/android-playstore-bubblewrap.md](docs/android-playstore-bubblewrap.md)

Rule of thumb:

- If a change affects browser behavior, make it in shared runtime files.
- If a change affects Play Store packaging/signing/domain linking, keep it in Android wrapper/config files.

See [docs/platform-boundaries.md](docs/platform-boundaries.md) for the contributor checklist.

## Run locally

Use any local static server (recommended, do not use file://):

```bash
npm run web:serve
```

Then open `http://localhost:8080`.

## Important operational notes

- Do not put service-role keys in browser code.
- Keep only the anon public key in [js/config.js](js/config.js).
- Large base64 images are currently stored directly in `entries.image`; consider moving images to Supabase Storage in a later improvement.

Let's try it!
