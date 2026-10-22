import SwiftUI

@main
struct FlexworkMenuBar: App {
    @StateObject private var store = MenuStore()

    var body: some Scene {
        MenuBarExtra {
            MenuPanel(store: store)
        } label: {
            Label("유연근무", systemImage: "calendar.badge.clock")
        }
        .menuBarExtraStyle(.window)
    }
}

struct MenuPanel: View {
    @ObservedObject var store: MenuStore
    @State private var password = ""
    @State private var otp = ""
    @State private var confirmation: Confirmation?
    @State private var expandedRecord: String?
    private let modes = [("work", "근무"), ("holiday", "공휴일"), ("leave_full", "종일 연차"), ("leave_pm", "오후 반차"), ("leave_am", "오전 반차")]

    struct Confirmation: Identifiable {
        let id = UUID()
        let title: String
        let detail: String
        let action: () -> Void
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("유연근무", systemImage: "calendar.badge.clock").font(.title2.bold())
                Spacer()
                if store.busy { ProgressView().controlSize(.small) }
                Menu {
                    Button("서버 설정") { store.tab = "settings" }
                    if store.loggedIn {
                        Button("로그아웃") { confirm("로그아웃할까요?", "저장하지 않은 입력이 사라집니다.") { store.logout() } }
                    }
                    Divider()
                    Button("종료") { confirm("Flexwork를 종료할까요?", "저장하지 않은 입력이 사라집니다.") { NSApp.terminate(nil) } }
                } label: { Image(systemName: "ellipsis.circle") }
                .menuStyle(.borderlessButton).fixedSize()
                .accessibilityLabel("앱 메뉴")
            }
            if store.loggedIn {
                Picker("화면", selection: Binding(get: { store.tab }, set: { value in
                    if value == "history" { store.loadRecords() } else { store.tab = value }
                })) {
                    Text("주간 일정").tag("plan")
                    Text("제출 기록").tag("history")
                    Text("설정").tag("settings")
                }.pickerStyle(.segmented)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if store.tab == "settings" { settings }
                    else if !store.loggedIn { login }
                    else if store.tab == "history" { history }
                    else if let plan = store.plan { planner(plan) }
                    else {
                        Text("일정을 불러오지 못했습니다.").foregroundStyle(.secondary)
                        Button("다시 불러오기") { store.refresh() }
                    }
                }.padding(.vertical, 2)
            }
            Divider()
            Text(store.notice)
                .font(.caption)
                .foregroundStyle(store.isError ? Color.red : Color.secondary)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel("상태: \(store.notice)")
        }
        .padding(18)
        .frame(width: 540, height: 650)
        .disabled(store.busy)
        .alert(item: $confirmation) { item in
            Alert(title: Text(item.title), message: Text(item.detail),
                  primaryButton: .default(Text("확인"), action: item.action), secondaryButton: .cancel(Text("취소")))
        }
    }

    private func confirm(_ title: String, _ detail: String, action: @escaping () -> Void) {
        confirmation = Confirmation(title: title, detail: detail, action: action)
    }

    private var login: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("메뉴 막대에서 한 주를 준비하세요").font(.headline)
            Text("근무 시간 조정부터 신청서 저장까지 이 패널에서 처리합니다.").foregroundStyle(.secondary)
            Text(store.server).font(.caption).textSelection(.enabled)
            SecureField("앱 비밀번호", text: $password).onSubmit { signIn() }
            Button("로그인", action: signIn).buttonStyle(.borderedProminent).disabled(password.isEmpty)
            Button("서버 주소 변경") { store.tab = "settings" }
            Text("기존 Flexwork 서버가 실행 중이어야 합니다. 비밀번호는 저장하지 않습니다.").font(.caption).foregroundStyle(.secondary)
        }.textFieldStyle(.roundedBorder)
    }

    private func signIn() {
        store.login(password)
        password = ""
    }

    private func planner(_ plan: Plan) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("주 선택", selection: Binding(get: { store.week }, set: { store.selectWeek($0); otp = "" })) {
                Text("이번 주").tag("this")
                Text("다음 주").tag("next")
            }.pickerStyle(.segmented)
            HStack {
                Text("\(plan.periodStart) – \(plan.periodEnd)").font(.subheadline.bold())
                Spacer()
                Text(plan.saved ? "저장됨" : "미저장").font(.caption).foregroundStyle(plan.saved ? Color.green : Color.orange)
            }
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(plan.totalLabel).font(.title2.bold()).monospacedDigit()
                    Text("/ 40시간").foregroundStyle(.secondary)
                    Spacer()
                    Image(systemName: plan.total == 2400 ? "checkmark.circle.fill" : "exclamationmark.circle")
                        .foregroundStyle(plan.total == 2400 ? Color.green : Color.orange)
                }
                ProgressView(value: Double(min(plan.total, 2400)), total: 2400)
                Text(plan.total == 2400 ? "주간 인정 시간을 채웠습니다." : "\(abs(plan.total - 2400))분 \(plan.total < 2400 ? "부족" : "초과")")
                    .font(.caption).foregroundStyle(.secondary)
            }.padding(12).background(Color.accentColor.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            ForEach(Array(plan.days.enumerated()), id: \.element.id) { index, day in
                dayRow(index, day, plan)
                if index < 4 { Divider() }
            }
            HStack {
                Button("40시간 맞춤") { store.transform("balance") }
                if store.week == "this" {
                    Button("Hiworks 불러오기") { store.importHiworks("") }
                }
                Spacer()
                Button { confirm("서버에서 다시 불러올까요?", "현재 주의 저장하지 않은 입력이 사라집니다.") { store.refresh() } }
                label: { Image(systemName: "arrow.clockwise") }.help("서버에서 다시 불러오기").accessibilityLabel("서버에서 다시 불러오기")
            }
            if store.needsOTP {
                HStack {
                    SecureField("Hiworks OTP", text: $otp)
                    Button("OTP 확인") { store.importHiworks(otp); otp = "" }.disabled(otp.isEmpty)
                }
            }
            HStack {
                Text("신청일").font(.caption)
                DatePicker("신청일", selection: Binding(get: {
                    Self.dateFormatter.date(from: store.plan?.applyDate ?? "") ?? Date()
                }, set: { store.plan?.applyDate = Self.dateFormatter.string(from: $0); store.plan?.saved = false }), displayedComponents: .date)
                    .labelsHidden()
                Spacer()
                Button("인쇄") { store.printPlan() }
                Button("Word 저장") { store.export() }
                Button("신청서 저장") { store.save() }.buttonStyle(.borderedProminent)
            }
            Text("반차·연차·공휴일은 8시간 인정 · 인쇄창에서 프린터 또는 PDF 저장을 선택하세요.")
                .font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func dayRow(_ index: Int, _ day: WorkDay, _ plan: Plan) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(String(day.weekday.prefix(1))).font(.headline)
                    Text(String(day.date.suffix(5))).font(.caption2).foregroundStyle(.secondary)
                }.frame(width: 40, alignment: .leading)
                Picker("\(day.weekday) 구분", selection: Binding(get: { day.mode }, set: { store.transform("mode", extra: ["index": index, "mode": $0]) })) {
                    ForEach(modes, id: \.0) { mode in Text(mode.1).tag(mode.0) }
                }.labelsHidden().frame(width: 110)
                if ["work", "leave_pm", "leave_am"].contains(day.mode) {
                    if day.mode == "leave_am" { Text("14:00").frame(width: 74) }
                    else { timePicker(index, day, \.start, plan.startOptions, "출근") }
                    Text("–").foregroundStyle(.secondary)
                    if day.mode == "leave_pm" { Text("13:00").frame(width: 74) }
                    else { timePicker(index, day, \.end, plan.endOptions, "퇴근") }
                } else {
                    Text(day.mode == "holiday" ? "공휴일" : "종일 휴가").foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Text(String(format: "%d:%02d", day.credit / 60, day.credit % 60)).font(.caption.monospacedDigit())
            }
            if day.mode == "holiday" {
                TextField("공휴일 이름", text: Binding(get: { day.holidayText ?? "" }, set: { value in store.editDay(index) { $0.holidayText = value } }))
                    .textFieldStyle(.roundedBorder).padding(.leading, 50)
            }
        }
    }

    private func timePicker(_ index: Int, _ day: WorkDay, _ key: WritableKeyPath<WorkDay, String>, _ options: [String], _ label: String) -> some View {
        Picker("\(day.weekday) \(label)", selection: Binding(get: { day[keyPath: key] }, set: { value in store.editDay(index) { $0[keyPath: key] = value } })) {
            ForEach(options, id: \.self) { Text($0).tag($0) }
        }.labelsHidden().frame(width: 80)
    }

    private var history: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("저장된 신청서 \(store.records.count)건").font(.headline)
                Spacer()
                Button("새로고침") { store.loadRecords() }
            }
            if store.records.isEmpty { Text("아직 저장된 신청서가 없습니다.").foregroundStyle(.secondary) }
            ForEach(store.records) { record in
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(record.periodStart) – \(record.periodEnd)").font(.headline)
                    Text("\(record.settings.name) · 신청일 \(record.applyDate)").font(.caption).foregroundStyle(.secondary)
                    HStack {
                        Button(expandedRecord == record.id ? "접기" : "상세") { expandedRecord = expandedRecord == record.id ? nil : record.id }
                        Button("인쇄") { store.printPlan(record) }
                        Button("Word 저장") { store.export(record) }
                        Spacer()
                        Button("삭제", role: .destructive) {
                            confirm("신청서를 삭제할까요?", "\(record.periodStart) 주 기록을 삭제합니다. 되돌릴 수 없습니다.") { store.deleteRecord(record) }
                        }
                    }
                    if expandedRecord == record.id {
                        ForEach(record.days) { day in
                            HStack {
                                Text(day.weekday)
                                Text(modes.first { $0.0 == day.mode }?.1 ?? day.mode)
                                Spacer()
                                Text(day.mode == "holiday" ? day.holidayText ?? "공휴일" : day.mode == "leave_full" ? "휴가" : "\(day.start) – \(day.end)")
                            }.font(.caption)
                        }
                    }
                }.padding(12).background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private var settings: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("서버 연결").font(.headline)
            TextField("http://localhost:3000", text: $store.server)
            Button("서버 주소 적용") {
                confirm("서버를 변경할까요?", "로그아웃되며 저장하지 않은 입력이 사라집니다.") { store.configureServer() }
            }
            if !store.loggedIn { Button("로그인으로 돌아가기") { store.tab = "plan" } }
            if store.plan != nil {
                Divider()
                Text("신청서 기본 정보").font(.headline)
                profileField("업체명", \.company)
                profileField("부서", \.department)
                profileField("생년월일", \.birth)
                profileField("이름", \.name)
                profileField("공동근무시간", \.coreTime)
                Text("현재 주 신청서에 적용됩니다. 신청서를 저장하면 다음 신청서의 기본값으로 기억합니다.").font(.caption).foregroundStyle(.secondary)
            }
            Text("비밀번호와 세션은 앱 종료 시 지워집니다. 원격 서버에는 HTTPS가 필요합니다.").font(.caption).foregroundStyle(.secondary)
        }.textFieldStyle(.roundedBorder)
    }

    private func profileField(_ title: String, _ key: WritableKeyPath<Profile, String>) -> some View {
        HStack {
            Text(title).frame(width: 88, alignment: .leading)
            TextField(title, text: Binding(get: { store.plan?.settings[keyPath: key] ?? "" }, set: { store.editProfile(key, value: $0) }))
        }
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}
