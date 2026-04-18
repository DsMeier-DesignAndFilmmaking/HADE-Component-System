import Foundation

protocol MotionManaging: AnyObject {
    var onMotionChange: ((MotionState) -> Void)? { get set }
    func start()
    func stop()
}

final class MotionManager: MotionManaging {
    var onMotionChange: ((MotionState) -> Void)?
    private var timer: Timer?
    private let sequence: [MotionState]
    private var index = 0

    init(sequence: [MotionState] = [.still, .walking, .still, .driving]) {
        self.sequence = sequence
    }

    func start() {
        guard timer == nil else { return }
        onMotionChange?(sequence[index])
        timer = Timer.scheduledTimer(withTimeInterval: 18, repeats: true) { [weak self] _ in
            guard let self else { return }
            index = (index + 1) % sequence.count
            onMotionChange?(sequence[index])
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    deinit {
        stop()
    }
}
