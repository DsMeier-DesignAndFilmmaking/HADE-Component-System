import SwiftUI

public struct DecisionCard: View {
    public let state: HadeViewState

    public init(state: HadeViewState) {
        self.state = state
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Your move")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.72))
                .textCase(.uppercase)

            Text(state.decision?.title ?? "Understanding your context...")
                .font(.system(size: 32, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.82)

            HStack(spacing: 10) {
                metricPill(state.decision?.distance ?? "Locating...")

                if let eta = state.decision?.eta {
                    metricPill(eta)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(24)
        .background(
            LinearGradient(
                colors: [Color(red: 0.10, green: 0.19, blue: 0.32), Color(red: 0.12, green: 0.42, blue: 0.40)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 28, style: .continuous)
        )
    }

    private func metricPill(_ value: String) -> some View {
        Text(value)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(.white.opacity(0.18), in: Capsule())
    }
}
