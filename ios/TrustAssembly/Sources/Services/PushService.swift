import Foundation
import UserNotifications

/// Manages push notification registration and device token sync with the server.
class PushService {
    static let shared = PushService()

    private let baseURL = "https://trustassembly.org"

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
        AppState.shared.deviceToken = token

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
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                print("[TrustAssembly] Device token registered successfully")
            }
        } catch {
            print("[TrustAssembly] Device token registration failed: \(error)")
        }
    }

    /// Unregister device on logout
    func unregisterDevice() async {
        guard let token = AppState.shared.deviceToken,
              let authToken = AuthService.shared.getToken(),
              let url = URL(string: "\(baseURL)/api/users/me/devices") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["deviceToken": token])

        _ = try? await URLSession.shared.data(for: request)
    }
}
