import SwiftUI

public struct RefineSheet: View {
    @Binding public var isPresented: Bool
    public let options: [HadeRefineOption]
    public let onSelect: (HadeRefineOption) -> Void

    public init(
        isPresented: Binding<Bool>,
        options: [HadeRefineOption],
        onSelect: @escaping (HadeRefineOption) -> Void
    ) {
        self._isPresented = isPresented
        self.options = Array(options.prefix(3))
        self.onSelect = onSelect
    }

    public var body: some View {
        VStack(spacing: 18) {
            Capsule()
                .fill(Color.secondary.opacity(0.28))
                .frame(width: 44, height: 5)
                .padding(.top, 10)

            Text("Refine this decision")
                .font(.title3.weight(.semibold))

            Text("Keep one decision on screen and nudge it slightly.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)

            VStack(spacing: 12) {
                ForEach(Array(options.prefix(3))) { option in
                    Button {
                        onSelect(option)
                    } label: {
                        Text(option.title)
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
            .padding(.bottom, 22)
        }
        .frame(maxWidth: .infinity)
        .presentationDetents([.fraction(0.55), .fraction(0.68)])
        .presentationDragIndicator(.hidden)
    }
}
