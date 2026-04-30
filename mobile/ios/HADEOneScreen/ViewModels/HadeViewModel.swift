import CoreLocation
import Foundation
#if canImport(UIKit)
import UIKit
#endif

@MainActor
final class HadeViewModel: ObservableObject {
    @Published private(set) var state: HadeState = .loading
    @Published var isRefineSheetPresented = false

    private let client: HadeHeadlessClientProtocol
    private let locationManager: LocationManaging
    private let motionManager: MotionManaging
    private let timeProvider: TimeContextProviding

    private var latestCoordinate: CLLocationCoordinate2D?

    /// The most recently received device coordinate. Nil until location permission is granted.
    var currentCoordinate: CLLocationCoordinate2D? { latestCoordinate }
    private var latestMotion: MotionState = .still
    private var latestFingerprint: String?
    private var lastContextRefresh = Date.distantPast
    private var hasRequestedInitialDecision = false

    init(
        client: HadeHeadlessClientProtocol = HadeHeadlessClient(),
        locationManager: LocationManaging = LocationManager(),
        motionManager: MotionManaging = MotionManager(),
        timeProvider: TimeContextProviding = TimeContextProvider()
    ) {
        self.client = client
        self.locationManager = locationManager
        self.motionManager = motionManager
        self.timeProvider = timeProvider

        bindContext()
    }

    func start() {
        locationManager.start()
        motionManager.start()

        Task {
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            if !hasRequestedInitialDecision {
                await requestInitialDecision(forceFallbackContext: true)
            }
        }
    }

    func stop() {
        locationManager.stop()
        motionManager.stop()
    }

    func go() {
        guard let destination = state.decision?.deepLink else { return }
        #if canImport(UIKit)
        UIApplication.shared.open(destination)
        #endif
    }

    func regenerate() {
        Task { await softRefresh(trigger: .manualRefresh) }
    }

    func refine(_ request: RefineRequest) {
        isRefineSheetPresented = false
        Task {
            let context = currentContextSnapshot(forceFallbackLocation: true)
            guard let context else { return }
            state.status = .updating
            do {
                let response = try await client.refine(request, context: context)
                apply(response)
                latestFingerprint = context.fingerprint
            } catch {
                state.status = state.decision == nil ? .loading : .ready
            }
        }
    }

    private func bindContext() {
        locationManager.onLocationChange = { [weak self] coordinate in
            guard let self else { return }
            latestCoordinate = coordinate
            Task { await self.requestInitialDecision(forceFallbackContext: false) }
            Task { await self.evaluatePassiveRefresh(reason: .locationChanged) }
        }

        motionManager.onMotionChange = { [weak self] motion in
            guard let self else { return }
            latestMotion = motion
            Task { await self.requestInitialDecision(forceFallbackContext: false) }
            Task { await self.evaluatePassiveRefresh(reason: .motionChanged) }
        }
    }

    private func requestInitialDecision(forceFallbackContext: Bool) async {
        guard !hasRequestedInitialDecision else { return }
        guard let context = currentContextSnapshot(forceFallbackLocation: forceFallbackContext) else { return }

        hasRequestedInitialDecision = true
        state.status = .loading

        do {
            let response = try await client.initialDecision(context: context)
            apply(response)
            latestFingerprint = context.fingerprint
            lastContextRefresh = Date()
        } catch {
            hasRequestedInitialDecision = false
        }
    }

    private func evaluatePassiveRefresh(reason: RefreshReason) async {
        guard state.decision != nil else { return }
        guard let context = currentContextSnapshot(forceFallbackLocation: false) else { return }
        guard shouldRefresh(from: latestFingerprint, to: context.fingerprint, reason: reason) else { return }
        await softRefresh(trigger: .passiveContext(context))
    }

    private func softRefresh(trigger: RefreshTrigger) async {
        let context: HadeContextSnapshot?
        switch trigger {
        case .manualRefresh:
            context = currentContextSnapshot(forceFallbackLocation: true)
        case .passiveContext(let snapshot):
            context = snapshot
        }

        guard let context else { return }
        state.status = .updating

        do {
            let response = try await client.regenerate(context: context)
            apply(response)
            latestFingerprint = context.fingerprint
            lastContextRefresh = Date()
        } catch {
            state.status = .ready
        }
    }

    private func currentContextSnapshot(forceFallbackLocation: Bool) -> HadeContextSnapshot? {
        let coordinate = latestCoordinate ?? (forceFallbackLocation ? CLLocationCoordinate2D(latitude: 39.7392, longitude: -104.9903) : nil)
        return HadeContextSnapshot(
            coordinate: coordinate,
            motionState: latestMotion,
            timeContext: timeProvider.current(),
            capturedAt: Date()
        )
    }

    private func shouldRefresh(from previous: String?, to next: String, reason: RefreshReason) -> Bool {
        guard previous != next else { return false }
        guard Date().timeIntervalSince(lastContextRefresh) > 20 else { return false }

        switch reason {
        case .motionChanged:
            return true
        case .locationChanged:
            return true
        }
    }

    private func apply(_ response: HadeHeadlessResponse) {
        state = HadeState(
            status: response.status,
            decision: response.decision,
            reasoning: Array(response.reasoning.prefix(3))
        )
    }
}

private enum RefreshReason {
    case locationChanged
    case motionChanged
}

private enum RefreshTrigger {
    case manualRefresh
    case passiveContext(HadeContextSnapshot)
}
