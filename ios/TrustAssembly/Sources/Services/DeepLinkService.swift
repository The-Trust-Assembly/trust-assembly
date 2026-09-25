import Foundation

/// Handles Universal Links and URL scheme deep links.
/// Maps trustassembly.org URLs to in-app navigation.
struct DeepLinkService {

    private static let canonicalScheme = "https"
    private static let canonicalHost = "trustassembly.org"

    /// Convert a trusted Universal Link or `trustassembly://` URL into the
    /// canonical HTTPS URL loaded by the WKWebView. URLs for other origins are
    /// deliberately rejected.
    static func resolve(_ url: URL) -> URL? {
        if url.scheme?.lowercased() == canonicalScheme {
            let host = url.host?.lowercased()
            guard host == canonicalHost || host == "www.\(canonicalHost)" else { return nil }
            return canonicalURL(
                path: url.path,
                percentEncodedQuery: URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedQuery
            )
        }

        guard url.scheme?.lowercased() == "trustassembly" else { return nil }

        // Custom links use the host as the first path component, for example:
        // trustassembly://record/123 -> https://trustassembly.org/record/123
        var pathComponents: [String] = []
        if let host = url.host, !host.isEmpty {
            pathComponents.append(host)
        }
        pathComponents.append(contentsOf: url.pathComponents.filter { $0 != "/" })
        let path = "/" + pathComponents.joined(separator: "/")
        return canonicalURL(
            path: path,
            percentEncodedQuery: URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedQuery
        )
    }

    static func preferredTab(for url: URL, mode: UserMode) -> String {
        let path = url.path

        if path == "/profile" || path.hasPrefix("/citizen/") {
            return "profile"
        }
        if mode == .contributor {
            if path == "/submit" { return "submit" }
            if path == "/review" { return "review" }
            if path == "/vault" { return "vault" }
        } else {
            if path == "/consensus" { return "explore" }
            if path == "/orgs" || path.hasPrefix("/assembly/") { return "assemblies" }
        }
        return "feed"
    }

    private static func canonicalURL(path: String, percentEncodedQuery: String?) -> URL? {
        var components = URLComponents()
        components.scheme = canonicalScheme
        components.host = canonicalHost
        components.path = path.isEmpty ? "/" : path
        components.percentEncodedQuery = percentEncodedQuery
        return components.url
    }
}
