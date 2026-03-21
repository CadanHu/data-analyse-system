import { registerPlugin } from '@capacitor/core'

export interface PdfExportPlugin {
  printHtml(options: { html: string; title: string }): Promise<void>
  createPdf(options: { html: string; title: string }): Promise<{ uri: string }>
}

const PdfExport = registerPlugin<PdfExportPlugin>('PdfExport')

export default PdfExport
