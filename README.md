# Trust Assembly — Chrome Extension

**Truth Will Out.**

The red pen for the internet. This Chrome extension overlays community-verified headline corrections on any webpage you visit.

## Status: BETA

This is an early beta. Corrections are stored locally in your browser. Full jury review, multi-assembly membership, and server sync are available in the Trust Assembly web app.

## What It Does

- **Auto-detects headlines** on any page you visit
- **Overlays corrections** with strikethrough originals and red-pen replacements
- **Shows a page banner** when corrections exist for the current URL
- **Quick-submit** corrections from the popup — the original headline is auto-captured
- **Evidence URLs** — link supporting sources to your corrections
- **Badge count** shows how many corrections apply to the current tab

## Install (Developer Mode)

1. Clone or download this folder
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked** → select this `trust-assembly-extension` folder
5. The Trust Assembly icon appears in your toolbar

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config (Manifest V3) |
| `popup.html` | Extension popup UI |
| `popup.js` | Submit/view corrections from popup |
| `content.js` | Scans pages, overlays corrections |
| `content.css` | Styling for on-page overlays |
| `background.js` | Badge count service worker |
| `icon*.png` | Extension icons |

## How Corrections Work

In beta, corrections are stored in `chrome.storage.local` and auto-applied to matching pages. A correction matches when:

1. The page URL matches the correction's URL, OR
2. Any headline element (`h1`, `h2`, `h3`, `[class*='headline']`, etc.) contains text matching the original headline

Matched headlines get a strikethrough + red replacement + a clickable badge showing the full correction details, reasoning, evidence, and jury info.

## Demo

Click **Load Demo Corrections** in the Corrections tab to see two sample corrections. Then visit any page — the extension scans for matches automatically.
