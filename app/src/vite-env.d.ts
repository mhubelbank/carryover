/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Dev-only convenience keys (see .env.local). Seed the two BYOK credentials
  // so local development can skip the Welcome screen. Never set in production.
  readonly VITE_DEV_ANTHROPIC_KEY?: string;
  readonly VITE_DEV_GITHUB_TOKEN?: string;
}
