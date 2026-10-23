import Foundation

@main
struct ServerAddressTests {
    static func main() async throws {
        testLocalAndSecureServers()
        testRejectsUnsafeOrUnsupportedAddresses()
        testNavigationOriginIncludesPortAndScheme()
        testCredits()
        if let address = ProcessInfo.processInfo.environment["FLEXWORK_TEST_SERVER"] {
            try await testAPI(address)
        }
        print("Native menu bar checks passed")
    }
    static func testLocalAndSecureServers() {
        ["http://localhost:1983", "http://127.0.0.1:1983/", "http://[::1]:1983", "https://flexwork.example.com"].forEach {
            precondition(ServerAddress.parse($0) != nil, $0)
        }
    }

    static func testRejectsUnsafeOrUnsupportedAddresses() {
        ["http://example.com", "file:///etc/passwd", "javascript:alert(1)", "https://user:pass@example.com",
         "https://example.com/app", "https://example.com?secret=1", "https://example.com#hash", "http://localhost:70000", ""].forEach {
            precondition(ServerAddress.parse($0) == nil, $0)
        }
    }

    static func testNavigationOriginIncludesPortAndScheme() {
        let base = ServerAddress.fallback
        precondition(ServerAddress.isSameOrigin(URL(string: "http://localhost:1983/history")!, as: base))
        precondition(!ServerAddress.isSameOrigin(URL(string: "http://localhost:1984")!, as: base))
        precondition(!ServerAddress.isSameOrigin(URL(string: "https://localhost:1983")!, as: base))
        precondition(!ServerAddress.isSameOrigin(URL(string: "https://example.com")!, as: base))
        precondition(ServerAddress.isSameOrigin(URL(string: "https://example.com:443/history")!, as: URL(string: "https://example.com")!))
    }
    static func testCredits() {
        let work = WorkDay(date: "2026-10-26", weekday: "월요일", mode: "work", start: "09:00", end: "18:00")
        precondition(work.credit == 480)
        let leave = WorkDay(date: work.date, weekday: work.weekday, mode: "leave_am", start: "14:00", end: "18:00")
        precondition(leave.credit == 480)
        let invalid = WorkDay(date: work.date, weekday: work.weekday, mode: "work", start: "18:00", end: "09:00")
        precondition(invalid.credit == 0)
    }

    static func expectUnauthorized(_ api: API) async throws {
        do {
            _ = try await api.request("/api/menu-bar")
            preconditionFailure("Missing session must be rejected")
        } catch let error as ServiceError { precondition(error.status == 401) }
    }

    static func testAPI(_ address: String) async throws {
        let api = API(baseURL: ServerAddress.parse(address)!)
        defer { api.close() }
        try await expectUnauthorized(api)
        _ = try await api.request("/api/auth/login", method: "POST",
                                  body: JSONSerialization.data(withJSONObject: ["password": "flexwork-native-test"]))
        let (data, _) = try await api.request("/api/menu-bar?week=next")
        let plan = try JSONDecoder().decode(Plan.self, from: data)
        precondition(plan.days.count == 5 && plan.total == 2400)
        precondition(plan.startOptions.first == "09:00" && plan.endOptions.last == "19:00")
        let days = try JSONSerialization.jsonObject(with: JSONEncoder().encode(plan.days))
        let (balanced, _) = try await api.request("/api/menu-bar", method: "POST",
            body: JSONSerialization.data(withJSONObject: ["action": "balance", "days": days]))
        let result = try JSONSerialization.jsonObject(with: balanced) as? [String: Any]
        precondition(result?["days"] != nil)
        let (document, _) = try await api.request("/api/docx", method: "POST", body: JSONEncoder().encode(plan))
        precondition(document.prefix(2) == Data([0x50, 0x4b]))
        let (printData, _) = try await api.request("/api/menu-bar/print", method: "POST", body: JSONEncoder().encode(plan))
        precondition(String(data: printData, encoding: .utf8)?.contains("유연근무제 신청(변경)서") == true)
        let second = API(baseURL: api.baseURL)
        defer { second.close() }
        try await expectUnauthorized(second)
        _ = try await api.request("/api/auth/logout", method: "POST")
        try await expectUnauthorized(api)
        print("Native API: login, plan, balance, Word, print HTML, isolated cookies and logout passed")
    }

}
