import SwiftUI

struct DecisionView: View {
    @StateObject private var viewModel = HadeViewModel()
    @State private var rejectionCount = 0
    @State private var isCreationFlowPresented = false

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                LinearGradient(
                    colors: [Color(red: 0.97, green: 0.95, blue: 0.91), .white],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                VStack(spacing: 0) {
                    Spacer(minLength: max(18, proxy.size.height * 0.05))

                    if let decision = viewModel.state.decision {
                        DecisionCard(
                            object: object(from: decision),
                            distanceText: decision.distanceText,
                            isUpdating: viewModel.state.status == .updating,
                            onGoing: viewModel.go,
                            onMaybe: {},
                            onNotThis: handleNotThis
                        )
                            .transition(.opacity.combined(with: .move(edge: .trailing)))
                    } else {
                        loadingCard
                    }

                    Spacer(minLength: max(18, proxy.size.height * 0.04))

                    ReasoningList(reasoning: reasoningToDisplay)
                        .frame(maxHeight: proxy.size.height * 0.22, alignment: .top)

                    Spacer(minLength: max(18, proxy.size.height * 0.05))

                    PrimaryCTAButton(action: viewModel.go)

                    if rejectionCount >= 2 {
                        Button("Add Spontaneous Note") {
                            isCreationFlowPresented = true
                        }
                        .buttonStyle(.borderedProminent)
                        .padding(.top, 12)
                    }

                    HStack {
                        Button("Refine") {
                            viewModel.isRefineSheetPresented = true
                        }
                        .buttonStyle(.plain)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.black.opacity(0.62))

                        Spacer()

                        Text("Swipe left for next")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 14)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .frame(width: proxy.size.width, height: proxy.size.height, alignment: .top)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 28)
                        .onEnded { value in
                            if value.translation.width < -50 {
                                viewModel.regenerate()
                            }
                        }
                )
            }
        }
        .sheet(isPresented: $viewModel.isRefineSheetPresented) {
            RefineBottomSheet(isPresented: $viewModel.isRefineSheetPresented, onSelect: viewModel.refine)
        }
        .sheet(isPresented: $isCreationFlowPresented) {
            ActivityCreationView()
        }
        .task {
            viewModel.start()
        }
        .onDisappear {
            viewModel.stop()
        }
    }

    private var reasoningToDisplay: [String] {
        if viewModel.state.reasoning.isEmpty {
            return ["Understanding your context..."]
        }
        return Array(viewModel.state.reasoning.prefix(3))
    }

    private func handleNotThis() {
        rejectionCount += 1
        viewModel.regenerate()
    }

    private func object(from decision: Decision) -> SpontaneousObject {
        let now = Date().timeIntervalSince1970
        let coord = viewModel.currentCoordinate
        return SpontaneousObject.fromUGC(
            id: decision.id,
            title: decision.title,
            lat: coord?.latitude ?? 39.7392,
            lng: coord?.longitude ?? -104.9903,
            timeWindowStart: now,
            timeWindowEnd: now + 3600
        )
    }

    private var loadingCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Understanding your context...")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .lineLimit(2)

            Text("We are preparing one decision for this moment.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.82))

            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 999)
                    .fill(.white.opacity(0.18))
                    .frame(width: 82, height: 34)
                RoundedRectangle(cornerRadius: 999)
                    .fill(.white.opacity(0.18))
                    .frame(width: 74, height: 34)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: 228)
        .background(
            LinearGradient(
                colors: [Color(red: 0.41, green: 0.47, blue: 0.55), Color(red: 0.22, green: 0.25, blue: 0.33)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 28, style: .continuous)
        )
        .redacted(reason: .placeholder)
    }
}
