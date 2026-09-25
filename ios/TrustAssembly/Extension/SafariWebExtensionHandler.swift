import SafariServices
import os.log

/// Bridge between the native app and the Safari Web Extension.
/// Handles token synchronization via App Groups so the extension
/// can authenticate without a separate login.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    private let logger = Logger(subsystem: "org.trustassembly", category: "extension")
    private let sharedSuiteName = "group.org.trustassembly.shared"
    private let sharedTokenKey = "ta-auth-token"

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message = request?.userInfo?[SFExtensionMessageKey] as? [String: Any]

        let profile: UUID?
        if #available(iOS 17.0, *) {
            profile = request?.userInfo?[SFExtensionProfileRequestKey] as? UUID
        } else {
            profile = nil
        }

        guard message?["type"] as? String == "getAuthState" else {
            complete(context, response: [
                "ok": false,
                "error": "Unsupported native message",
            ])
            return
        }

        // Read shared auth state from the App Group. JavaScript must request
        // this through browser.runtime.sendNativeMessage; browser storage and
        // UserDefaults are separate sandboxes.
        let defaults = UserDefaults(suiteName: sharedSuiteName)
        let token = defaults?.string(forKey: sharedTokenKey)

        var responseDict: [String: Any] = [
            "ok": true,
            "loggedIn": token?.isEmpty == false,
        ]

        if let token, !token.isEmpty {
            responseDict["authToken"] = token
            logger.info("Providing auth token to extension")
        } else {
            logger.info("No auth token available for extension")
        }

        if let username = defaults?.string(forKey: "ta-username") {
            responseDict["username"] = username
        }
        if let displayName = defaults?.string(forKey: "ta-display-name") {
            responseDict["displayName"] = displayName
        }
        if let profile {
            responseDict["profile"] = profile.uuidString
        }

        complete(context, response: responseDict)
    }

    private func complete(_ context: NSExtensionContext, response responseDict: [String: Any]) {
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: responseDict]
        context.completeRequest(returningItems: [response], completionHandler: nil)
     }
}
