# Platform Boundaries

This repo intentionally keeps one shared web app and separate platform wrappers.

## Source of truth

The web runtime is the source of truth for app behavior:

- `index.html`
- `css/`
- `js/`
- `manifest.webmanifest`
- `sw.js`

Any feature behavior change should happen here first.

## Platform wrappers

Platform wrappers package the same web app for distribution.

- Android wrapper: Bubblewrap/TWA artifacts and configuration.
- Desktop wrapper: Electron packaging config.

Wrapper files should not fork business logic.

## Contributor rules

1. Do not duplicate feature logic between web and wrapper layers.
2. Keep platform-specific changes isolated to wrapper/config/docs when possible.
3. Split commits when a change has both runtime and wrapper impacts.
4. Before merging, run the platform checks below.

## Checks before merge

Web checks:

1. `npm run web:serve`
2. Open the app in browser and verify login, map interactions, and story flows.
3. Confirm service worker still registers and app shell loads.

Android checks (when Android files are changed):

1. `npm run android:icons`
2. `npm run android:check`
3. `npm run android:doctor`
4. `WAYMARK_APP_ORIGIN=https://YOUR_DOMAIN npm run android:init` (when reinitializing)
5. `npm run android:build` (after initialization)
6. Verify Digital Asset Links and sign-in flow on device.

## Naming convention for scripts

- `web:*` for browser runtime workflows.
- `android:*` for Bubblewrap/TWA workflows.
- `desktop:*` for Electron workflows.
