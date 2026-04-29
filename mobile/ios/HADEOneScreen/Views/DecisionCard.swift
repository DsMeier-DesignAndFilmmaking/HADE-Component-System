import SwiftUI

struct DecisionCard: View {
    let object: SpontaneousObject
    /// Pre-computed distance string from the caller (e.g. "320m" or "0.3 mi").
    /// Omit when distance is unavailable — the pill is hidden rather than blank.
    let distanceText: String?
    let isUpdating: Bool
    var onGoing: () -> Void = {}
    var onMaybe: () -> Void = {}
    var onNotThis: () -> Void = {}

    @State private var isLivePulsing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {

            // ── Header ─────────────────────────────────────────────────────────
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 8) {

                    // "Your move" label + live dot
                    HStack(spacing: 6) {
                        Text("Your move")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .textCase(.uppercase)

                        if isLive {
                            Circle()
                                .fill(Color(red: 0.28, green: 0.95, blue: 0.60))
                                .frame(width: 6, height: 6)
                                .scaleEffect(isLivePulsing ? 1.55 : 1.0)
                                .opacity(isLivePulsing ? 0.45 : 1.0)
                                .animation(
                                    .easeInOut(duration: 1.0).repeatForever(autoreverses: true),
                                    value: isLivePulsing
                                )
                                .onAppear { isLivePulsing = true }
                        }
                    }

                    // Title
                    Text(object.title)
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)

                    // Time-relative subtitle
                    Text(timingText)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 12)

                if isUpdating {
                    Text("Updating")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.white.opacity(0.16), in: Capsule())
                }
            }

            // ── Metric pills ───────────────────────────────────────────────────
            HStack(spacing: 12) {
                if let distanceText {
                    MetricPill(label: distanceText)
                }
                MetricPill(label: goingText)
            }

            // ── CTA buttons ────────────────────────────────────────────────────
            HStack(spacing: 10) {
                CTAButton(label: "Going",    style: .primary,   action: onGoing)
                CTAButton(label: "Maybe",    style: .secondary, action: onMaybe)
                Spacer()
                CTAButton(label: "Not This", style: .ghost,     action: onNotThis)
            }
        }
        .foregroundStyle(.white)
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [Color(red: 0.10, green: 0.19, blue: 0.32), Color(red: 0.14, green: 0.43, blue: 0.45)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 28, style: .continuous)
        )
        .shadow(color: .black.opacity(0.18), radius: 20, y: 14)
    }

    // ── Derived state ──────────────────────────────────────────────────────────

    private var isLive: Bool {
        let now = Date().timeIntervalSince1970
        return normalizedSeconds(object.timeWindow.start) <= now && now < normalizedSeconds(object.timeWindow.end)
    }

    private var timingText: String {
        let now = Date().timeIntervalSince1970
        let start = normalizedSeconds(object.timeWindow.start)
        guard start > now else { return "Happening now" }
        let minutes = Int(ceil((start - now) / 60))
        return "Starting in \(minutes) min"
    }

    private var goingText: String {
        object.goingCount == 1 ? "1 person going" : "\(object.goingCount) people going"
    }

    private func normalizedSeconds(_ timestamp: Double) -> Double {
        timestamp > 10_000_000_000 ? timestamp / 1000 : timestamp
    }
}

// ─── MetricPill ───────────────────────────────────────────────────────────────

private struct MetricPill: View {
    let label: String

    var body: some View {
        Text(label)
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(.white.opacity(0.16), in: Capsule())
    }
}

// ─── CTAButton ────────────────────────────────────────────────────────────────

private enum CTAStyle: Equatable { case primary, secondary, ghost }

private struct CTAButton: View {
    let label: String
    let style: CTAStyle
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(labelColor)
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                .background {
                    if style == .primary {
                        Capsule().fill(.white)
                    }
                }
                .overlay {
                    if style != .primary {
                        Capsule().strokeBorder(borderColor, lineWidth: borderWidth)
                    }
                }
        }
        .buttonStyle(.plain)
    }

    private var labelColor: Color {
        switch style {
        case .primary:   Color(red: 0.10, green: 0.19, blue: 0.32)
        case .secondary: .white
        case .ghost:     .white.opacity(0.6)
        }
    }

    private var borderColor: Color {
        style == .secondary ? .white.opacity(0.50) : .white.opacity(0.22)
    }

    private var borderWidth: CGFloat {
        style == .secondary ? 1.5 : 1.0
    }
}
