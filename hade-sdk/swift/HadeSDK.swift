import Foundation

public struct HadeDecisionResponse: Decodable {
    public let status: String
    public let decision: DecisionPayload?
    public let reasoning: [String]
    public let confidence: Double

    public struct DecisionPayload: Decodable {
        public let title: String
        public let distance: String
        public let eta: String?
    }
}

public final class HadeSDK {
    private let baseURL: URL
    private let session: URLSession

    public init(baseURL: URL = URL(string: "https://example.com/api")!, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func getDecision() async throws -> HadeDecisionResponse {
        try await request(mode: "initial", refineTone: nil)
    }

    public func regenerate() async throws -> HadeDecisionResponse {
        try await request(mode: "regenerate", refineTone: nil)
    }

    public func refine(tone: String? = nil) async throws -> HadeDecisionResponse {
        try await request(mode: "refine", refineTone: tone)
    }

    private func request(mode: String, refineTone: String?) async throws -> HadeDecisionResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("hade/decide"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "mode": mode,
            "signals": refineTone == nil ? [] : [["type": "INTENT", "content": "refine:\(refineTone!)"]]
        ])

        let (data, _) = try await session.data(for: request)
        return try JSONDecoder().decode(HadeDecisionResponse.self, from: data)
    }
}
