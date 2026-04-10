import SwiftUI

/// Main content view with three states:
/// 1. Anonymous: Browse consensus corrections without an account
/// 2. Follower: Feed, Explore, Assemblies, Profile
/// 3. Contributor: Feed, Submit, Review, Vaults, Profile
struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab = "feed"

    private let baseURL = "https://trustassembly.org"

    var body: some View {
        ZStack {
            if appState.needsModeSelection && appState.isAuthenticated {
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
            TrustWebView(url: URL(string: "\(baseURL)/#consensus")!)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        HStack(spacing: 6) {
                            Image("lighthouse-gold")
                                .resizable()
                                .scaledToFit()
                                .frame(width: 22, height: 22)
                                .clipShape(Circle())
                            Text("TRUST ASSEMBLY")
                                .font(.system(size: 13, weight: .bold))
                                .tracking(1.5)
                                .foregroundColor(Color(red: 0.72, green: 0.59, blue: 0.24))
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            // Navigate to login/register in the web view
                            // The WKWebView bridge handles auth events
                            selectedTab = "feed"
                        } label: {
                            Text("Sign In")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 6)
                                .background(Color(red: 0.72, green: 0.59, blue: 0.24))
                                .cornerRadius(6)
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
