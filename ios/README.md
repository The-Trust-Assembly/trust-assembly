# Trust Assembly for iOS

This directory contains the iOS container app, Safari Web Extension target,
and Share extension. The checked-in `project.yml` is the reproducible project
definition; generate the Xcode project on macOS with XcodeGen.

The generated `.xcodeproj` is intentionally not hand-authored on Windows.
Xcode is the authority for Apple target metadata and signing, and neither
`xcodebuild` nor Apple's Safari converter is available on Windows. After the
project has been generated and successfully built on a Mac, the team may
choose to commit the generated project or keep generating it in CI.

## Targets

- **TrustAssembly** — SwiftUI container around the clean-path web application.
- **TrustAssemblySafariExtension** — packages the shared files from
  `../extensions/safari`, plus an iOS native-auth bootstrap.
- **TrustAssemblyShareExtension** — saves a shared URL as a server-side draft.

The iOS app is not a native macOS app. A separate macOS target would need
`NSViewRepresentable` and macOS lifecycle code.

## Generate and build on macOS

Prerequisites:

- Xcode 15 or newer
- XcodeGen 2.38 or newer (`brew install xcodegen`)
- iOS 16.4 or newer deployment target

```bash
cd ios
xcodegen generate

# Reproducible unsigned Simulator check
xcodebuild \
  -project TrustAssembly.xcodeproj \
  -scheme TrustAssembly \
  -configuration Debug \
  -sdk iphonesimulator \
  CODE_SIGNING_ALLOWED=NO \
  build
```

`project.yml` deliberately contains no Apple Team ID, provisioning profile,
certificate, or developer-local path. For a physical device or archive, open
the generated project and select the correct team for all three targets.

## Required Apple configuration

Register these identifiers in the Apple Developer portal:

- `org.trustassembly.app`
- `org.trustassembly.app.safari`
- `org.trustassembly.app.share`
- App Group `group.org.trustassembly.shared`

The committed entitlement files declare the App Group and Associated Domain.
The main target also expands `aps-environment` from the build configuration
(`development` for Debug, `production` for Release). The selected provisioning
profiles must authorize the same capabilities.

Enable or verify the following capabilities in Xcode:

- Main app: App Groups, Associated Domains, Push Notifications, and Background
  Modes → Remote notifications.
- Safari extension: App Groups.
- Share extension: App Groups.

Do not change the App Group string in only one target; auth and share handoff
depend on all three targets using the same group.

## App icon and store metadata

The source UI uses an SF Symbol and therefore builds without a custom image
asset. Before distribution, create an `Assets.xcassets` app-icon set from
`../public/icons/Golden lighthouse emblem with laurel wreath.png` and set the
target's App Icon source. Complete App Store privacy labels and add the privacy
policy/support URLs in App Store Connect. `Resources/PrivacyInfo.xcprivacy`
declares the required-reason UserDefaults use and must be included in all three
target bundles (the XcodeGen spec does this).

## Web routes and authentication

The web application uses clean paths such as `/feed`, `/submit`, and `/review`.
Do not reintroduce old `/#feed` fragment URLs: the SPA reads
`window.location.pathname`.

Login and registration occur inside the WKWebView. The injected bridge:

1. Runs only on HTTPS pages at `trustassembly.org`.
2. Handles both string URLs and `Request` objects passed to `fetch`.
3. Stores the returned JWT in the main app Keychain.
4. Mirrors the token into the App Group for the two extensions.
5. Installs the server's `ta-session` cookie before a native navigation starts.

On launch, `/api/auth/me` validates a restored bearer token. A 401/403 clears
the native session; an offline or transient server failure preserves it.

## Safari Web Extension auth

The XcodeGen target packages the ordinary Safari extension resources from
`../extensions/safari`, excluding that directory's manifest. The iOS-specific
manifest in `TrustAssembly/Extension/Resources` adds `nativeMessaging` and uses
`native-background.js` as its service worker. That worker loads the ordinary
`background.js`, requests auth state through
`browser.runtime.sendNativeMessage`, and stores it in WebExtension storage.

This removes the otherwise unavoidable second login. It must be tested in the
packaged Safari extension; loading `extensions/safari` as a standalone browser
extension cannot access the native handler.

Users still have to enable the extension in Settings → Safari → Extensions and
grant website access. Safari controls those permissions; the app cannot grant
them automatically.

## Share extension behavior

The Share extension accepts one web URL or URL-shaped text, fetches article
metadata from `/api/import`, and saves a draft to `/api/drafts` using the App
Group token. iOS does not provide a supported API for a Share extension to
foreground its containing app. After saving, the extension therefore:

1. Shows a success message and returns to the host app.
2. Stores a one-shot `/feed?sharedDraft=<id>` route in the App Group.
3. Causes Trust Assembly to reload Feed when the user next opens the app, where
   the new draft appears with a Continue button.

## Universal Links and custom links

The app accepts both HTTPS Universal Links and `trustassembly://` links. The
Associated Domains entitlement is already declared, but the website must also
serve a valid file at:

`https://trustassembly.org/.well-known/apple-app-site-association`

Use the real Apple Team ID in that server file; it is intentionally not guessed
in this repository. At minimum, its `appID` is
`<TEAM_ID>.org.trustassembly.app` and its components should cover the public
record, citizen, verification, feed, submit, review, and vault routes.

## Push notifications

The app now requests a current APNs token on every authorized launch, persists
the real token, reassociates it after login, and unregisters it before clearing
auth on logout. The database migration and registration API are:

- `../db/migrations/018_user_devices.sql`
- `../src/app/api/users/me/devices/route.ts`

Registration alone does not deliver notifications. Production still requires
an APNs signing key/certificate and server-side APNs sending at the relevant
submission, jury, dispute, and consensus events. Until that server work is
deployed, device registration can succeed but no remote notification will
arrive.

## Release checklist

- Generate the project and build all targets on macOS.
- Run on a physical device; Simulator testing cannot validate APNs delivery.
- Verify login → extension token sync → logout on-device.
- Verify URL and plain-text shares from Safari and at least one third-party app.
- Verify Universal Links after deploying the AASA file.
- Add the production app icon and App Store screenshots/metadata.
- Test with airplane mode, expired JWTs, denied notification permission, and a
  full ten-draft account.
