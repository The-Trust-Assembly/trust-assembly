import Foundation
import Security

struct AuthenticatedUser: Decodable {
    let username: String
    let displayName: String?
    let email: String?

    enum CodingKeys: String, CodingKey {
        case username
        case displayName = "display_name"
        case email
    }
}

enum SessionValidationResult {
    case authenticated(AuthenticatedUser)
    case invalid
    case unavailable
}

/// Manages JWT token storage in Keychain and App Group shared storage.
/// The Safari extension reads from the App Group UserDefaults.
final class AuthService {
    static let shared = AuthService()

    private let currentUserURL = URL(string: "https://trustassembly.org/api/auth/me")!
    private let keychainService = "org.trustassembly.auth"
    private let keychainAccount = "jwt-token"
    private let sharedSuiteName = "group.org.trustassembly.shared"
    private let sharedTokenKey = "ta-auth-token"

    // MARK: - Keychain Operations

    @discardableResult
    func saveToken(_ token: String) -> Bool {
        guard isPlausibleToken(token) else {
            print("[TrustAssembly] Refusing to store a malformed or expired auth token")
            return false
        }

        // Save to Keychain (secure, survives app reinstall)
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else {
            print("[TrustAssembly] Could not store auth token in Keychain (status: \(status))")
            return false
        }

        // Also save to App Group shared storage (for Safari extension)
        let defaults = UserDefaults(suiteName: sharedSuiteName)
        defaults?.set(token, forKey: sharedTokenKey)
        return true
    }

    func getToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func clearToken() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
        ]
        SecItemDelete(query as CFDictionary)

        let defaults = UserDefaults(suiteName: sharedSuiteName)
        defaults?.removeObject(forKey: sharedTokenKey)
    }

    func isPlausibleToken(_ token: String) -> Bool {
        let segments = token.split(separator: ".")
        guard segments.count == 3, token.count <= 8_192 else { return false }

        // If the JWT has an `exp` claim, reject it locally once expired. The
        // server remains authoritative and is queried by fetchCurrentUser().
        if let expiration = tokenExpiration(token), expiration <= Date() {
            return false
        }
        return true
    }

    func tokenExpiration(_ token: String) -> Date? {
        let segments = token.split(separator: ".")
        guard segments.count == 3 else { return nil }

        var encoded = String(segments[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let padding = (4 - encoded.count % 4) % 4
        encoded.append(String(repeating: "=", count: padding))

        guard let payloadData = Data(base64Encoded: encoded),
              let payload = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
              let timestamp = payload["exp"] as? NSNumber else { return nil }
        return Date(timeIntervalSince1970: timestamp.doubleValue)
    }

    /// Validate the bearer token with the server and return current profile
    /// data. This prevents stale Keychain data from creating a false native
    /// authenticated state.
    func validateCurrentUser() async -> SessionValidationResult {
        guard let token = getToken(), isPlausibleToken(token) else { return .invalid }

        var request = URLRequest(url: currentUserURL)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 15

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else { return .unavailable }
            if httpResponse.statusCode == 401 || httpResponse.statusCode == 403 {
                return .invalid
            }
            guard (200..<300).contains(httpResponse.statusCode) else { return .unavailable }
            let user = try JSONDecoder().decode(AuthenticatedUser.self, from: data)
            return .authenticated(user)
        } catch {
            print("[TrustAssembly] Session validation failed: \(error)")
            return .unavailable
        }
    }
}
