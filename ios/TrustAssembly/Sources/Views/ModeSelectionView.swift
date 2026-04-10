import SwiftUI

/// Presented after account creation. Asks users how they plan to use Trust Assembly.
/// - Followers: browse corrections, follow assemblies, use the extension
/// - Contributors: submit corrections, serve on juries, manage vaults
struct ModeSelectionView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedMode: UserMode?

    private let gold = Color(red: 0.72, green: 0.59, blue: 0.24) // #B8963E
    private let navy = Color(red: 0.11, green: 0.16, blue: 0.29) // #1B2A4A
    private let vellum = Color(red: 0.99, green: 0.98, blue: 0.96) // #FDFBF5

    var body: some View {
        ZStack {
            vellum.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    // Lighthouse icon
                    Image("lighthouse-gold")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 72, height: 72)
                        .clipShape(Circle())
                        .padding(.top, 40)

                    Text("How would you like to\nuse Trust Assembly?")
                        .font(.custom("Georgia", size: 24))
                        .fontWeight(.bold)
                        .foregroundColor(navy)
                        .multilineTextAlignment(.center)

                    Text("You can always change this later in your profile settings.")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)

                    // Option cards
                    VStack(spacing: 12) {
                        ModeCard(
                            title: "Stay Informed",
                            subtitle: "I want to see corrections on the content I read",
                            description: "Browse verified corrections from the community. Follow assemblies whose judgment you trust. The browser extension overlays corrections as you browse.",
                            features: [
                                "See corrections on news, social media, and more",
                                "Follow assemblies to curate your trust network",
                                "Get notified when consensus is reached",
                            ],
                            icon: "eye.fill",
                            isSelected: selectedMode == .follower,
                            color: gold
                        ) {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                selectedMode = .follower
                            }
                        }

                        ModeCard(
                            title: "Hold the Line",
                            subtitle: "I want to submit corrections and review others",
                            description: "Submit corrections to misleading content. Serve on juries to review others' work. Build your reputation through accuracy and honesty.",
                            features: [
                                "Everything above, plus:",
                                "Submit corrections and affirmations",
                                "Serve on juries and earn Trust Score",
                                "Build and maintain assembly vaults",
                            ],
                            icon: "shield.fill",
                            isSelected: selectedMode == .contributor,
                            color: navy
                        ) {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                selectedMode = .contributor
                            }
                        }
                    }
                    .padding(.horizontal, 20)

                    // Continue button
                    Button {
                        if let mode = selectedMode {
                            appState.setMode(mode)
                            // Request push notifications after mode selection
                            Task {
                                await PushService.shared.requestPermission()
                            }
                        }
                    } label: {
                        Text("Continue")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(selectedMode != nil ? gold : Color.gray.opacity(0.4))
                            .cornerRadius(8)
                    }
                    .disabled(selectedMode == nil)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                }
            }
        }
    }
}

// MARK: - Mode Option Card

private struct ModeCard: View {
    let title: String
    let subtitle: String
    let description: String
    let features: [String]
    let icon: String
    let isSelected: Bool
    let color: Color
    let action: () -> Void

    private let gold = Color(red: 0.72, green: 0.59, blue: 0.24)
    private let border = Color(red: 0.86, green: 0.85, blue: 0.82) // #DCD8D0

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: icon)
                        .font(.system(size: 20))
                        .foregroundColor(isSelected ? .white : color)
                        .frame(width: 36, height: 36)
                        .background(isSelected ? color : color.opacity(0.1))
                        .cornerRadius(8)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(Color(red: 0.17, green: 0.17, blue: 0.17))
                        Text(subtitle)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 24))
                            .foregroundColor(gold)
                    }
                }

                Text(description)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .lineSpacing(3)

                VStack(alignment: .leading, spacing: 4) {
                    ForEach(features, id: \.self) { feature in
                        HStack(alignment: .top, spacing: 6) {
                            Text("·")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(gold)
                            Text(feature)
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .padding(.top, 4)
            }
            .padding(16)
            .background(Color.white)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? gold : border, lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}
