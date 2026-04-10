import SwiftUI
import UserNotifications

@main
struct TrustAssemblyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var appState = AppState.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .onOpenURL { url in
                    // Handle Universal Links and deep links
                    if let resolved = DeepLinkService.resolve(url) {
                        // Navigate to the resolved URL in the web view
                        // The WKWebView will handle the routing
                        print("[TrustAssembly] Deep link: \(resolved)")
                    }
                }
        }
    }
}

// MARK: - AppDelegate for push notification handling

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // Called when APNs assigns a device token
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task {
            await PushService.shared.registerDeviceToken(deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[TrustAssembly] Push registration failed: \(error)")
    }

    // Handle notification while app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show as banner + badge + sound even when app is open
        completionHandler([.banner, .badge, .sound])
    }

    // Handle notification tap
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo

        // Extract the deep link from the notification payload
        if let urlString = userInfo["url"] as? String,
           let url = URL(string: urlString) {
            if let resolved = DeepLinkService.resolve(url) {
                // Navigate to the deep link
                print("[TrustAssembly] Notification tap → \(resolved)")
            }
        }

        completionHandler()
    }
}
