import CoreLocation
import SwiftUI

struct ActivityCreationView: View {
    private enum Step: Int {
        case chips
        case time
        case confirm
    }

    private struct ActivityChip: Identifiable, Equatable {
        let id: String
        let title: String
        let vibeTag: String
    }

    private struct TimeOption: Identifiable, Equatable {
        let id: String
        let label: String
        let offsetMinutes: Int
        let durationMinutes: Int
    }

    private let chips: [ActivityChip] = [
        ActivityChip(id: "volleyball", title: "Play volleyball", vibeTag: "active"),
        ActivityChip(id: "sketch", title: "Sketch outside", vibeTag: "chill"),
        ActivityChip(id: "coffee_walk", title: "Grab coffee and walk", vibeTag: "social"),
        ActivityChip(id: "study", title: "Co-work nearby", vibeTag: "focused")
    ]

    private let timeOptions: [TimeOption] = [
        TimeOption(id: "now", label: "Now", offsetMinutes: 0, durationMinutes: 60),
        TimeOption(id: "soon", label: "In 30 min", offsetMinutes: 30, durationMinutes: 90),
        TimeOption(id: "later", label: "In 1 hour", offsetMinutes: 60, durationMinutes: 120)
    ]

    @StateObject private var locationProvider = ActivityCreationLocationProvider()
    @State private var step: Step = .chips
    @State private var selectedChip: ActivityChip?
    @State private var selectedTime: TimeOption?
    @State private var feed: [SpontaneousObject] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            header

            switch step {
            case .chips:
                chipStep
            case .time:
                timeStep
            case .confirm:
                confirmStep
            }

            if !feed.isEmpty {
                feedView
            }
        }
        .padding(20)
        .onAppear {
            locationProvider.requestCurrentLocation()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Create activity")
                .font(.title2.weight(.bold))
            Text("Step \(step.rawValue + 1) of 3")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }

    private var chipStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("What do you want to do?")
                .font(.headline)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 10)], spacing: 10) {
                ForEach(chips) { chip in
                    Button {
                        selectedChip = chip
                        step = .time
                    } label: {
                        Text(chip.title)
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private var timeStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("When should it start?")
                .font(.headline)

            ForEach(timeOptions) { option in
                Button {
                    selectedTime = option
                    step = .confirm
                } label: {
                    HStack {
                        Text(option.label)
                            .font(.subheadline.weight(.semibold))
                        Spacer()
                        Text("\(option.durationMinutes) min")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 8)
                }
                .buttonStyle(.bordered)
            }

            Button("Back") {
                step = .chips
            }
            .font(.subheadline.weight(.medium))
        }
    }

    private var confirmStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Confirm")
                .font(.headline)

            VStack(alignment: .leading, spacing: 8) {
                Text(selectedChip?.title ?? "Untitled activity")
                    .font(.title3.weight(.bold))
                Text(selectedTime?.label ?? "Now")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.black.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))

            HStack(spacing: 10) {
                Button("Back") {
                    step = .time
                }
                .buttonStyle(.bordered)

                Button("Create") {
                    createObject()
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    private var feedView: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Local feed")
                .font(.headline)

            ForEach(feed) { object in
                VStack(alignment: .leading, spacing: 4) {
                    Text(object.title)
                        .font(.subheadline.weight(.semibold))
                    Text("\(object.goingCount) people going")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.black.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private func createObject() {
        let chip = selectedChip ?? chips[0]
        let time = selectedTime ?? timeOptions[0]
        let now = Date().timeIntervalSince1970
        let start = now + Double(time.offsetMinutes * 60)
        let end = start + Double(time.durationMinutes * 60)
        let coordinate = locationProvider.coordinate ?? CLLocationCoordinate2D(latitude: 0, longitude: 0)

        let object = SpontaneousObject.fromUGC(
            id: UUID().uuidString,
            title: chip.title,
            lat: coordinate.latitude,
            lng: coordinate.longitude,
            timeWindowStart: start,
            timeWindowEnd: end,
            radius: 150,
            createdAt: now,
            expiresAt: end,
            trustScore: 0.7,
            vibeTag: chip.vibeTag,
            source: "user"
        )

        feed.insert(object, at: 0)
        selectedChip = nil
        selectedTime = nil
        step = .chips
    }
}

private final class ActivityCreationLocationProvider: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var coordinate: CLLocationCoordinate2D?

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func requestCurrentLocation() {
        manager.requestWhenInUseAuthorization()
        manager.requestLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        coordinate = locations.last?.coordinate
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        coordinate = coordinate ?? CLLocationCoordinate2D(latitude: 0, longitude: 0)
    }
}
