#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PdfExportPlugin, "PdfExport",
    CAP_PLUGIN_METHOD(printHtml, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(createPdf, CAPPluginReturnPromise);
)
