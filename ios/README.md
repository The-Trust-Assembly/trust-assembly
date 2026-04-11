# Trust Assembly — iOS / macOS App

Native Safari app with WKWebView shell, integrated Safari Web Extension, and push notifications.

## Architecture

```
ios/TrustAssembly/
├── Sources/
│   ├── App/
│   │   └── TrustAssemblyApp.swift    — @main entry, push notification handling
│   ├── Views/
│   │   ├── ContentView.swift          — Tab bar (mode-dependent)
│   │   ├── TrustWebView.swift         — WKWebView wrapper with auth bridge
│   │   └── ModeSelectionView.swift    — Post-registration mode choice
│   ├── Services/
│   │   ├── AuthService.swift          — Keychain + App Group token storage
│   │   ├── PushService.swift          — APNs registration + server sync
│   │   └── DeepLinkService.swift      — Universal Links handler
│   └── Models/
│       └── AppState.swift             — Observable app state (mode, auth, etc.)
├── Extension/
│   └── SafariWebExtensionHandler.swift — Token sync bridge for Safari extension
├── ShareExtension/                     — (Phase 2) Share sheet for quick URL submission
└── Info.plist
```

## User Modes

**Follower (Reader)** — 4 tabs: Feed, Explore, Assemblies, Profile
**Contributor** — 5 tabs: Feed, Submit, Review, Vaults, Profile

Mode is selected after registration and stored in App Group shared UserDefaults.
Can be changed later in Profile settings.

## Setup (Xcode)

### Prerequisites
- Xcode 15+
- iOS 16.4+ deployment target
- Apple Developer account (for push notifications and App Store)

### Steps

1. Create a new Xcode project: File → New → Project → App
   - Product Name: Trust Assembly
   - Team: Your Apple Developer team
   - Organization Identifier: org.trustassembly
   - Interface: SwiftUI
   - Language: Swift

2. Add the Safari Web Extension target:
   ```bash
   cd /path/to/trust-assembly
   xcrun safari-web-extension-converter extensions/safari/ \
     --project-location ios/ \
     --app-name "Trust Assembly" \
     --bundle-identifier org.trustassembly.app \
     --swift
   ```
   This generates the extension target inside the Xcode project.

3. Configure App Groups:
   - Select the app target → Signing & Capabilities → + Capability → App Groups
   - Add: `group.org.trustassembly.shared`
   - Do the same for the extension target

4. Configure Push Notifications:
   - App target → Signing & Capabilities → + Capability → Push Notifications
   - App target → Signing & Capabilities → + Capability → Background Modes → Remote notifications

5. Copy Swift source files from this directory into the Xcode project:
   - Drag `Sources/` into the app target
   - Drag `Extension/SafariWebExtensionHandler.swift` into the extension target

6. Add lighthouse images to Assets.xcassets:
   - `lighthouse-gold` from `public/icons/Golden lighthouse emblem with laurel wreath.png`
   - App icon from the same image (1024×1024 for App Store)

7. Configure Universal Links:
   - Add Associated Domains capability: `applinks:trustassembly.org`
   - Upload `apple-app-site-association` file to trustassembly.org/.well-known/

### Database Migration

Run migration 018 on your Neon database before testing push notifications:
```sql
psql $POSTGRES_URL < db/migrations/018_user_devices.sql
```

## Auth Token Flow

```
User logs in via WKWebView
  → /api/auth/login returns JWT
  → JavaScript bridge posts "authToken" to native
  → Native stores in Keychain + App Group
  → Safari extension reads from App Group (no second login)
```

## Push Notification Types

| Type | Follower | Contributor | Payload |
|------|----------|-------------|---------|
| jury_assigned | — | Yes | submission_id, org_name |
| submission_resolved | Yes | Yes | submission_id, status |
| dispute_filed | — | Yes | dispute_id, submission_id |
| consensus_reached | Yes | Yes | submission_id |
| di_needs_approval | — | Yes | submission_id |

## Server-Side Requirements

New API endpoint: `POST /api/users/me/devices` (already created)
New migration: `db/migrations/018_user_devices.sql` (already created)

For actual push delivery, you'll need:
1. APNs certificate or key from Apple Developer portal
2. Server-side push sending (e.g., `apn` npm package or Vercel Edge Function)
3. Integration into `vote-resolution.ts` to trigger pushes after resolution
