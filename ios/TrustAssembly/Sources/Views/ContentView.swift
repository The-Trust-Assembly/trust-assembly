import SwiftUI

/// Main content view with mode-dependent tab bar.
/// Follower: Feed, Explore, Assemblies, Profile
/// Contributor: Feed, Submit, Review, Vaults, Profile
struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab = "feed"

    private let baseURL = "https://trustassembly.org"

    var body: some View {
        ZStack {
            if appState.needsModeSelection && appState.isAuthenticated {
                ModeSelectionView()
            } else {
                tabView
            }
        }
    }

    @ViewBuilder
    private var tabView: some View {
        TabView(selection: $selectedTab) {
            // ── Feed (both modes) ──
            TrustWebView(url: URL(string: "\(baseURL)/#feed")!)
                .tabItem {
                    Label("Feed", systemImage: "house.fill")
                }
                .tag("feed")

            if appState.userMode == .contributor {
                // ── Submit (contributor only) ──
                TrustWebView(url: URL(string: "\(baseURL)/#submit")!)
                    .tabItem {
                        Label("Submit", systemImage: "plus.circle.fill")
                    }
                    .tag("submit")

                // ── Review (contributor only) ──
                TrustWebView(url: URL(string: "\(baseURL)/#review")!)
                    .tabItem {
                        Label("Review", systemImage: "scale.3d")
                    }
                    .tag("review")

                // ── Vaults (contributor only) ──
                TrustWebView(url: URL(string: "\(baseURL)/#vault")!)
                    .tabItem {
                        Label("Vaults", systemImage: "archivebox.fill")
                    }
                    .tag("vault")
            } else {
                // ── Explore (follower only) ──
                TrustWebView(url: URL(string: "\(baseURL)/#consensus")!)
                    .tabItem {
                        Label("Explore", systemImage: "safari.fill")
                    }
                    .tag("explore")

                // ── Assemblies (follower only) ──
                TrustWebView(url: URL(string: "\(baseURL)/#orgs")!)
                    .tabItem {
                        Label("Assemblies", systemImage: "person.3.fill")
                    }
                    .tag("assemblies")
            }

            // ── Profile (both modes) ──
            TrustWebView(url: URL(string: "\(baseURL)/#profile")!)
                .tabItem {
                    Label("Profile", systemImage: "person.crop.circle.fill")
                }
                .tag("profile")
        }
        .tint(Color(red: 0.72, green: 0.59, blue: 0.24)) // Gold accent
    }
}
