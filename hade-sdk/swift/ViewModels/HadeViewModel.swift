import Foundation

@MainActor
public final class HadeViewModel: ObservableObject {
    @Published public private(set) var state: HadeViewState
    @Published public var isRefineSheetPresented = false

    private let sdk: HadeSDK
    private let refineOptions: [HadeRefineOption]

    public init(
        sdk: HadeSDK,
        initialState: HadeViewState = .loading,
        refineOptions: [HadeRefineOption] = HadeRefineOption.default
    ) {
        self.sdk = sdk
        self.state = initialState
        self.refineOptions = refineOptions
    }

    public var displayedReasoning: [String] {
        if state.reasoning.isEmpty {
            return ["Understanding your context..."]
        }

        return Array(state.reasoning.prefix(3))
    }

    public var availableRefinements: [HadeRefineOption] {
        refineOptions
    }

    public func loadIfNeeded() {
        guard state.decision == nil else { return }
        Task { await loadDecision() }
    }

    public func loadDecision() async {
        state = HadeViewState(status: .loading, decision: state.decision, reasoning: state.reasoning, confidence: state.confidence)

        do {
            let response = try await sdk.getDecision()
            apply(response)
        } catch {
            state = HadeViewState.loading
        }
    }

    public func regenerate() {
        Task {
            state = HadeViewState(status: .loading, decision: state.decision, reasoning: state.reasoning, confidence: state.confidence)
            do {
                let response = try await sdk.regenerate()
                apply(response)
            } catch {
                state = HadeViewState.loading
            }
        }
    }

    public func refine(with option: HadeRefineOption) {
        isRefineSheetPresented = false

        Task {
            state = HadeViewState(status: .loading, decision: state.decision, reasoning: state.reasoning, confidence: state.confidence)
            do {
                let response = try await sdk.refine(tone: option.tone)
                apply(response)
            } catch {
                state = HadeViewState.loading
            }
        }
    }

    private func apply(_ response: HadeDecisionResponse) {
        state = HadeViewState(
            status: response.status == "ready" ? .ready : .loading,
            decision: response.decision.map {
                HadeDecisionViewData(
                    title: $0.title,
                    distance: $0.distance,
                    eta: $0.eta
                )
            },
            reasoning: Array(response.reasoning.prefix(3)),
            confidence: response.confidence
        )
    }
}
