import Foundation
import Security

/// Manages JWT token storage in Keychain and App Group shared storage.
/// The Safari extension reads from the App Group UserDefaults.
class AuthService {
    static let shared = AuthService()

    private let keychainService = "org.trustassembly.auth"
    private let keychainAccount = "jwt-token"
    private let sharedSuiteName = "group.org.trustassembly.shared"
    private let sharedTokenKey = "ta-auth-token"

    // MARK: - Keychain Operations

    func saveToken(_ token: String) {
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
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)

        // Also save to App Group shared storage (for Safari extension)
        let defaults = UserDefaults(suiteName: sharedSuiteName)
        defaults?.set(token, forKey: sharedTokenKey)
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
}
