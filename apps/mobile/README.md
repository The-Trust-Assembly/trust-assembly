# Trust Assembly mobile app

This Expo app provides an in-app browser, Trust Assembly submissions, assemblies,
settings, and authentication for Android and iOS. Its page overlay is generated
from the same canonical implementation used by the browser extensions in
`packages/trust-overlay`.

## Development

Use Node 20.19.4 or newer (Node 22 LTS is recommended), then run:

```bash
npm ci
npm run check
npm start
```

Run `npm run build:overlay` from the repository root after changing the shared
overlay. Do not edit `src/generated/trustOverlay.generated.ts` directly.

The app can browse public pages without an account. Sign-in is required for
submissions and membership features. Incoming links use either
`trustassembly://open?url=...` or `https://trustassembly.org/mobile/open?url=...`.

## Test on a physical Android device from Windows

Install these prerequisites:

- Node 22 LTS (or Node 20.19.4 or newer)
- JDK 17; do not use Java 8 or JDK 27 for this build
- Android SDK Platform 36, Build Tools 36, and Platform Tools
- USB debugging enabled and authorized on the phone

Android Studio can install the Android SDK components. Microsoft OpenJDK 17 can
also be installed from a terminal with:

```powershell
winget install --id Microsoft.OpenJDK.17 -e
```

In a new PowerShell window, configure the current session. Replace the JDK path
if the installed patch version differs:

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

java -version
adb devices -l
```

The Java command must report version 17, and the phone must have status
`device`, not `unauthorized`. From this directory, install and launch the app:

```powershell
npm.cmd ci
npx.cmd expo run:android
```

When more than one Android device is connected, use `--device` without a value
and select the device interactively. Expo expects a display name such as
`Pixel 8 Pro`, not the ADB serial number:

```powershell
npx.cmd expo run:android --device
```

The first run generates the ignored `android/` directory, builds a debug APK,
installs it, and starts Metro. If Gradle cannot find the SDK, create the ignored
file `android/local.properties` with your actual SDK path:

```properties
sdk.dir=C:/Users/YOUR_USERNAME/AppData/Local/Android/Sdk
```

If the phone cannot reach Metro over USB, run:

```powershell
adb reverse tcp:8081 tcp:8081
```

### Common Windows errors

- `npx.ps1 cannot be loaded`: run `npx.cmd` (and `npm.cmd`) instead of changing
  the system execution policy.
- `Unsupported class file major version 71`: Gradle used JDK 27. Point
  `JAVA_HOME` to JDK 17, verify `java -version`, run
  `.\android\gradlew.bat --stop`, and rebuild.
- `SDK location not found`: set `ANDROID_HOME` and `ANDROID_SDK_ROOT`, or add
  `android/local.properties` as shown above.
- Device not found by serial: omit `--device`, or use interactive device
  selection and choose the phone's display name.

### Physical-device smoke test

1. Browse several external HTTP(S) pages and verify the overlay loads.
2. Open correction details and test mute/unmute and display settings.
3. Sign in and verify joined/followed assembly badges.
4. Save and resume a draft, then submit a correction or affirmation.
5. Test a `trustassembly://open?url=...` deep link.
6. Temporarily disable networking and verify cached correction behavior.
7. Sign out and confirm protected actions require authentication.

The Expo dependencies, including `expo-system-ui`, are committed in
`package.json` and `package-lock.json`. JDK/SDK environment variables and
`android/local.properties` are machine-specific and intentionally not
committed.

## Native iOS build

An iOS build requires macOS and Xcode. See `../../ios/README.md` for XcodeGen,
simulator-build, signing, Safari extension, and Share extension instructions.

## Release setup

The checked-in configuration uses `org.trustassembly.mobile` for both Android
and iOS. Before store submission, configure signing credentials, verify the
associated-domain files served by `trustassembly.org`, and replace the starter
app-store artwork with final production assets.
