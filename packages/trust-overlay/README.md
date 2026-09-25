# Trust Assembly shared overlay

This package is the source of truth for the Trust Assembly browser overlay.
Chrome, Firefox, Safari, and the React Native WebView all run the same
`src/content.js` and `src/content.css` implementation.

Browser-specific manifests live in `manifests/`. The mobile app supplies the
small compatibility layer in `adapters/webview.js`; it implements only the
extension APIs required by the canonical content script and delegates public
correction requests to React Native.

Run the build whenever a shared source file changes:

```bash
npm run build:overlay
```

The build synchronizes the three loadable browser-extension directories and
generates `apps/mobile/src/generated/trustOverlay.generated.ts`. Generated
files must not be edited directly. CI can detect drift with:

```bash
npm run check:overlay
```
