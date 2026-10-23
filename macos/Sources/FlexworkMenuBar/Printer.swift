import AppKit
import PDFKit
import WebKit

// WebKit is only an offscreen print renderer, never the menu-bar user interface.
//
// WKWebView.printOperation produces blank pages for a web view that is not in a
// window: it has no laid-out content to paginate. Render the page to PDF first
// (createPDF works offscreen), then print that PDF through PDFKit.
//
// createPDF ignores the page box from @page and emits one page the size of the
// web view, so the form's margins live in the print CSS and the PDF is scaled
// down onto A4. The view keeps A4's aspect ratio, making that scale uniform.
@MainActor
final class Printer: NSObject, WKNavigationDelegate {
    private let view: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        return WKWebView(frame: NSRect(x: 0, y: 0, width: 673, height: 950), configuration: configuration)
    }()
    private var completion: ((Error?) -> Void)?

    enum PrintError: LocalizedError {
        case unreadablePDF
        case noPrintOperation
        var errorDescription: String? { "인쇄 양식을 PDF로 만들지 못했습니다." }
    }

    func printHTML(_ html: String, completion: @escaping (Error?) -> Void) {
        self.completion = completion
        view.navigationDelegate = self
        view.loadHTMLString(html, baseURL: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.createPDF(configuration: WKPDFConfiguration()) { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let error): self.finish(error)
            case .success(let data): self.printPDF(data)
            }
        }
    }

    private func printPDF(_ data: Data) {
        guard let document = PDFDocument(data: data) else { return finish(PrintError.unreadablePDF) }
        NSApp.activate(ignoringOtherApps: true)
        let info = NSPrintInfo()
        info.paperSize = NSSize(width: 595.28, height: 841.89) // A4, points
        // Margins belong to the print CSS; the PDF already carries them.
        info.topMargin = 0
        info.bottomMargin = 0
        info.leftMargin = 0
        info.rightMargin = 0
        info.isHorizontallyCentered = true
        guard let operation = document.printOperation(for: info, scalingMode: .pageScaleDownToFit, autoRotate: false)
        else { return finish(PrintError.noPrintOperation) }
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
