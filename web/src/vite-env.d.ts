/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CANVAS_USE_MOCKS?: string
  readonly VITE_CANVAS_USE_MOCK_API?: string
  readonly VITE_CANVAS_API_BASE_URL?: string
  readonly VITE_COGNITO_USER_POOL_ID?: string
  readonly VITE_COGNITO_APP_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
