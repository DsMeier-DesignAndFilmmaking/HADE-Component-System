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
