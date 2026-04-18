import SwiftUI

struct ReasoningList: View {
    let reasoning: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(reasoning.prefix(3).enumerated()), id: \.offset) { _, line in
                HStack(alignment: .top, spacing: 10) {
                    Circle()
                        .fill(Color(red: 0.14, green: 0.43, blue: 0.45))
                        .frame(width: 8, height: 8)
                        .padding(.top, 7)

                    Text(line)
                        .font(.subheadline)
                        .foregroundStyle(Color.black.opacity(0.72))
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
