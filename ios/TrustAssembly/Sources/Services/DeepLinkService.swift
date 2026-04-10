import Foundation

/// Handles Universal Links and URL scheme deep links.
/// Maps trustassembly.org URLs to in-app navigation.
struct DeepLinkService {

    /// Parse a URL into an in-app path for the WKWebView
    static func resolve(_ url: URL) -> String? {
        let host = url.host?.replacingOccurrences(of: "www.", with: "")
        guard host == "trustassembly.org" else { return nil }

        let path = url.path

        // Direct web paths the WKWebView can load
        // /record/{id} — submission detail
        // /citizen/{username} — citizen profile
        // /verify-email?token=xxx — email verification
        // /feed — main feed
        // /submit — submit screen
        // /review — review screen

        if path.hasPrefix("/record/") ||
           path.hasPrefix("/citizen/") ||
           path.hasPrefix("/verify-email") ||
           path == "/feed" ||
           path == "/submit" ||
           path == "/review" ||
           path == "/" {
            return url.absoluteString
        }

        // Default: load the full URL in WKWebView
        return url.absoluteString
    }
}
