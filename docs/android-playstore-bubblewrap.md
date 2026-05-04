# Android Play Store Setup (Bubblewrap/TWA)

This project can ship to Google Play as a Trusted Web Activity (TWA) using Bubblewrap.

## 1) Required inputs

Fill these values before running `android:init`:

- Production web origin (HTTPS): `https://YOUR_DOMAIN`
- Android package ID (example): `io.github.happyporcupines.waymark`
- App display name: `Waymark`

## 2) One-time local prerequisites

Install these on your machine:

- Java JDK 17+
- Android Studio (SDK + build tools)
- Node.js 20+

Then verify Bubblewrap prerequisites:

```bash
npm run android:doctor
```

## 3) Initialize Android project from web manifest

```bash
WAYMARK_APP_ORIGIN=https://YOUR_DOMAIN npm run android:init
```

The init script validates your HTTPS origin, then runs Bubblewrap against:

```bash
https://YOUR_DOMAIN/manifest.webmanifest
```

This generates TWA files (including `twa-manifest.json`) and an Android project folder.

## 4) Generate/check Android-ready web assets

Generate PNG icons from existing SVG icons:

```bash
npm run android:icons
```

Run local Play Store preflight checks:

```bash
npm run android:check
```

## 5) Build Android app bundle

```bash
npm run android:build
```

Expected output is an `.aab` file for Play Console upload.

## 6) Important Waymark-specific checks before store submission

- Manifest and service worker are served on production with HTTP 200.
- Digital Asset Links file is reachable:
  - `https://YOUR_DOMAIN/.well-known/assetlinks.json`
- Supabase auth flow works inside TWA on physical Android devices.
- App shell loads offline for previously visited screens.

## 7) Digital Asset Links template

This repo includes a starter template at:

`/.well-known/assetlinks.json.template`

Create your production `/.well-known/assetlinks.json` from that template using your real package name and SHA-256 certificate fingerprint.

## 8) Suggested release order

- `v1.0` Play-ready baseline (existing web features, no extent-download).
- `v1.1` map extent offline-download feature after closed testing feedback.

## 9) First execution checklist

1. Deploy current app to stable HTTPS domain.
2. Run `npm run android:icons`.
3. Run `npm run android:check`.
4. Run `npm run android:doctor`.
5. Run `WAYMARK_APP_ORIGIN=https://YOUR_DOMAIN npm run android:init`.
6. Create `/.well-known/assetlinks.json` from the template and verify domain linkage.
7. Run `npm run android:build` and upload `.aab` to internal testing track.
