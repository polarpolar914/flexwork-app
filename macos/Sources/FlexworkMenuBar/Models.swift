import Foundation

struct Profile: Codable {
    var company: String
    var department: String
    var birth: String
    var name: String
    var coreTime: String
}

struct WorkDay: Codable, Identifiable {
    var id: String { date }
    var date: String
    var weekday: String
    var mode: String
    var start: String
    var end: String
    var holidayText: String?

    var credit: Int {
        guard mode == "work" else { return 480 }
        return max(0, Self.minutes(end) - Self.minutes(start) - 60)
    }
    static func minutes(_ time: String) -> Int {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : 0
    }
}

struct Plan: Codable {
    var periodStart: String
    var periodEnd: String
    var applyDate: String
    var days: [WorkDay]
    var settings: Profile
    var saved: Bool
    var startOptions: [String]
    var endOptions: [String]
    var total: Int { days.reduce(0) { $0 + $1.credit } }
    var totalLabel: String { "\(total / 60)시간 \(total % 60)분" }
}

struct Record: Codable, Identifiable {
    let id: String
    let periodStart: String
    let periodEnd: String
    let applyDate: String
    let days: [WorkDay]
    let settings: Profile
}

struct ServiceError: LocalizedError {
    let message: String
    let status: Int
    var errorDescription: String? { message }
}

// Each server gets an isolated, memory-only cookie session. Passwords are never persisted.
final class API: NSObject, URLSessionTaskDelegate {
    let baseURL: URL
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 45
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    init(baseURL: URL) { self.baseURL = baseURL }
    func close() { session.invalidateAndCancel() }

    func request(_ path: String, method: String = "GET", body: Data? = nil) async throws -> (Data, Int) {
        guard let url = URL(string: path, relativeTo: baseURL), ServerAddress.isSameOrigin(url, as: baseURL) else {
            throw ServiceError(message: "서버 주소가 올바르지 않습니다.", status: 0)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            throw ServiceError(message: json?["error"] as? String ?? "서버 요청 실패 (\(status))", status: status)
        }
        return (data, status)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil) // Never forward passwords or session cookies to a redirect destination.
    }
}
