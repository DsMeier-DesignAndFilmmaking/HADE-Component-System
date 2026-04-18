import SwiftUI

public struct PrimaryCTA: View {
    public let onTap: () -> Void

    public init(onTap: @escaping () -> Void) {
        self.onTap = onTap
    }

    public var body: some View {
        Button(action: onTap) {
            Text("Go")
                .font(.headline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .frame(height: 58)
                .background(Color(red: 0.96, green: 0.44, blue: 0.22), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .foregroundStyle(.white)
        }
        .buttonStyle(.plain)
    }
}
