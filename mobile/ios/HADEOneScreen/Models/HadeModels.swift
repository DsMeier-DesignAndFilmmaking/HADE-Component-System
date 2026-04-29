import CoreLocation
import Foundation

struct Decision: Equatable, Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let distanceText: String
    let etaText: String
    let deepLink: URL?
}

enum HadeStatus: String {
    case loading
    case ready
    case updating
}

struct HadeState: Equatable {
    var status: HadeStatus = .loading
    var decision: Decision?
    var reasoning: [String] = []

    static let loading = HadeState(status: .loading, decision: nil, reasoning: [])
}

struct HadeContextSnapshot {
    let coordinate: CLLocationCoordinate2D?
    let motionState: MotionState
    let timeContext: TimeContext
    let capturedAt: Date

    var fingerprint: String {
        let lat = coordinate.map { String(format: "%.3f", $0.latitude) } ?? "none"
        let lng = coordinate.map { String(format: "%.3f", $0.longitude) } ?? "none"
        return [lat, lng, motionState.rawValue, timeContext.dayPart.rawValue, timeContext.dayType.rawValue].joined(separator: "|")
    }
}

struct TimeContext: Equatable {
    enum DayPart: String {
        case morning
        case midday
        case afternoon
        case earlyEvening
        case evening
        case lateNight
    }

    enum DayType: String {
        case weekday
        case weekdayEvening
        case weekend
        case weekendPrime
    }

    let dayPart: DayPart
    let dayType: DayType
}

enum MotionState: String {
    case still
    case walking
    case driving
}

struct HadeHeadlessResponse: Equatable {
    let decision: Decision?
    let reasoning: [String]
    let status: HadeStatus
}

struct RefineRequest: Equatable {
    let tone: RefineTone

    enum RefineTone: String, CaseIterable, Identifiable {
        case closer = "Closer"
        case quieter = "Quieter"
        case faster = "Faster"

        var id: String { rawValue }
    }
}

// ─── SpontaneousObject ────────────────────────────────────────────────────────

enum SpontaneousObjectType: String, Codable {
    case ugcEvent = "ugc_event"
    case placeOpportunity = "place_opportunity"
}

enum SpontaneousUserState: String, Codable {
    case going = "going"
    case maybe = "maybe"
}

struct SpontaneousTimeWindow: Codable, Equatable {
    let start: Double
    let end: Double
}

struct SpontaneousLocation: Codable, Equatable {
    let lat: Double
    let lng: Double
    let placeId: String?

    enum CodingKeys: String, CodingKey {
        case lat, lng
        case placeId = "place_id"
    }
}

struct SpontaneousObject: Codable, Identifiable, Equatable {
    let id: String
    let type: SpontaneousObjectType
    let title: String
    let timeWindow: SpontaneousTimeWindow
    let location: SpontaneousLocation
    let radius: Double
    let goingCount: Int
    let maybeCount: Int
    let userState: SpontaneousUserState?
    let createdAt: Double
    let expiresAt: Double
    let trustScore: Double
    let vibeTag: String?
    let source: String?

    enum CodingKeys: String, CodingKey {
        case id, type, title, radius, source
        case timeWindow = "time_window"
        case location
        case goingCount = "going_count"
        case maybeCount = "maybe_count"
        case userState = "user_state"
        case createdAt = "created_at"
        case expiresAt = "expires_at"
        case trustScore = "trust_score"
        case vibeTag = "vibe_tag"
    }

    func updateParticipation(to newState: SpontaneousUserState?) -> SpontaneousObject {
        guard userState != newState else { return self }

        var going = goingCount
        var maybe = maybeCount

        if userState == .going { going = max(0, going - 1) }
        if userState == .maybe { maybe = max(0, maybe - 1) }

        if newState == .going { going += 1 }
        if newState == .maybe { maybe += 1 }

        return SpontaneousObject(
            id: id, type: type, title: title,
            timeWindow: timeWindow, location: location, radius: radius,
            goingCount: going, maybeCount: maybe, userState: newState,
            createdAt: createdAt, expiresAt: expiresAt,
            trustScore: trustScore, vibeTag: vibeTag, source: source
        )
    }

    func generateExplanation() -> String {
        let now = Date().timeIntervalSince1970
        let minutesUntilStart = max(0, Int(ceil((normalizedSeconds(timeWindow.start) - now) / 60)))
        let timeCopy = normalizedSeconds(timeWindow.start) <= now ? "happening now" : "starting in \(minutesUntilStart) min"
        let participationCopy = goingCount == 1 ? "1 person is going" : "\(goingCount) people are going"
        return "This is \(timeCopy), and \(participationCopy)."
    }

    private func normalizedSeconds(_ t: Double) -> Double {
        t > 10_000_000_000 ? t / 1000 : t
    }
}
