import SwiftUI

struct PrimaryCTAButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text("Go")
                .font(.headline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .frame(height: 58)
                .background(Color(red: 0.96, green: 0.46, blue: 0.22), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .foregroundStyle(.white)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("hade.primary.go")
    }
}
