import Foundation

public enum HadeViewStatus: String {
    case loading
    case ready
}

public struct HadeDecisionViewData: Equatable {
    public let title: String
    public let distance: String
    public let eta: String?

    public init(title: String, distance: String, eta: String?) {
        self.title = title
        self.distance = distance
        self.eta = eta
    }
}

public struct HadeViewState: Equatable {
    public var status: HadeViewStatus
    public var decision: HadeDecisionViewData?
    public var reasoning: [String]
    public var confidence: Double

    public init(
        status: HadeViewStatus = .loading,
        decision: HadeDecisionViewData? = nil,
        reasoning: [String] = [],
        confidence: Double = 0
    ) {
        self.status = status
        self.decision = decision
        self.reasoning = Array(reasoning.prefix(3))
        self.confidence = confidence
    }

    public static let loading = HadeViewState(
        status: .loading,
        decision: nil,
        reasoning: [],
        confidence: 0
    )
}

public struct HadeRefineOption: Equatable, Hashable, Identifiable {
    public let id: String
    public let tone: String
    public let title: String

    public init(id: String, tone: String, title: String) {
        self.id = id
        self.tone = tone
        self.title = title
    }

    public static let `default`: [HadeRefineOption] = [
        HadeRefineOption(id: "closer", tone: "closer", title: "Closer"),
        HadeRefineOption(id: "faster", tone: "faster", title: "Faster"),
        HadeRefineOption(id: "quieter", tone: "quieter", title: "Quieter")
    ]
}
