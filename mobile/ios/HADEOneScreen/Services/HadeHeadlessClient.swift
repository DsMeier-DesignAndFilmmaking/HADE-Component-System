import Foundation

protocol HadeHeadlessClientProtocol {
    func initialDecision(context: HadeContextSnapshot) async throws -> HadeHeadlessResponse
    func regenerate(context: HadeContextSnapshot) async throws -> HadeHeadlessResponse
    func refine(_ request: RefineRequest, context: HadeContextSnapshot) async throws -> HadeHeadlessResponse
}

actor HadeHeadlessClient: HadeHeadlessClientProtocol {
    private var cursor = 0

    func initialDecision(context: HadeContextSnapshot) async throws -> HadeHeadlessResponse {
        try await fetch(mode: .initial, refineRequest: nil, context: context)
    }

    func regenerate(context: HadeContextSnapshot) async throws -> HadeHeadlessResponse {
        try await fetch(mode: .regenerate, refineRequest: nil, context: context)
    }

    func refine(_ request: RefineRequest, context: HadeContextSnapshot) async throws -> HadeHeadlessResponse {
        try await fetch(mode: .refine, refineRequest: request, context: context)
    }

    private enum Mode {
        case initial
        case regenerate
        case refine
    }

    private func fetch(mode: Mode, refineRequest: RefineRequest?, context: HadeContextSnapshot) async throws -> HadeHeadlessResponse {
        try await Task.sleep(nanoseconds: 500_000_000)

        let templates = DecisionTemplate.defaultTemplates
        let template = templates[cursor % templates.count]
        cursor += mode == .initial ? 0 : 1

        let decision = Decision(
            id: "decision-\(cursor)-\(context.fingerprint)",
            title: title(for: template, motion: context.motionState, refine: refineRequest),
            subtitle: subtitle(for: template, time: context.timeContext),
            distanceText: distance(for: context.motionState, refine: refineRequest),
            etaText: eta(for: context.motionState, refine: refineRequest),
            deepLink: URL(string: "maps://?q=\(template.mapQuery)")
        )

        let reasoning = reasoningLines(for: template, context: context, refine: refineRequest)
        return HadeHeadlessResponse(decision: decision, reasoning: Array(reasoning.prefix(3)), status: .ready)
    }

    private func title(for template: DecisionTemplate, motion: MotionState, refine: RefineRequest?) -> String {
        switch refine?.tone {
        case .closer:
            return "\(template.name) Nearby"
        case .quieter:
            return "Quiet Table at \(template.name)"
        case .faster:
            return "Fast Stop: \(template.name)"
        case nil:
            return motion == .driving ? "\(template.name)" : template.name
        }
    }

    private func subtitle(for template: DecisionTemplate, time: TimeContext) -> String {
        switch time.dayPart {
        case .morning, .midday:
            return "\(template.category) for the next hour"
        case .afternoon:
            return "\(template.category) that fits this pace"
        case .earlyEvening, .evening:
            return "\(template.category) that matches the moment"
        case .lateNight:
            return "\(template.category) that still feels easy"
        }
    }

    private func distance(for motion: MotionState, refine: RefineRequest?) -> String {
        if refine?.tone == .closer { return "0.4 mi" }
        switch motion {
        case .still: return "0.8 mi"
        case .walking: return "0.6 mi"
        case .driving: return "2.1 mi"
        }
    }

    private func eta(for motion: MotionState, refine: RefineRequest?) -> String {
        if refine?.tone == .faster { return "8 min" }
        switch motion {
        case .still: return "12 min"
        case .walking: return "10 min"
        case .driving: return "9 min"
        }
    }

    private func reasoningLines(for template: DecisionTemplate, context: HadeContextSnapshot, refine: RefineRequest?) -> [String] {
        var lines = [
            template.reason,
            contextLine(for: context),
            refineLine(for: refine)
        ].compactMap { $0 }

        if lines.isEmpty {
            lines = ["This option fits your current moment."]
        }
        return lines
    }

    private func contextLine(for context: HadeContextSnapshot) -> String {
        switch context.motionState {
        case .still:
            return "You seem settled, so this keeps the next move simple."
        case .walking:
            return "Your movement suggests something close is the better call."
        case .driving:
            return "You are already in motion, so a slightly longer hop is acceptable."
        }
    }

    private func refineLine(for refine: RefineRequest?) -> String? {
        switch refine?.tone {
        case .closer:
            return "Adjusted for a shorter trip."
        case .quieter:
            return "Adjusted for a calmer atmosphere."
        case .faster:
            return "Adjusted for the quickest payoff."
        case nil:
            return nil
        }
    }
}

private struct DecisionTemplate {
    let name: String
    let category: String
    let mapQuery: String
    let reason: String

    static let defaultTemplates: [DecisionTemplate] = [
        .init(name: "St. Mark's Coffeehouse", category: "Cafe", mapQuery: "St. Mark's Coffeehouse Denver", reason: "It is reliable right now without asking for extra effort."),
        .init(name: "Cart-Driver", category: "Pizza", mapQuery: "Cart-Driver Denver", reason: "It gives you a strong answer fast instead of another round of choices."),
        .init(name: "Hudson Hill", category: "All-day spot", mapQuery: "Hudson Hill Denver", reason: "It balances ease, quality, and timing better than a broad search.")
    ]
}
