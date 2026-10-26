/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_LICENSE_PUBLIC_KEY?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_SUPPORT_CONTACT?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
