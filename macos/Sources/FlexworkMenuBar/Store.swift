import AppKit
import SwiftUI

@MainActor
final class MenuStore: ObservableObject {
    @Published var plan: Plan?
    @Published var records: [Record] = []
    @Published var week = "this"
    @Published var tab = "plan"
    @Published var loggedIn = false
    @Published var busy = false
    @Published var notice = "서버에 연결한 뒤 로그인하세요."
    @Published var isError = false
    @Published var needsOTP = false
    @Published var templates = TemplateStore()
    @Published var server = UserDefaults.standard.string(forKey: "serverURL") ?? "http://localhost:1983"
    private var api: API
    private var drafts: [String: Plan] = [:]
    private let printer = Printer()

    init() {
        api = API(baseURL: ServerAddress.parse(UserDefaults.standard.string(forKey: "serverURL") ?? "") ?? ServerAddress.fallback)
    }

    func run(_ success: String = "", operation: @escaping () async throws -> Void) {
        guard !busy else { return }
        busy = true
        isError = false
        notice = "처리 중…"
        Task {
            defer { busy = false }
            do {
                try await operation()
                if !success.isEmpty { notice = success }
            } catch {
                isError = true
                notice = error.localizedDescription
                if (error as? ServiceError)?.status == 401 { loggedIn = false }
            }
        }
    }

    func login(_ password: String) {
        run("로그인했습니다.") {
            _ = try await self.api.request("/api/auth/login", method: "POST", body: JSONSerialization.data(withJSONObject: ["password": password]))
            self.loggedIn = true
            if self.plan == nil { try await self.loadWeek() }
        }
    }

    private func loadWeek() async throws {
        let (data, _) = try await api.request("/api/menu-bar?week=\(week)")
        let loaded = try JSONDecoder().decode(Plan.self, from: data)
        plan = loaded
        templates = loaded.templates
    }

    // ---- 주간 패턴 템플릿 ----
    // 고른 템플릿은 서버에 기본값으로 기록해, 다음에 저장본 없는 주를 열면 그대로 깔린다.
    func useTemplate(_ template: Template) {
        run("\(template.name) 템플릿을 적용했습니다. 저장 버튼으로 기록을 남기세요.") {
            guard var current = self.plan, template.days.count == current.days.count else { return }
            for index in current.days.indices {
                current.days[index].mode = "work"
                current.days[index].holidayText = nil
                current.days[index].start = template.days[index].start
                current.days[index].end = template.days[index].end
            }
            current.saved = false
            self.plan = current
            try await self.postTemplate(["action": "use", "id": template.id])
        }
    }

    func saveTemplate(_ name: String) {
        run("\(name) 템플릿을 저장했습니다.") {
            guard let current = self.plan else { return }
            let days = try JSONSerialization.jsonObject(with: JSONEncoder().encode(current.days))
            try await self.postTemplate([
                "action": "save", "name": name,
                "days": days, "periodStart": current.periodStart,
            ])
        }
    }

    func deleteTemplate(_ template: Template) {
        run("\(template.name) 템플릿을 삭제했습니다.") {
            let (data, _) = try await self.api.request("/api/menu-bar/templates?id=\(template.id)", method: "DELETE")
            self.templates = try JSONDecoder().decode(TemplateStore.self, from: data)
        }
    }

    private func postTemplate(_ body: [String: Any]) async throws {
        let (data, _) = try await api.request("/api/menu-bar/templates", method: "POST",
                                              body: JSONSerialization.data(withJSONObject: body))
        templates = try JSONDecoder().decode(TemplateStore.self, from: data)
    }

    func selectWeek(_ value: String) {
        if let plan { drafts[week] = plan }
        week = value
        needsOTP = false
        plan = drafts[value]
        if plan == nil { run("일정을 불러왔습니다.") { try await self.loadWeek() } }
    }

    func refresh() {
        run("새로 불러왔습니다.") {
            try await self.loadWeek()
            self.drafts[self.week] = self.plan
        }
    }

    func editDay(_ index: Int, _ update: (inout WorkDay) -> Void) {
        guard var current = plan else { return }
        update(&current.days[index])
        current.saved = false
        plan = current
    }

    func editProfile(_ key: WritableKeyPath<Profile, String>, value: String) {
        guard var current = plan else { return }
        current.settings[keyPath: key] = value
        current.saved = false
        plan = current
    }

    func transform(_ action: String, extra: [String: Any] = [:]) {
        run("일정에 반영했습니다. 저장 버튼으로 기록을 남기세요.") {
            try await self.applyTransform(action, extra: extra)
        }
    }

    private func applyTransform(_ action: String, extra: [String: Any] = [:]) async throws {
        guard let current = plan else { return }
        let days = try JSONSerialization.jsonObject(with: JSONEncoder().encode(current.days))
        let body = ["action": action, "days": days].merging(extra) { _, new in new }
        let (data, _) = try await api.request("/api/menu-bar", method: "POST", body: JSONSerialization.data(withJSONObject: body))
        struct Result: Decodable { let days: [WorkDay] }
        plan?.days = try JSONDecoder().decode(Result.self, from: data).days
        plan?.saved = false
    }

    func importHiworks(_ otp: String) {
        run {
            guard let current = self.plan else { return }
            var query = URLComponents()
            query.queryItems = [URLQueryItem(name: "start", value: current.periodStart), URLQueryItem(name: "end", value: current.periodEnd)] +
                (otp.isEmpty ? [] : [URLQueryItem(name: "otp", value: otp)])
            do {
                let (data, status) = try await self.api.request("/api/hiworks/calendar?\(query.percentEncodedQuery ?? "")")
                if status == 202 {
                    self.needsOTP = true
                    self.notice = "Hiworks OTP 코드를 입력하세요."
                    return
                }
                let calendar = try JSONSerialization.jsonObject(with: data)
                try await self.applyTransform("hiworks", extra: ["calendar": calendar])
                self.needsOTP = false
                self.notice = "Hiworks 근태를 반영했습니다. 확인 후 저장하세요."
            } catch let error as ServiceError where error.status == 401 {
                // Hiworks credentials can fail independently from the app session.
                _ = try await self.api.request("/api/settings")
                throw ServiceError(message: error.message, status: 0)
            }
        }
    }

    func save() {
        run("신청서를 저장했습니다.") {
            guard let current = self.plan else { return }
            _ = try await self.api.request("/api/entries", method: "POST", body: JSONEncoder().encode(current))
            self.plan?.saved = true
        }
    }

    func loadRecords() {
        tab = "history"
        run("기록을 불러왔습니다.") {
            let (data, _) = try await self.api.request("/api/entries")
            self.records = try JSONDecoder().decode([Record].self, from: data)
        }
    }

    func deleteRecord(_ record: Record) {
        run("기록을 삭제했습니다.") {
            _ = try await self.api.request("/api/entries/\(record.id)", method: "DELETE")
            self.records = self.records.filter { $0.id != record.id }
            self.drafts = self.drafts.mapValues { value in
                var result = value
                if value.periodStart == record.periodStart { result.saved = false }
                return result
            }
            if self.plan?.periodStart == record.periodStart { self.plan?.saved = false }
        }
    }

    func export(_ record: Record? = nil) {
        run("Word 파일을 준비했습니다.") {
            let data: Data
            let filename: String
            if let record {
                (data, _) = try await self.api.request("/api/entries/\(record.id)/docx")
                filename = "\(record.periodStart).docx"
            } else if let current = self.plan {
                (data, _) = try await self.api.request("/api/docx", method: "POST", body: JSONEncoder().encode(current))
                filename = "\(current.periodStart).docx"
            } else { return }
            NSApp.activate(ignoringOtherApps: true)
            let panel = NSSavePanel()
            panel.nameFieldStringValue = filename
            guard panel.runModal() == .OK, let destination = panel.url else { return }
            try data.write(to: destination, options: .atomic)
        }
    }

    func printPlan(_ record: Record? = nil) {
        run {
            let body: Data
            if let record { body = try JSONEncoder().encode(record) }
            else if let current = self.plan { body = try JSONEncoder().encode(current) }
            else { return }
            let (data, _) = try await self.api.request("/api/menu-bar/print", method: "POST", body: body)
            guard let html = String(data: data, encoding: .utf8) else {
                throw ServiceError(message: "인쇄 양식을 읽을 수 없습니다.", status: 0)
            }
            self.notice = "인쇄창을 준비하고 있습니다."
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                self.printer.printHTML(html) { error in
                    if let error { continuation.resume(throwing: error) }
                    else { continuation.resume() }
                }
            }
            self.notice = "인쇄창을 닫았습니다."
        }
    }

    func configureServer() {
        guard let url = ServerAddress.parse(server) else {
            isError = true
            notice = "로컬 HTTP 또는 원격 HTTPS 루트 주소를 입력하세요."
            return
        }
        api.close()
        api = API(baseURL: url)
        UserDefaults.standard.set(url.absoluteString, forKey: "serverURL")
        plan = nil
        records = []
        drafts = [:]
        loggedIn = false
        needsOTP = false
        isError = false
        tab = "plan"
        notice = "서버 주소를 변경했습니다. 다시 로그인하세요."
    }

    func logout() {
        run("로그아웃했습니다.") {
            _ = try await self.api.request("/api/auth/logout", method: "POST")
            self.api.close()
            self.api = API(baseURL: self.api.baseURL)
            self.loggedIn = false
            self.plan = nil
            self.records = []
            self.drafts = [:]
            self.needsOTP = false
        }
    }
}
