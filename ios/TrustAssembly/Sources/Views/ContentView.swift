import SwiftUI

/// Main content view with three states:
/// 1. Anonymous: Browse consensus corrections without an account
/// 2. Follower: Feed, Explore, Assemblies, Profile
/// 3. Contributor: Feed, Submit, Review, Vaults, Profile
struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ZStack {
            if appState.isRestoringSession {
                ProgressView("Restoring session…")
            } else if appState.needsModeSelection && appState.isAuthenticated {
                ModeSelectionView()
            } else if !appState.isAuthenticated {
                anonymousView
            } else {
                authenticatedTabView
            }
        }
    }

    // MARK: - Anonymous browsing (consensus content only)

    @ViewBuilder
    private var anonymousView: some View {
        NavigationStack {
            // The current web application presents its public discovery and
            // sign-in experience at the root route. Deep links can replace
            // this URL with a public record/citizen route.
            TrustWebView(url: appState.anonymousURL())
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        HStack(spacing: 6) {
                            Image(systemName: "light.beacon.max.fill")
                                .font(.system(size: 19))
                            Text("TRUST ASSEMBLY")
                                .font(.system(size: 13, weight: .bold))
                                .tracking(1.5)
                                .foregroundColor(Color(red: 0.72, green: 0.59, blue: 0.24))
                        }
                    }
                }
                .toolbarBackground(.visible, for: .navigationBar)
                .toolbarBackground(Color(red: 0.99, green: 0.98, blue: 0.96), for: .navigationBar)
        }
    }

    // MARK: - Authenticated tab bar (mode-dependent)

    @ViewBuilder
    private var authenticatedTabView: some View {
        TabView(selection: $appState.selectedTab) {
            // ── Feed (both modes) ──
            TrustWebView(url: appState.url(forTab: "feed", defaultPath: "feed"))
                .tabItem {
                    Label("Feed", systemImage: "house.fill")
                }
                .tag("feed")

            if appState.userMode == .contributor {
                // ── Submit (contributor only) ──
                TrustWebView(url: appState.url(forTab: "submit", defaultPath: "submit"))
                    .tabItem {
                        Label("Submit", systemImage: "plus.circle.fill")
                    }
                    .tag("submit")

                // ── Review (contributor only) ──
                TrustWebView(url: appState.url(forTab: "review", defaultPath: "review"))
                    .tabItem {
                        Label("Review", systemImage: "scale.3d")
                    }
                    .tag("review")

                // ── Vaults (contributor only) ──
                TrustWebView(url: appState.url(forTab: "vault", defaultPath: "vault"))
                    .tabItem {
                        Label("Vaults", systemImage: "archivebox.fill")
                    }
                    .tag("vault")
            } else {
                // ── Explore (follower only) ──
                TrustWebView(url: appState.url(forTab: "explore", defaultPath: "consensus"))
                    .tabItem {
                        Label("Explore", systemImage: "safari.fill")
                    }
                    .tag("explore")

                // ── Assemblies (follower only) ──
                TrustWebView(url: appState.url(forTab: "assemblies", defaultPath: "orgs"))
                    .tabItem {
                        Label("Assemblies", systemImage: "person.3.fill")
                    }
                    .tag("assemblies")
            }

            // ── Profile (both modes) ──
            TrustWebView(url: appState.url(forTab: "profile", defaultPath: "profile"))
                .tabItem {
                    Label("Profile", systemImage: "person.crop.circle.fill")
                }
                .tag("profile")
        }
        .tint(Color(red: 0.72, green: 0.59, blue: 0.24)) // Gold accent
    }
}
