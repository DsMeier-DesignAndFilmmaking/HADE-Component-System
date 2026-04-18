import CoreLocation
import Foundation

protocol LocationManaging: AnyObject {
    var onLocationChange: ((CLLocationCoordinate2D?) -> Void)? { get set }
    func start()
    func stop()
}

final class LocationManager: NSObject, LocationManaging {
    var onLocationChange: ((CLLocationCoordinate2D?) -> Void)?

    private let manager = CLLocationManager()
    private let fallback = CLLocationCoordinate2D(latitude: 39.7392, longitude: -104.9903)

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 150
    }

    func start() {
        #if os(iOS)
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.startUpdatingLocation()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                self?.emitFallbackIfNeeded()
            }
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                self?.emitFallbackIfNeeded()
            }
        default:
            onLocationChange?(fallback)
        }
        #else
        manager.startUpdatingLocation()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.emitFallbackIfNeeded()
        }
        #endif
    }

    func stop() {
        manager.stopUpdatingLocation()
    }

    private func emitFallbackIfNeeded() {
        if manager.location == nil {
            onLocationChange?(fallback)
        }
    }
}

extension LocationManager: CLLocationManagerDelegate {
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        #if os(iOS)
        let isAuthorized = manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse
        #else
        let isAuthorized = manager.authorizationStatus == .authorizedAlways
        #endif

        if isAuthorized {
            manager.startUpdatingLocation()
        } else if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted {
            onLocationChange?(fallback)
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        onLocationChange?(locations.last?.coordinate)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        onLocationChange?(fallback)
    }
}
