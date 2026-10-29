# Trust Assembly shared overlay

This package is the source of truth for the Trust Assembly browser overlay.
Chrome, Firefox, Safari, and the React Native WebView all run the same
`src/content.js` and `src/content.css` implementation.

Browser-specific manifests live in `manifests/`. The mobile app supplies the
small compatibility layer in `adapters/webview.js`; it implements only the
extension APIs required by the canonical content script and delegates public
correction requests to React Native.

On news homepages and social feeds, the overlay also inspects article links
near the viewport. It normalizes and batches up to 40 URLs through the
stateless `/api/corrections/batch` endpoint, caches both hits and misses, and
replaces a linked headline when an approved correction exists. The visible
assembly marker reveals the publisher's original headline on hover, focus, or
tap. A Bloom-filter precheck is intentionally deferred until the correction
corpus is large enough to justify distributing and refreshing one.

After a signed-in user submits a correction or affirmation, the client keeps
a private preview in local extension/app storage. It is merged into the
overlay only on that device and labeled as the user's pending submission; it
is never exposed by the public corrections endpoint. The preview is removed
when the reviewed submission appears in public results, on logout/account
change, or after 30 days.

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

## Local development API

Use Node 22 LTS for the local Next.js 14 server. Newer experimental Node
versions are not part of the supported development setup.

Start the Next.js site in one PowerShell window:

```powershell
$env:NEXT_PUBLIC_APP_URL = "http://localhost:3000"
node node_modules/next/dist/bin/next dev
```

This uses the database configured by `POSTGRES_URL`; verify that setting before
making test submissions. In a second window, create isolated development
extensions with:

```powershell
node packages/trust-overlay/scripts/build.mjs --dev --api-base=http://localhost:3000
```

Omitting `--api-base` uses `http://localhost:3000`. The output is written to
the git-ignored `.dev/trust-overlay/{chrome,firefox,safari}` directories. Load
`.dev/trust-overlay/chrome` as an unpacked Chrome extension. Development builds
are visibly named `Trust Assembly (Local Dev)` and neither overwrite nor make
the committed production extensions or downloadable ZIP files stale. Firefox
development output has a separate add-on ID to isolate its authentication,
cache, and settings from production. Reload its temporary add-on from
`about:debugging` after each rebuild.

The API base must be an HTTP(S) origin without credentials, a path, query, or
fragment. `--api-base` is rejected unless `--dev` is also present.

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
