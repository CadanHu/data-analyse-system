import Foundation
import Capacitor

/// 原生 HTTP 插件，用于在 iOS 上执行 WKWebView 无法完成的二进制文件上传。
///
/// 背景：CapacitorHttp 的 dataType:'file' 在 iOS 上通过 httpBodyStream + InputStream(url:)
/// 实现，实际上发送 0 字节（Aliyun OSS presigned PUT 不支持 chunked transfer）。
/// URLSession.uploadTask(with:fromFile:) 才是 iOS 官方推荐的文件上传 API，
/// 会正确读取文件、自动设置 Content-Length，确保二进制内容完整传输。
@objc(NativeHttpPlugin)
public class NativeHttpPlugin: CAPPlugin {

    /// 将本地文件以 PUT 方式上传到指定 URL（如 Aliyun OSS presigned URL）。
    ///
    /// 参数：
    ///   - url (String): 目标 URL（presigned PUT URL）
    ///   - fileUri (String): 本地文件的 file:// URI（由 Capacitor Filesystem 返回）
    ///
    /// 返回：{ status: Int }
    @objc func putFile(_ call: CAPPluginCall) {
        guard
            let urlString = call.getString("url"),
            let fileUriString = call.getString("fileUri"),
            let targetUrl = URL(string: urlString),
            let fileUrl = URL(string: fileUriString)
        else {
            call.reject("putFile: missing or invalid 'url' / 'fileUri' parameter")
            return
        }

        var request = URLRequest(url: targetUrl)
        request.httpMethod = "PUT"

        // 从文件属性中读取大小并设置 Content-Length
        // OSS presigned PUT 要求 Content-Length，否则以 chunked 方式发送会导致存储 0 字节
        let filePath = fileUrl.path
        if let attrs = try? FileManager.default.attributesOfItem(atPath: filePath),
           let size = attrs[.size] as? Int {
            request.setValue(String(size), forHTTPHeaderField: "Content-Length")
        }

        // uploadTask(with:fromFile:) 是 iOS 官方文件上传 API：
        //   - 正确读取磁盘文件，发送完整二进制内容
        //   - 与 httpBodyStream 不同，不会产生空 body
        URLSession.shared.uploadTask(with: request, fromFile: fileUrl) { data, response, error in
            if let error = error {
                call.reject("putFile upload error: \(error.localizedDescription)")
                return
            }
            guard let httpResponse = response as? HTTPURLResponse else {
                call.reject("putFile: no HTTP response")
                return
            }
            if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                call.resolve(["status": httpResponse.statusCode])
            } else {
                let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                call.reject("putFile HTTP \(httpResponse.statusCode): \(body)")
            }
        }.resume()
    }
}
