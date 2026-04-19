/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHEET_WEBAPP_URL: string;
  readonly VITE_CHAT_API_URL?: string;
  readonly VITE_CHAT_API_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
