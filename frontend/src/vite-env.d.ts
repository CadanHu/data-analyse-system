/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ENABLE_V2_PREVIEW?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
