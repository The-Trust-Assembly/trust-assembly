import Foundation
import SwiftUI

/// User's chosen experience mode
enum UserMode: String, Codable {
    case follower   // Browse corrections, follow assemblies
    case contributor // Submit corrections, serve on juries, manage vaults

    var displayName: String {
        switch self {
        case .follower: return "Reader"
        case .contributor: return "Contributor"
        }
    }
}

/// Centralized app state shared across the app.
///
/// UI state is kept on the main actor because it is observed directly by
/// SwiftUI and is also updated by app/notification delegate callbacks.
@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()

    @Published var isAuthenticated = false
    @Published var isRestoringSession = false
    @Published var userMode: UserMode = .follower
    @Published var needsModeSelection = false
    @Published var username: String?
    @Published var displayName: String?
    @Published var email: String?
    @Published var deviceToken: String?
    @Published var selectedTab = "feed"

    /// A deep link can replace the initial URL for a native tab without
    /// forcing all of the other tabs to navigate to the same URL.
    private var tabURLOverrides: [String: URL] = [:]
    private var anonymousURLOverride: URL?

    private let modeKey = "ta-user-mode"
    private let modeSelectedKey = "ta-mode-selected"
    private let deviceTokenKey = "ta-device-token"
    private let pendingDeepLinkKey = "ta-pending-deep-link"
    private let suiteName = "group.org.trustassembly.shared"
    private let baseURL = URL(string: "https://trustassembly.org")!

    init() {
        loadPersistedState()
    }

    func loadPersistedState() {
        let defaults = UserDefaults(suiteName: suiteName) ?? UserDefaults.standard
        if let modeRaw = defaults.string(forKey: modeKey),
           let mode = UserMode(rawValue: modeRaw) {
            userMode = mode
        }
        needsModeSelection = !defaults.bool(forKey: modeSelectedKey)
        deviceToken = defaults.string(forKey: deviceTokenKey)

        // Check for shared auth token
        if AuthService.shared.getToken() != nil {
            isAuthenticated = true
            username = defaults.string(forKey: "ta-username")
            displayName = defaults.string(forKey: "ta-display-name")
            email = defaults.string(forKey: "ta-email")
        }
    }

    /// Verify a restored Keychain token before treating it as a current
    /// server session. This also refreshes profile metadata that may have
    /// changed since the last launch.
    func restoreSession() async {
        guard AuthService.shared.getToken() != nil else {
            isAuthenticated = false
            return
        }

        isRestoringSession = true
        defer { isRestoringSession = false }

        switch await AuthService.shared.validateCurrentUser() {
        case .invalid:
            clearAuth()
        case .unavailable:
            // Preserve the local session during a transient offline/server
            // failure. The WKWebView will surface its own network state.
            break
        case .authenticated(let profile):
            setAuthenticated(
                username: profile.username,
                displayName: profile.displayName,
                email: profile.email
            )
            await PushService.shared.registerStoredDeviceToken()
        }
    }

    func setMode(_ mode: UserMode) {
        userMode = mode
        needsModeSelection = false
        let defaults = UserDefaults(suiteName: suiteName) ?? UserDefaults.standard
        defaults.set(mode.rawValue, forKey: modeKey)
        defaults.set(true, forKey: modeSelectedKey)

        if mode == .follower && ["submit", "review", "vault"].contains(selectedTab) {
            selectedTab = "feed"
        }
    }

    func setAuthenticated(username: String?, displayName: String?, email: String?) {
        self.isAuthenticated = true
        self.username = username
        self.displayName = displayName
        self.email = email
        let defaults = UserDefaults(suiteName: suiteName) ?? UserDefaults.standard
        defaults.set(username, forKey: "ta-username")
        defaults.set(displayName, forKey: "ta-display-name")
        defaults.set(email, forKey: "ta-email")
    }

    func clearAuth() {
        isAuthenticated = false
        username = nil
        displayName = nil
        email = nil
        AuthService.shared.clearToken()
        let defaults = UserDefaults(suiteName: suiteName) ?? UserDefaults.standard
        defaults.removeObject(forKey: "ta-username")
        defaults.removeObject(forKey: "ta-display-name")
        defaults.removeObject(forKey: "ta-email")
        selectedTab = "feed"
        tabURLOverrides.removeAll()
    }

    func setDeviceToken(_ token: String) {
        deviceToken = token
        let defaults = UserDefaults(suiteName: suiteName) ?? UserDefaults.standard
        defaults.set(token, forKey: deviceTokenKey)
    }

    /// Resolve a Universal Link, custom URL, or notification URL and route it
    /// into the appropriate native tab.
    func openURL(_ incomingURL: URL) {
        guard let resolved = DeepLinkService.resolve(incomingURL) else { return }

        if !isAuthenticated {
            anonymousURLOverride = resolved
            return
        }

        let tab = DeepLinkService.preferredTab(for: resolved, mode: userMode)
        tabURLOverrides[tab] = resolved
        selectedTab = tab
    }

    func url(forTab tab: String, defaultPath: String) -> URL {
        tabURLOverrides[tab] ?? baseURL.appending(path: defaultPath)
    }

    func anonymousURL(defaultPath: String = "") -> URL {
        anonymousURLOverride ?? baseURL.appending(path: defaultPath)
    }

    /// A Share extension cannot reliably foreground its containing app. It
    /// leaves a one-shot route in the App Group instead; consume it whenever
    /// the app becomes active.
    func consumePendingShareDeepLink() {
        let defaults = UserDefaults(suiteName: suiteName)
        guard let rawURL = defaults?.string(forKey: pendingDeepLinkKey),
              let url = URL(string: rawURL) else { return }

        defaults?.removeObject(forKey: pendingDeepLinkKey)
        openURL(url)
    }
}
