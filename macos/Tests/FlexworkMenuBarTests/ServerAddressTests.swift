import Foundation

@main
struct ServerAddressTests {
    static func main() {
        testLocalAndSecureServers()
        testRejectsUnsafeOrUnsupportedAddresses()
        testNavigationOriginIncludesPortAndScheme()
        print("Server address checks passed")
    }
    static func testLocalAndSecureServers() {
        ["http://localhost:3000", "http://127.0.0.1:3000/", "http://[::1]:3000", "https://flexwork.example.com"].forEach {
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
        precondition(ServerAddress.isSameOrigin(URL(string: "http://localhost:3000/history")!, as: base))
        precondition(!ServerAddress.isSameOrigin(URL(string: "http://localhost:3001")!, as: base))
        precondition(!ServerAddress.isSameOrigin(URL(string: "https://localhost:3000")!, as: base))
        precondition(!ServerAddress.isSameOrigin(URL(string: "https://example.com")!, as: base))
        precondition(ServerAddress.isSameOrigin(URL(string: "https://example.com:443/history")!, as: URL(string: "https://example.com")!))
    }
}
