import Foundation

// Plain HTTP is restricted to loopback; remote sessions require TLS.
enum ServerAddress {
    static let fallback = URL(string: "http://localhost:1983")!

    static func parse(_ value: String) -> URL? {
        guard let parts = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/",
              parts.port.map({ (1...65535).contains($0) }) ?? true,
              parts.scheme == "https" || (parts.scheme == "http" &&
                ["localhost", "127.0.0.1", "[::1]"].contains(host.lowercased()))
        else { return nil }
        return parts.url
    }

    static func isSameOrigin(_ url: URL, as base: URL) -> Bool {
        url.scheme == base.scheme && url.host == base.host &&
            (url.port ?? (url.scheme == "https" ? 443 : 80)) ==
            (base.port ?? (base.scheme == "https" ? 443 : 80))
    }
}
