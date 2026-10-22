import AppKit
import WebKit

@main
struct FlexworkMenuBar {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        withExtendedLifetime(delegate) { app.run() }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate,
    WKDownloadDelegate, WKScriptMessageHandler {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private let webView = WKWebView()
    private let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 960, height: 680),
                                  styleMask: [.titled, .closable, .miniaturizable, .resizable],
                                  backing: .buffered, defer: false)
    private var baseURL: URL {
        ServerAddress.parse(UserDefaults.standard.string(forKey: "serverURL") ?? "") ?? ServerAddress.fallback
    }
    // WebKit requires a nonexistent destination. Stage downloads before showing a save panel.
    private var downloads: [ObjectIdentifier: (file: URL, name: String)] = [:]

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem.button?.image = NSImage(systemSymbolName: "calendar.badge.clock", accessibilityDescription: "유연근무")
        statusItem.button?.toolTip = "유연근무제 신청서"
        let menu = NSMenu()
        [item("신청서 열기", #selector(openPlanner)), item("제출 기록", #selector(openHistory)),
         item("현재 화면 새로고침", #selector(reload)), .separator(),
         item("브라우저에서 열기", #selector(openBrowser)), item("서버 주소 설정…", #selector(configure)),
         .separator(), item("Flexwork 종료", #selector(quit))].forEach { menu.addItem($0) }
        statusItem.menu = menu
        // Standard responder-chain shortcuts remain available without a Dock icon.
        let mainMenu = NSMenu()
        let appMenu = NSMenu()
        let appItem = NSMenuItem(title: "Flexwork", action: nil, keyEquivalent: "")
        appItem.submenu = appMenu
        let quitItem = item("Flexwork 종료", #selector(quit))
        quitItem.keyEquivalent = "q"
        appMenu.addItem(quitItem)
        mainMenu.addItem(appItem)
        let editMenu = NSMenu(title: "편집")
        let editItem = NSMenuItem(title: "편집", action: nil, keyEquivalent: "")
        editItem.submenu = editMenu
        [("실행 취소", "undo:", "z"), ("잘라내기", "cut:", "x"),
         ("복사", "copy:", "c"), ("붙여넣기", "paste:", "v"),
         ("전체 선택", "selectAll:", "a")].forEach { title, selector, key in
            editMenu.addItem(NSMenuItem(title: title, action: NSSelectorFromString(selector), keyEquivalent: key))
        }
        mainMenu.addItem(editItem)
        NSApp.mainMenu = mainMenu
        window.title = "유연근무제 신청서"
        window.minSize = NSSize(width: 760, height: 500)
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("FlexworkWindow")
        window.center()
        window.contentView = webView
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.configuration.userContentController.add(self, name: "print")
        webView.configuration.userContentController.addUserScript(WKUserScript(
            source: "window.print = () => window.webkit.messageHandlers.print.postMessage(null);",
            injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        // Launch quietly in the menu bar; opening the window does not discard unsaved edits.
    }

    private func item(_ title: String, _ action: Selector) -> NSMenuItem {
        let result = NSMenuItem(title: title, action: action, keyEquivalent: "")
        result.target = self
        return result
    }

    private func show() {
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    @objc private func openPlanner() {
        if webView.url == nil { webView.load(URLRequest(url: baseURL)) }
        show()
    }

    @objc private func openHistory() {
        if webView.url?.path != "/history" {
            guard confirm("제출 기록으로 이동할까요?", detail: "저장하지 않은 신청서 변경 사항은 사라집니다.") else { return }
            webView.load(URLRequest(url: baseURL.appendingPathComponent("history")))
        }
        show()
    }

    @objc private func reload() {
        guard confirm("새로고침할까요?", detail: "저장하지 않은 변경 사항은 사라집니다.") else { return }
        webView.load(URLRequest(url: webView.url ?? baseURL))
        show()
    }

    @objc private func openBrowser() {
        NSWorkspace.shared.open(webView.url.flatMap { ServerAddress.isSameOrigin($0, as: baseURL) ? $0 : nil } ?? baseURL)
    }

    @objc private func quit() { NSApp.terminate(nil) }

    @objc private func configure() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Flexwork 서버 주소"
        alert.informativeText = "기본값: http://localhost:3000\n서버는 별도로 실행해야 합니다. 주소를 변경하면 저장하지 않은 입력이 사라집니다."
        let field = NSTextField(string: baseURL.absoluteString)
        field.frame = NSRect(x: 0, y: 0, width: 360, height: 24)
        alert.accessoryView = field
        alert.addButton(withTitle: "저장")
        alert.addButton(withTitle: "취소")
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        guard let url = ServerAddress.parse(field.stringValue) else {
            report("올바른 서버 주소를 입력하세요.", "로컬 HTTP 또는 HTTPS 주소만 지원합니다. 경로·계정·쿼리는 포함하지 마세요.")
            return
        }
        UserDefaults.standard.set(url.absoluteString, forKey: "serverURL")
        webView.load(URLRequest(url: url))
        show()
    }

    private func report(_ title: String, _ detail: String) {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = detail
        alert.runModal()
    }

    private func confirm(_ title: String, detail: String = "") -> Bool {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = detail
        alert.addButton(withTitle: "확인")
        alert.addButton(withTitle: "취소")
        return alert.runModal() == .alertFirstButtonReturn
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if ServerAddress.isSameOrigin(url, as: baseURL) || url.scheme == "blob" {
            decisionHandler(action.shouldPerformDownload ? .download : .allow)
        } else {
            decisionHandler(.cancel)
            if ["https", "http"].contains(url.scheme) { NSWorkspace.shared.open(url) }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        downloads[ObjectIdentifier(download)] = (file, (suggestedFilename as NSString).lastPathComponent)
        completionHandler(file)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let entry = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        defer { try? FileManager.default.removeItem(at: entry.file) }
        NSApp.activate(ignoringOtherApps: true)
        let panel = NSSavePanel()
        panel.nameFieldStringValue = entry.name
        guard panel.runModal() == .OK, let destination = panel.url else { return }
        do {
            // Atomic write also supports replacement explicitly approved by NSSavePanel.
            try Data(contentsOf: entry.file).write(to: destination, options: .atomic)
        } catch { report("파일 저장 실패", error.localizedDescription) }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let entry = downloads.removeValue(forKey: ObjectIdentifier(download)) {
            try? FileManager.default.removeItem(at: entry.file)
        }
        report("다운로드 실패", error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        report("서버에 연결할 수 없습니다.", "서버에서 npm run dev 또는 npm start를 실행하고 메뉴의 새로고침을 선택하세요.\n서버 주소: \(baseURL)\n\(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        completionHandler(confirm(message))
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        report(message, "")
        completionHandler()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "print", message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, ServerAddress.isSameOrigin(url, as: baseURL) else { return }
        let operation = webView.printOperation(with: NSPrintInfo.shared)
        operation.runModal(for: window, delegate: nil, didRun: nil, contextInfo: nil)
    }
}
