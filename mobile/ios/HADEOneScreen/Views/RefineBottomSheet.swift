import SwiftUI

struct RefineBottomSheet: View {
    @Binding var isPresented: Bool
    let onSelect: (RefineRequest) -> Void

    var body: some View {
        VStack(spacing: 18) {
            Capsule()
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 42, height: 5)
                .padding(.top, 10)

            Text("Refine this decision")
                .font(.title3.weight(.semibold))

            Text("Keep the same flow, just nudge the recommendation.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            VStack(spacing: 12) {
                ForEach(RefineRequest.RefineTone.allCases) { tone in
                    Button {
                        onSelect(RefineRequest(tone: tone))
                    } label: {
                        Text(tone.rawValue)
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(Color.black.opacity(0.05), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)

            Button("Close") {
                isPresented = false
            }
            .font(.subheadline.weight(.medium))
            .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity)
        .presentationDetents([.fraction(0.55), .fraction(0.68)])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(28)
        .interactiveDismissDisabled(false)
    }
}
