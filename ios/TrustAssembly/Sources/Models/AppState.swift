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

/// Centralized app state shared across the app
class AppState: ObservableObject {
    static let shared = AppState()

    @Published var isAuthenticated = false
    @Published var userMode: UserMode = .follower
    @Published var needsModeSelection = false
    @Published var username: String?
    @Published var displayName: String?
    @Published var email: String?
    @Published var deviceToken: String?

    private let modeKey = "ta-user-mode"
    private let modeSelectedKey = "ta-mode-selected"
    private let suiteName = "group.org.trustassembly.shared"

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

        // Check for shared auth token
        if AuthService.shared.getToken() != nil {
            isAuthenticated = true
            username = defaults.string(forKey: "ta-username")
            displayName = defaults.string(forKey: "ta-display-name")
            email = defaults.string(forKey: "ta-email")
        }
    }

    func setMode(_ mode: UserMode) {
        userMode = mode
        needsModeSelection = false
        let defaults = UserDefaults(suiteName: suiteName) ?? UserDefaults.standard
        defaults.set(mode.rawValue, forKey: modeKey)
        defaults.set(true, forKey: modeSelectedKey)
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
    }
}
