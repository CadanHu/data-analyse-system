package com.cadanhu.datapulse;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.DisplayMetrics;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "PdfExport")
public class PdfExportPlugin extends Plugin {

    @PluginMethod
    public void printHtml(final PluginCall call) {
        final String html = call.getString("html");
        if (html == null) {
            call.reject("Missing html parameter");
            return;
        }
        final String title = call.getString("title", "Report");

        getActivity().runOnUiThread(() -> {
            // 用 FrameLayout 承载 WebView，让 layout() 生效
            FrameLayout container = new FrameLayout(getContext());
            DisplayMetrics dm = getContext().getResources().getDisplayMetrics();
            // A4 宽度 794px @ 96dpi，按屏幕密度换算
            int a4Width  = Math.round(794 * dm.density);
            int a4Height = Math.round(1123 * dm.density);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(a4Width, a4Height);
            getActivity().addContentView(container, lp);

            WebView webView = new WebView(getContext());
            webView.setLayoutParams(new FrameLayout.LayoutParams(a4Width, a4Height));
            container.addView(webView);

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
            settings.setTextZoom(100);
            // 禁止加载任何网络资源（ECharts 已内联，不需要 CDN）
            settings.setBlockNetworkLoads(false); // 允许 data: / file:

            // 超时保障：30 秒后无论如何触发打印
            Handler timeoutHandler = new Handler(Looper.getMainLooper());
            final boolean[] resolved = {false};
            Runnable timeoutRunnable = () -> {
                if (!resolved[0]) {
                    resolved[0] = true;
                    triggerPrint(webView, title, call);
                    cleanup(container);
                }
            };
            timeoutHandler.postDelayed(timeoutRunnable, 30000);

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    String url = request.getUrl().toString();
                    // 拦截 CDN 请求，返回空响应（ECharts 应已内联）
                    if (url.contains("cdn.jsdelivr") || url.contains("unpkg.com") || url.contains("cdnjs.")) {
                        return new WebResourceResponse("text/javascript", "UTF-8",
                                new ByteArrayInputStream(new byte[0]));
                    }
                    return super.shouldInterceptRequest(view, request);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    // 等待 ECharts JS 执行完成（1.5 秒）
                    view.postDelayed(() -> {
                        if (!resolved[0]) {
                            resolved[0] = true;
                            timeoutHandler.removeCallbacks(timeoutRunnable);
                            triggerPrint(view, title, call);
                            cleanup(container);
                        }
                    }, 1500);
                }
            });

            webView.loadDataWithBaseURL("https://localhost", html, "text/html", "UTF-8", null);
        });
    }

    private void triggerPrint(WebView webView, String title, PluginCall call) {
        try {
            PrintManager printManager =
                (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            PrintAttributes attrs = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 600, 600))
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build();
            printManager.print(title, webView.createPrintDocumentAdapter(title), attrs);
            call.resolve();
        } catch (Exception e) {
            call.reject("Print failed: " + e.getMessage());
        }
    }

    private void cleanup(FrameLayout container) {
        // 从视图树中移除隐藏容器
        if (container.getParent() instanceof ViewGroup) {
            ((ViewGroup) container.getParent()).removeView(container);
        }
    }

    /**
     * 将本地文件以 PUT 方式上传到指定 URL（Aliyun OSS presigned URL）。
     * 不设置 Content-Type，保持与 OSS 预签名签名计算一致（空 Content-Type）。
     */
    @PluginMethod
    public void putFile(final PluginCall call) {
        final String urlString = call.getString("url");
        final String fileUriString = call.getString("fileUri");
        if (urlString == null || fileUriString == null) {
            call.reject("putFile: missing or invalid url/fileUri");
            return;
        }

        ExecutorService executor = Executors.newSingleThreadExecutor();
        executor.execute(() -> {
            HttpURLConnection conn = null;
            InputStream fileIn = null;
            try {
                // 解析 file:// URI，读取文件字节
                Uri fileUri = Uri.parse(fileUriString);
                File file = new File(fileUri.getPath());
                long fileSize = file.length();

                URL targetUrl = new URL(urlString);
                conn = (HttpURLConnection) targetUrl.openConnection();
                conn.setRequestMethod("PUT");
                conn.setDoOutput(true);
                conn.setFixedLengthStreamingMode(fileSize);
                // 显式设置空 Content-Type —— 阻止 OkHttp 注入默认值（如 application/octet-stream）
                // OSS presigned URL 签名按 Content-Type="" 计算，不匹配会导致 403
                conn.setRequestProperty("Content-Type", "");

                fileIn = new FileInputStream(file);
                OutputStream out = conn.getOutputStream();
                byte[] buf = new byte[8192];
                int read;
                while ((read = fileIn.read(buf)) != -1) {
                    out.write(buf, 0, read);
                }
                out.flush();

                int status = conn.getResponseCode();
                if (status >= 200 && status < 300) {
                    JSObject result = new JSObject();
                    result.put("status", status);
                    call.resolve(result);
                } else {
                    // 读取 OSS 错误响应体（XML），便于诊断签名不匹配等问题
                    String errBody = "";
                    try {
                        InputStream errStream = conn.getErrorStream();
                        if (errStream != null) {
                            byte[] errBuf = new byte[2048];
                            int errRead = errStream.read(errBuf);
                            if (errRead > 0) errBody = new String(errBuf, 0, errRead, "UTF-8");
                            errStream.close();
                        }
                    } catch (IOException ignored) {}
                    call.reject("putFile HTTP " + status + (errBody.isEmpty() ? "" : " | " + errBody));
                }
            } catch (IOException e) {
                call.reject("putFile error: " + e.getMessage());
            } finally {
                if (fileIn != null) { try { fileIn.close(); } catch (IOException ignored) {} }
                if (conn != null) { conn.disconnect(); }
            }
        });
        executor.shutdown();
    }
}
