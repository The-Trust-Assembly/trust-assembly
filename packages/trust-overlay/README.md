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

The build synchronizes the three loadable browser-extension directories,
regenerates their downloadable ZIPs in `public/`, and generates
`apps/mobile/src/generated/trustOverlay.generated.ts`. Generated files must not
be edited directly. CI can detect drift with:

```bash
npm run check:overlay
```

## Why generated outputs are committed

The generated extension directories and mobile TypeScript module are committed
on purpose. Chrome and Firefox load their directories directly, the iOS Xcode
project consumes `extensions/safari`, and Expo/Metro imports the generated
mobile module without first running the repository build script. Keeping these
outputs in Git makes a fresh checkout immediately buildable while
`check:overlay` prevents hand-edited or stale copies.

Packaged ZIP downloads are a different kind of artifact. Files in `public/`
are tracked because the web app links to them as downloadable static assets;
the overlay build regenerates them deterministically so CI can also detect
stale packages. Arbitrary or temporary ZIP archives elsewhere in the
repository should not be committed.
