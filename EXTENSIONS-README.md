# Trust Assembly Browser Extensions

**Corrections, affirmations, and translations — delivered where you read.**

Three browser-specific packages that overlay Trust Assembly's community-verified content directly onto any webpage.

---

## What the Extension Does

When you visit a page that has been reviewed by Trust Assembly citizens:

1. **Floating badge** appears in the bottom-right with a count of corrections + affirmations
2. **Click the badge** to open a side panel with full details
3. **Translations** are applied inline — jargon, euphemisms, and propaganda get annotated directly in the article text with a dotted underline and ᵀᴬ superscript
4. **Popup** (click the toolbar icon) shows a quick summary

### What It Shows

| Type | Display |
|------|---------|
| **Corrections** | Strikethrough original headline + red replacement |
| **Affirmations** | Green checkmark + confirmed headline |
| **Translations** | Inline dotted underline with hover tooltip + side panel list |

Each entry includes: the submitter's Trust Score and Profile, the Assembly name, the status (Approved, Consensus, etc.), reasoning, and evidence links.

---

## Installation

### Chrome

1. Download or clone the `ext-chrome/` directory
2. Open `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `ext-chrome/` folder
6. The ⚖ icon appears in your toolbar

### Firefox

1. Download or clone the `ext-firefox/` directory
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select any file inside `ext-firefox/` (e.g., `manifest.json`)
5. The ⚖ icon appears in your toolbar

**Note:** Temporary add-ons are removed when Firefox closes. For persistent installation, the extension needs to be signed by Mozilla (submit to [addons.mozilla.org](https://addons.mozilla.org)).

### Safari (Manual Load)

Safari requires Web Extensions to be wrapped in a native macOS/iOS app via Xcode. For development:

1. Open **Safari > Settings > Advanced** and check "Show features for web developers"
2. Open **Safari > Develop** menu and check **Allow Unsigned Extensions**
3. In Xcode, create a new Safari Web Extension project:
   ```bash
   xcrun safari-web-extension-converter ext-safari/
   ```
4. Build and run the Xcode project
5. Enable the extension in **Safari > Settings > Extensions**

**Note:** `Allow Unsigned Extensions` resets each time Safari launches. For distribution, the extension must be submitted to the App Store as part of a native app.

---

## Configuration

### API Endpoint

Edit `api-client.js` and change `API_BASE` to point to your Trust Assembly API:

```javascript
const API_BASE = "https://api.trustassembly.org"; // Your API URL
```

For local development:
```javascript
const API_BASE = "http://localhost:3000";
```

### Settings

The popup includes toggles for:
- **Show translations inline** — enable/disable inline text annotations
- **Show floating badge** — enable/disable the bottom-right badge

Settings are stored in browser extension storage and persist across sessions.

---

## API Contract

The extension expects the following API responses:

### `GET /api/corrections?url={encoded_url}`

Returns corrections, affirmations, and translations for a specific URL:

```json
{
  "corrections": [
    {
      "id": "abc123",
      "submissionType": "correction",
      "originalHeadline": "Evil Is Good, Says Expert",
      "replacement": "Evil Remains Bad — This Piece Is Ragebait",
      "author": "Jane Smith",
      "reasoning": "The article misrepresents the study...",
      "evidence": [{ "url": "https://...", "explanation": "Original study" }],
      "submittedBy": "citizen42",
      "orgName": "Media Watch Assembly",
      "status": "consensus",
      "trustScore": 12.4,
      "profile": "Oracle"
    }
  ],
  "affirmations": [
    {
      "id": "def456",
      "submissionType": "affirmation",
      "originalHeadline": "City Council Approves Budget",
      "author": "John Doe",
      "reasoning": "Verified against meeting minutes...",
      "evidence": [{ "url": "https://...", "explanation": "Meeting transcript" }],
      "submittedBy": "reporter7",
      "orgName": "Local News Assembly",
      "status": "approved",
      "trustScore": 8.2,
      "profile": "Diligent Reporter"
    }
  ],
  "translations": [
    {
      "id": "ghi789",
      "original": "Enhanced interrogation techniques",
      "translated": "Torture",
      "type": "euphemism",
      "orgName": "Plain Language Assembly",
      "status": "approved"
    }
  ],
  "meta": {
    "totalReviews": 3,
    "highestConsensus": true
  }
}
```

---

## File Structure

All three extensions share the same core files with browser-specific manifests:

```
ext-chrome/
├── manifest.json        # Manifest V3 (Chrome)
├── api-client.js        # API communication
├── content.js           # Injected into pages
├── content.css          # Styles for injected UI
├── popup.html           # Toolbar popup
├── popup.js             # Popup logic
├── background.js        # Service worker (badge, messaging)
├── icon16.png
├── icon48.png
└── icon128.png

ext-firefox/
├── manifest.json        # Manifest V2 (Firefox, broadest compat)
└── ... (same shared files)

ext-safari/
├── manifest.json        # Manifest V3 (Safari, requires Xcode wrapper)
└── ... (same shared files)
```

---

## Development

### Testing Without an API

For testing the UI without a running API server, you can modify `api-client.js` to return mock data:

```javascript
const TA = {
  async getForURL(url) {
    return {
      corrections: [{
        id: "test1",
        submissionType: "correction",
        originalHeadline: "Everything Is Fine",
        replacement: "Several Things Are Not Fine",
        reasoning: "Test correction",
        orgName: "Test Assembly",
        status: "consensus",
        trustScore: 15.2,
        profile: "Oracle"
      }],
      affirmations: [],
      translations: [{
        original: "Synergies",
        translated: "Layoffs",
        type: "euphemism",
        orgName: "Plain Language Assembly"
      }],
      meta: {}
    };
  }
};
```

### Translation Inline Rendering

Translations use a TreeWalker to find text nodes containing the original phrase, then replace them with annotated `<span>` elements. The annotation shows:
- Dotted underline colored by translation type
- ᵀᴬ superscript that reveals the translation on hover
- Side panel entry with full context

Translation types and their colors:
- **Clarity** (teal) — strip jargon for readability
- **Anti-Propaganda** (orange) — rename misleading government/corporate labels
- **Euphemism** (red) — call things what they are
- **Satirical** (purple) — approved humor, clearly marked

---

## Privacy

The extension sends the current page URL to the Trust Assembly API to check for corrections. No browsing history, personal data, or page content is transmitted. The URL query is necessary to match corrections to articles. Settings are stored locally in browser extension storage.
