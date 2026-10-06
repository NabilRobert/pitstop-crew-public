/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** "true" = serve keyword-optimizer fixtures instead of calling the API (dev only). */
  readonly VITE_KEYWORD_OPTIMIZER_FIXTURES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
