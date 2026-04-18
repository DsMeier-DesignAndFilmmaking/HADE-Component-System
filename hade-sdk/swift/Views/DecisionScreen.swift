import SwiftUI

public struct DecisionScreen: View {
    @StateObject private var viewModel: HadeViewModel
    private let onGo: (HadeDecisionViewData?) -> Void

    public init(
        viewModel: @autoclosure @escaping () -> HadeViewModel,
        onGo: @escaping (HadeDecisionViewData?) -> Void = { _ in }
    ) {
        self._viewModel = StateObject(wrappedValue: viewModel())
        self.onGo = onGo
    }

    public var body: some View {
        GeometryReader { proxy in
            VStack(spacing: 0) {
                Spacer(minLength: max(18, proxy.size.height * 0.06))

                DecisionCard(state: viewModel.state)

                Spacer(minLength: max(16, proxy.size.height * 0.04))

                ReasoningList(reasoning: viewModel.displayedReasoning)
                    .frame(maxHeight: proxy.size.height * 0.22, alignment: .top)

                Spacer(minLength: max(18, proxy.size.height * 0.05))

                PrimaryCTA {
                    onGo(viewModel.state.decision)
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
            .background(
                LinearGradient(
                    colors: [Color(red: 0.97, green: 0.95, blue: 0.91), .white],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
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
        .ignoresSafeArea(edges: .bottom)
        .sheet(isPresented: $viewModel.isRefineSheetPresented) {
            RefineSheet(
                isPresented: $viewModel.isRefineSheetPresented,
                options: viewModel.availableRefinements,
                onSelect: viewModel.refine(with:)
            )
        }
        .task {
            viewModel.loadIfNeeded()
        }
    }
}
