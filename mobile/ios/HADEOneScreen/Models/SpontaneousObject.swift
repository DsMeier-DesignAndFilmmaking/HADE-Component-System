import Foundation

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

    static func fromGooglePlace(
        id: String,
        name: String,
        lat: Double,
        lng: Double,
        placeId: String? = nil,
        vibeTag: String? = nil
    ) -> SpontaneousObject {
        let now = Date().timeIntervalSince1970
        return SpontaneousObject(
            id: id,
            type: .placeOpportunity,
            title: name,
            timeWindow: SpontaneousTimeWindow(start: now, end: now + 7200),
            location: SpontaneousLocation(lat: lat, lng: lng, placeId: placeId),
            radius: 500,
            goingCount: 0,
            maybeCount: 0,
            userState: nil,
            createdAt: now,
            expiresAt: now + 7200,
            trustScore: 0.5,
            vibeTag: vibeTag,
            source: "google_places"
        )
    }

    static func fromUGC(
        id: String,
        title: String,
        lat: Double,
        lng: Double,
        placeId: String? = nil,
        timeWindowStart: Double? = nil,
        timeWindowEnd: Double? = nil,
        radius: Double = 300,
        goingCount: Int = 0,
        maybeCount: Int = 0,
        userState: SpontaneousUserState? = nil,
        createdAt: Double? = nil,
        expiresAt: Double? = nil,
        trustScore: Double = 0.5,
        vibeTag: String? = nil,
        source: String? = nil
    ) -> SpontaneousObject {
        let now = Date().timeIntervalSince1970
        return SpontaneousObject(
            id: id,
            type: .ugcEvent,
            title: title,
            timeWindow: SpontaneousTimeWindow(
                start: timeWindowStart ?? now,
                end: timeWindowEnd ?? now + 7200
            ),
            location: SpontaneousLocation(lat: lat, lng: lng, placeId: placeId),
            radius: radius,
            goingCount: goingCount,
            maybeCount: maybeCount,
            userState: userState,
            createdAt: createdAt ?? now,
            expiresAt: expiresAt ?? now + 7200,
            trustScore: trustScore,
            vibeTag: vibeTag,
            source: source
        )
    }

    func updateParticipation(_ newState: SpontaneousUserState?) -> SpontaneousObject {
        if userState == newState { return self }

        var nextGoingCount = goingCount
        var nextMaybeCount = maybeCount

        if userState == .going {
            nextGoingCount = max(0, nextGoingCount - 1)
        }
        if userState == .maybe {
            nextMaybeCount = max(0, nextMaybeCount - 1)
        }

        if newState == .going {
            nextGoingCount += 1
        }
        if newState == .maybe {
            nextMaybeCount += 1
        }

        return SpontaneousObject(
            id: id,
            type: type,
            title: title,
            timeWindow: timeWindow,
            location: location,
            radius: radius,
            goingCount: nextGoingCount,
            maybeCount: nextMaybeCount,
            userState: newState,
            createdAt: createdAt,
            expiresAt: expiresAt,
            trustScore: trustScore,
            vibeTag: vibeTag,
            source: source
        )
    }

    func generateExplanation() -> String {
        let now = Date().timeIntervalSince1970
        let start = normalizedSeconds(timeWindow.start)
        let minutesUntilStart = max(0, Int(ceil((start - now) / 60)))
        let timeCopy = start <= now ? "happening now" : "starting in \(minutesUntilStart) min"
        let participationCopy = goingCount == 1 ? "1 person is going" : "\(goingCount) people are going"

        return "This is \(timeCopy), and \(participationCopy)."
    }

    private func normalizedSeconds(_ timestamp: Double) -> Double {
        timestamp > 10_000_000_000 ? timestamp / 1000 : timestamp
    }
}
