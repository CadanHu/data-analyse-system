import Foundation
import Capacitor
import WebKit
import UIKit

@objc(PdfExportPlugin)
public class PdfExportPlugin: CAPPlugin {

    /// 将 HTML 渲染为 PDF 文件，返回文件 URI 供 JS 侧分享
    @available(iOS 14.0, *)
    @objc func createPdf(_ call: CAPPluginCall) {
        guard let html = call.getString("html") else {
            call.reject("Missing html parameter")
            return
        }
        let title = call.getString("title") ?? "Report"

        DispatchQueue.main.async {
            let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 794, height: 1123))
            webView.isHidden = true

            if let window = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first?.windows.first {
                window.addSubview(webView)
            }

            class PdfNavHandler: NSObject, WKNavigationDelegate {
                let onFinished: () -> Void
                init(onFinished: @escaping () -> Void) { self.onFinished = onFinished }
                func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
                    // 等待 ECharts 渲染完成
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                        self.onFinished()
                    }
                }
            }

            let handler = PdfNavHandler {
                if #available(iOS 14.0, *) {
                    let config = WKPDFConfiguration()
                    webView.createPDF(configuration: config) { result in
                        webView.removeFromSuperview()
                        switch result {
                        case .success(let data):
                            let safeTitle = title.replacingOccurrences(of: "/", with: "_")
                            let fileName = "\(safeTitle)_\(Int(Date().timeIntervalSince1970)).pdf"
                            let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
                            let tempURL = cacheDir.appendingPathComponent(fileName)
                            do {
                                try data.write(to: tempURL)
                                call.resolve(["uri": tempURL.absoluteString])
                            } catch {
                                call.reject("Write PDF failed: \(error.localizedDescription)")
                            }
                        case .failure(let error):
                            call.reject("createPDF failed: \(error.localizedDescription)")
                        }
                    }
                }
            }
            webView.navigationDelegate = handler
            objc_setAssociatedObject(webView, "pdfNavHandler", handler, .OBJC_ASSOCIATION_RETAIN)
            webView.loadHTMLString(html, baseURL: URL(string: "https://localhost"))
        }
    }

    @objc func printHtml(_ call: CAPPluginCall) {
        guard let html = call.getString("html") else {
            call.reject("Missing html parameter")
            return
        }
        let title = call.getString("title") ?? "Report"

        DispatchQueue.main.async {
            let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 794, height: 1123))
            webView.isHidden = true

            if let window = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first?.windows.first {
                window.addSubview(webView)
            }

            var resolved = false

            DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
                if !resolved {
                    resolved = true
                    self.triggerPrint(webView: webView, title: title, call: call)
                }
            }

            class NavigationHandler: NSObject, WKNavigationDelegate {
                let onFinished: () -> Void
                init(onFinished: @escaping () -> Void) { self.onFinished = onFinished }
                func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                        self.onFinished()
                    }
                }
            }

            let handler = NavigationHandler {
                if !resolved {
                    resolved = true
                    self.triggerPrint(webView: webView, title: title, call: call)
                }
            }
            webView.navigationDelegate = handler
            objc_setAssociatedObject(webView, "navHandler", handler, .OBJC_ASSOCIATION_RETAIN)

            webView.loadHTMLString(html, baseURL: URL(string: "https://localhost"))
        }
    }

    private func triggerPrint(webView: WKWebView, title: String, call: CAPPluginCall) {
        DispatchQueue.main.async {
            let printController = UIPrintInteractionController.shared
            let printInfo = UIPrintInfo.printInfo()
            printInfo.jobName = title
            printInfo.outputType = .general
            printController.printInfo = printInfo
            printController.printFormatter = webView.viewPrintFormatter()

            printController.present(animated: true) { _, _, error in
                webView.removeFromSuperview()
                if let error = error {
                    call.reject("Print failed: \(error.localizedDescription)")
                } else {
                    call.resolve()
                }
            }
        }
    }
}
