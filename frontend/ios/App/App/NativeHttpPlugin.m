#import <Capacitor/Capacitor.h>

// 注册 NativeHttp 插件，提供原生 HTTP 方法绕过 WKWebView 限制
CAP_PLUGIN(NativeHttpPlugin, "NativeHttp",
    CAP_PLUGIN_METHOD(putFile, CAPPluginReturnPromise);
)
