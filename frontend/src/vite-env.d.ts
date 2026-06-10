/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full backend API base URL in production, e.g. https://host/api/v1.
   *  Unset in dev so requests use the relative "/api/v1" Vite proxy. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
