import SwiftUI
import UIKit
import UserNotifications

@main
struct TrustAssemblyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var appState = AppState.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .task {
                    await appState.restoreSession()
                    appState.consumePendingShareDeepLink()
                }
                .onOpenURL { url in
                    appState.openURL(url)
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL {
                        appState.openURL(url)
                    }
                }
                .onChange(of: scenePhase) { phase in
                    if phase == .active {
                        appState.consumePendingShareDeepLink()
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

        // APNs can change a token between launches. Ask for a current token on
        // every launch when the user has already granted permission.
        Task {
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            if [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) {
                await MainActor.run {
                    application.registerForRemoteNotifications()
                }
            }
        }

        if let userInfo = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
            routeNotification(userInfo)
        }
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
            Task { @MainActor in
                AppState.shared.openURL(url)
            }
        }

        completionHandler()
    }

    private func routeNotification(_ userInfo: [AnyHashable: Any]) {
        guard let urlString = userInfo["url"] as? String,
              let url = URL(string: urlString) else { return }
        Task { @MainActor in
            AppState.shared.openURL(url)
        }
    }
}
