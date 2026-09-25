import Foundation
import UIKit
import UserNotifications

/// Manages push notification registration and device token sync with the server.
final class PushService {
    static let shared = PushService()

    private let baseURL = "https://trustassembly.org"
    private let suiteName = "group.org.trustassembly.shared"
    private let deviceTokenKey = "ta-device-token"

    /// Request notification permission from the user
    func requestPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            if granted {
                await MainActor.run {
                    // Triggers didRegisterForRemoteNotificationsWithDeviceToken
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            return granted
        } catch {
            print("[TrustAssembly] Push permission error: \(error)")
            return false
        }
    }

    /// Register device token with the server
    func registerDeviceToken(_ tokenData: Data) async {
        let token = tokenData.map { String(format: "%02x", $0) }.joined()
        guard !token.isEmpty else {
            print("[TrustAssembly] Ignoring an empty APNs device token")
            return
        }
        await registerDeviceToken(token)
    }

    /// Reassociate the last APNs token with the currently authenticated user.
    /// APNs commonly returns the same token, so retaining the real token avoids
    /// the previous empty-Data re-registration bug after login.
    func registerStoredDeviceToken() async {
        let storedToken = UserDefaults(suiteName: suiteName)?.string(forKey: deviceTokenKey)
        guard let storedToken, !storedToken.isEmpty else { return }
        await registerDeviceToken(storedToken)
    }

    private func registerDeviceToken(_ token: String) async {
        await MainActor.run {
            AppState.shared.setDeviceToken(token)
        }

        guard let authToken = AuthService.shared.getToken() else { return }

        guard let url = URL(string: "\(baseURL)/api/users/me/devices") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "deviceToken": token,
            "platform": "ios",
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse,
               (200..<300).contains(httpResponse.statusCode) {
                print("[TrustAssembly] Device token registered successfully")
            } else if let httpResponse = response as? HTTPURLResponse {
                print("[TrustAssembly] Device token registration returned HTTP \(httpResponse.statusCode)")
            }
        } catch {
            print("[TrustAssembly] Device token registration failed: \(error)")
        }
    }

    /// Unregister device on logout
    func unregisterDevice() async {
        let inMemoryToken = await MainActor.run { AppState.shared.deviceToken }
        let storedToken = UserDefaults(suiteName: suiteName)?.string(forKey: deviceTokenKey)
        guard let token = inMemoryToken ?? storedToken,
              !token.isEmpty,
              let authToken = AuthService.shared.getToken(),
              let url = URL(string: "\(baseURL)/api/users/me/devices") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["deviceToken": token])

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse,
               !(200..<300).contains(httpResponse.statusCode) {
                print("[TrustAssembly] Device unregister returned HTTP \(httpResponse.statusCode)")
            }
        } catch {
            print("[TrustAssembly] Device unregister failed: \(error)")
        }
    }
}
