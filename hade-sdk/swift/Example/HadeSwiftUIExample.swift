import SwiftUI

@MainActor
struct HadeExampleContainer: View {
    private let sdk = HadeSDK(baseURL: URL(string: "https://example.com/api")!)

    var body: some View {
        DecisionScreen(
            viewModel: HadeViewModel(sdk: sdk),
            onGo: { decision in
                print("Go -> \(decision?.title ?? "Unknown")")
            }
        )
    }
}
