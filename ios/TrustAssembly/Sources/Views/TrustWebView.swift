import SwiftUI
import UIKit
import WebKit

/// WKWebView wrapper that loads trustassembly.org and bridges auth events
/// between the web app and the native shell.
struct TrustWebView: UIViewRepresentable {
    let url: URL
    @EnvironmentObject var appState: AppState

    func makeCoordinator() -> Coordinator {
        Coordinator(appState: appState)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        let userContent = config.userContentController
        userContent.add(context.coordinator, name: "trustAssemblyBridge")
        userContent.addUserScript(Self.bridgeScript)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic

        context.coordinator.request(url, in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Only a changed native route should initiate a load. Comparing with
        // webView.url would incorrectly undo navigation performed inside the
        // SPA whenever SwiftUI re-renders this view.
        guard context.coordinator.lastRequestedURL != url else { return }
        context.coordinator.request(url, in: webView)
    }

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(
            forName: "trustAssemblyBridge"
        )
        uiView.navigationDelegate = nil
        uiView.uiDelegate = nil
    }

    private static let bridgeScript = WKUserScript(
        source: #"""
        (function() {
            const trustedHost = location.hostname === 'trustassembly.org' ||
                location.hostname === 'www.trustassembly.org';
            if (location.protocol !== 'https:' || !trustedHost || window.__taNativeBridgeInstalled) {
                return;
            }
            window.__taNativeBridgeInstalled = true;

            window.TrustAssemblyNative = Object.freeze({
                postMessage: function(type, data) {
                    window.webkit.messageHandlers.trustAssemblyBridge.postMessage({
                        type: type,
                        data: data || {}
                    });
                },
                isMobileApp: true,
                platform: 'ios'
            });

            const originalFetch = window.fetch;
            window.fetch = function() {
                const args = arguments;
                let requestURL = null;
                try {
                    const input = args[0];
                    const rawURL = typeof input === 'string'
                        ? input
                        : (input && typeof input.url === 'string' ? input.url : String(input));
                    requestURL = new URL(rawURL, location.href);
                } catch (_) {}

                return originalFetch.apply(this, args).then(function(response) {
                    if (!requestURL || requestURL.origin !== location.origin) return response;

                    const path = requestURL.pathname.replace(/\/+$/, '');
                    if ((path === '/api/auth/login' || path === '/api/auth/register') && response.ok) {
                        response.clone().json().then(function(data) {
                            if (!data || !data.token) return;
                            window.TrustAssemblyNative.postMessage('authToken', {
                                token: data.token,
                                username: (data.user && data.user.username) || data.username,
                                displayName: (data.user && data.user.displayName) || data.displayName,
                                email: (data.user && data.user.email) || data.email
                            });
                            if (path === '/api/auth/register') {
                                window.TrustAssemblyNative.postMessage('newRegistration', {});
                            }
                        }).catch(function() {});
                    } else if (path === '/api/auth/logout' && response.ok) {
                        window.TrustAssemblyNative.postMessage('logout', {});
                    }
                    return response;
                });
            };
        })();
        """#,
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true
    )

    // MARK: - Coordinator

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        private let appState: AppState
        fileprivate var lastRequestedURL: URL?

        init(appState: AppState) {
            self.appState = appState
        }

        fileprivate func request(_ url: URL, in webView: WKWebView) {
            lastRequestedURL = url

            guard let token = AuthService.shared.getToken(),
                  AuthService.shared.isPlausibleToken(token),
                  let cookie = Self.sessionCookie(token: token) else {
                webView.load(URLRequest(url: url))
                return
            }

            // Install the cookie before the navigation begins. The previous
            // implementation raced setCookie() against load() and used the
            // wrong server cookie name.
            webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) { [weak self, weak webView] in
                DispatchQueue.main.async {
                    guard let self, let webView, self.lastRequestedURL == url else { return }
                    webView.load(URLRequest(url: url))
                }
            }
        }

        private static func sessionCookie(token: String) -> HTTPCookie? {
            var properties: [HTTPCookiePropertyKey: Any] = [
                .name: "ta-session",
                .value: token,
                .domain: ".trustassembly.org",
                .path: "/",
                .secure: "TRUE",
            ]
            properties[HTTPCookiePropertyKey("HttpOnly")] = "TRUE"
            if let expiration = AuthService.shared.tokenExpiration(token) {
                properties[.expires] = expiration
            }
            return HTTPCookie(properties: properties)
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "trustAssemblyBridge",
                  message.frameInfo.isMainFrame,
                  Self.isTrusted(message.frameInfo.request.url),
                  let body = message.body as? [String: Any],
                  let type = body["type"] as? String,
                  let data = body["data"] as? [String: Any] else { return }

            switch type {
            case "authToken":
                guard let token = data["token"] as? String,
                      AuthService.shared.isPlausibleToken(token) else { return }

                guard AuthService.shared.saveToken(token) else { return }
                let username = data["username"] as? String
                let displayName = data["displayName"] as? String
                let email = data["email"] as? String

                Task { @MainActor in
                    appState.setAuthenticated(
                        username: username,
                        displayName: displayName,
                        email: email
                    )
                    await PushService.shared.registerStoredDeviceToken()
                }

            case "logout":
                // Preserve the bearer token until the server has had a chance
                // to remove this APNs token from the old account.
                Task {
                    await PushService.shared.unregisterDevice()
                    await MainActor.run {
                        appState.clearAuth()
                    }
                }

            case "newRegistration":
                Task { @MainActor in
                    appState.needsModeSelection = true
                }

            default:
                print("[TrustAssembly] Unknown bridge message: \(type)")
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let destination = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if Self.isTrusted(destination) {
                // WKWebView does not create target=_blank windows by default.
                // Keep trusted app routes in the same web view.
                if navigationAction.targetFrame == nil {
                    webView.load(navigationAction.request)
                    decisionHandler(.cancel)
                } else {
                    decisionHandler(.allow)
                }
                return
            }

            // Never expose the privileged bridge to arbitrary origins. Open
            // articles, mail links, and other external destinations in the
            // appropriate system application instead.
            let isTopLevelNavigation = navigationAction.targetFrame?.isMainFrame == true
                || navigationAction.targetFrame == nil
            if isTopLevelNavigation,
               ["http", "https", "mailto", "tel"].contains(destination.scheme?.lowercased() ?? "") {
                UIApplication.shared.open(destination)
            }
            decisionHandler(.cancel)
        }

        private static func isTrusted(_ url: URL?) -> Bool {
            guard let url, url.scheme?.lowercased() == "https" else { return false }
            let host = url.host?.lowercased()
            return host == "trustassembly.org" || host == "www.trustassembly.org"
        }
    }
}
