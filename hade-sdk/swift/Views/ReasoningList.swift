import SwiftUI

public struct ReasoningList: View {
    public let reasoning: [String]

    public init(reasoning: [String]) {
        self.reasoning = Array(reasoning.prefix(3))
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(reasoning.prefix(3).enumerated()), id: \.offset) { _, reason in
                HStack(alignment: .top, spacing: 10) {
                    Circle()
                        .fill(Color(red: 0.12, green: 0.42, blue: 0.40))
                        .frame(width: 8, height: 8)
                        .padding(.top, 7)

                    Text(reason)
                        .font(.subheadline)
                        .foregroundStyle(Color.black.opacity(0.72))
                        .lineLimit(2)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
