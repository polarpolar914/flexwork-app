import AppKit
import WebKit

// WebKit is only an offscreen print renderer, never the menu-bar user interface.
@MainActor
final class Printer: NSObject, WKNavigationDelegate {
    private let view: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        return WKWebView(frame: NSRect(x: 0, y: 0, width: 673, height: 950), configuration: configuration)
    }()
    private var completion: ((Error?) -> Void)?

    func printHTML(_ html: String, completion: @escaping (Error?) -> Void) {
        self.completion = completion
        view.navigationDelegate = self
        view.loadHTMLString(html, baseURL: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        NSApp.activate(ignoringOtherApps: true)
        let info = NSPrintInfo()
        info.paperSize = NSSize(width: 595.28, height: 841.89) // A4, points
        info.topMargin = 51.02
        info.bottomMargin = 51.02
        info.leftMargin = 45.35
        info.rightMargin = 45.35
        info.isHorizontallyCentered = true
        let operation = webView.printOperation(with: info)
        operation.showsPrintPanel = true
        operation.showsProgressPanel = true
        operation.run()
        completion?(nil)
        completion = nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(error) }
    private func finish(_ error: Error) { completion?(error); completion = nil }
}
