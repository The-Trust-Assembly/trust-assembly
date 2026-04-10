import SafariServices
import os.log

/// Bridge between the native app and the Safari Web Extension.
/// Handles token synchronization via App Groups so the extension
/// can authenticate without a separate login.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    private let logger = Logger(subsystem: "org.trustassembly", category: "extension")
    private let sharedSuiteName = "group.org.trustassembly.shared"
    private let sharedTokenKey = "ta-auth-token"

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, *) {
            profile = request?.userInfo?[SFExtensionProfileRequestKey] as? UUID
        } else {
            profile = nil
        }

        // Read shared auth token from App Group
        let defaults = UserDefaults(suiteName: sharedSuiteName)
        let token = defaults?.string(forKey: sharedTokenKey)

        // Build response message for the extension's background.js
        let response = NSExtensionItem()
        var responseDict: [String: Any] = [:]

        if let token = token {
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

        response.userInfo = [SFExtensionMessageKey: responseDict]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
