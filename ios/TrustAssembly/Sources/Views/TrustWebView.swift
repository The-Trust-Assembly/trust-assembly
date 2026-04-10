import SwiftUI
import WebKit

/// WKWebView wrapper that loads trustassembly.org and bridges auth tokens
/// between the web app and the native shell.
struct TrustWebView: UIViewRepresentable {
    let url: URL
    @EnvironmentObject var appState: AppState

    func makeCoordinator() -> Coordinator {
        Coordinator(appState: appState)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()

        // Enable JavaScript
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        // Set up message handlers for native ↔ web communication
        let userContent = config.userContentController
        userContent.add(context.coordinator, name: "trustAssemblyBridge")

        // Inject bridge script that the web app uses to communicate with native
        let bridgeScript = WKUserScript(
            source: """
            window.TrustAssemblyNative = {
                postMessage: function(type, data) {
                    window.webkit.messageHandlers.trustAssemblyBridge.postMessage({
                        type: type,
                        data: data || {}
                    });
                },
                isMobileApp: true,
                platform: 'ios'
            };

            // Intercept auth events from the SPA
            (function() {
                const origFetch = window.fetch;
                window.fetch = function() {
                    return origFetch.apply(this, arguments).then(function(response) {
                        const url = arguments[0];
                        if (typeof url === 'string') {
                            // Capture login response
                            if (url.includes('/api/auth/login') && response.ok) {
                                response.clone().json().then(function(data) {
                                    if (data.token) {
                                        window.TrustAssemblyNative.postMessage('authToken', {
                                            token: data.token,
                                            username: data.username,
                                            displayName: data.displayName,
                                            email: data.email
                                        });
                                    }
                                }).catch(function() {});
                            }
                            // Capture logout
                            if (url.includes('/api/auth/logout')) {
                                window.TrustAssemblyNative.postMessage('logout', {});
                            }
                            // Capture registration
                            if (url.includes('/api/auth/register') && response.ok) {
                                response.clone().json().then(function(data) {
                                    if (data.token) {
                                        window.TrustAssemblyNative.postMessage('authToken', {
                                            token: data.token,
                                            username: data.user?.username || data.username,
                                            displayName: data.user?.displayName || data.displayName,
                                            email: data.user?.email || data.email
                                        });
                                        // Signal that this is a new registration
                                        window.TrustAssemblyNative.postMessage('newRegistration', {});
                                    }
                                }).catch(function() {});
                            }
                        }
                        return response;
                    });
                };
            })();
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        userContent.addUserScript(bridgeScript)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic

        // If we have a token, inject it as a cookie
        if let token = AuthService.shared.getToken() {
            let cookie = HTTPCookie(properties: [
                .name: "session",
                .value: token,
                .domain: ".trustassembly.org",
                .path: "/",
                .secure: "TRUE",
            ])
            if let cookie = cookie {
                webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie)
            }
        }

        // Load the URL
        webView.load(URLRequest(url: url))

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // The web view manages its own state; we don't need to update it
    }

    // MARK: - Coordinator (handles messages from web app)

    class Coordinator: NSObject, WKScriptMessageHandler {
        let appState: AppState

        init(appState: AppState) {
            self.appState = appState
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String,
                  let data = body["data"] as? [String: Any] else { return }

            switch type {
            case "authToken":
                if let token = data["token"] as? String {
                    AuthService.shared.saveToken(token)
                    let username = data["username"] as? String
                    let displayName = data["displayName"] as? String
                    let email = data["email"] as? String
                    DispatchQueue.main.async {
                        self.appState.setAuthenticated(
                            username: username,
                            displayName: displayName,
                            email: email
                        )
                    }
                    // Re-register device token if we have one
                    if appState.deviceToken != nil {
                        Task { await PushService.shared.registerDeviceToken(Data()) }
                    }
                }

            case "logout":
                Task { await PushService.shared.unregisterDevice() }
                DispatchQueue.main.async {
                    self.appState.clearAuth()
                }

            case "newRegistration":
                // After tutorial completes, show mode selection
                DispatchQueue.main.async {
                    self.appState.needsModeSelection = true
                }

            default:
                print("[TrustAssembly] Unknown bridge message: \(type)")
            }
        }
    }
}
