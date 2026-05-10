/** Connect6 PolicyBuddy POC — reads public env (browser-safe). */

/**
 * Skip Supabase login/workspace DB and use mocked POC workspace + Connect6 routing.
 *
 * Enabled when any of:
 * - `NEXT_PUBLIC_CONNECT6_POC_MODE=true` or `NEXT_PUBLIC_SKIP_SUPABASE_AUTH=true`
 * - `NEXT_PUBLIC_CONNECT6_HTTP_BASE` is **set** (non-empty) — typical Connect6 `.env.local`
 *
 * Disable for hybrid (Supabase login + Connect6): `NEXT_PUBLIC_REQUIRE_SUPABASE_AUTH=true`
 */
export function connect6SkipsSupabaseAuth(): boolean {
  if (
    process.env.NEXT_PUBLIC_CONNECT6_POC_MODE === "true" ||
    process.env.NEXT_PUBLIC_SKIP_SUPABASE_AUTH === "true"
  ) {
    return true
  }
  if (process.env.NEXT_PUBLIC_REQUIRE_SUPABASE_AUTH === "true") {
    return false
  }
  return Boolean(process.env.NEXT_PUBLIC_CONNECT6_HTTP_BASE?.trim())
}

export function isConnect6PocMode(): boolean {
  return connect6SkipsSupabaseAuth()
}

export function getConnect6HttpBase(): string {
  return (
    process.env.NEXT_PUBLIC_CONNECT6_HTTP_BASE?.replace(/\/$/, "") ||
    "https://connect6dev.bay6.ai"
  )
}

/**
 * WebSocket host must pair with REST (`angular-chatbot-connet6_chatbot_dev` env files):
 * - connect6dev HTTP → wss://connect6-prodev.bay6.ai (not proapi)
 * - connect6qa HTTP → wss://connect6-proqa.bay6.ai
 * - connect6-api HTTP → wss://connect6-proapi.bay6.ai
 * Override anytime with NEXT_PUBLIC_CONNECT6_WS_BASE.
 */
export function getConnect6WsBase(): string {
  const explicit = process.env.NEXT_PUBLIC_CONNECT6_WS_BASE?.replace(/\/$/, "")
  if (explicit) return explicit

  const http = getConnect6HttpBase()
  try {
    const u = new URL(http)
    if (/connect6dev\.bay6\.ai$/i.test(u.hostname)) {
      return "wss://connect6-prodev.bay6.ai"
    }
    if (/connect6qa\.bay6\.ai$/i.test(u.hostname)) {
      return "wss://connect6-proqa.bay6.ai"
    }
    if (/connect6-api\.bay6\.ai$/i.test(u.hostname)) {
      return "wss://connect6-proapi.bay6.ai"
    }
    if (u.protocol === "https:") return `wss://${u.host}`
    if (u.protocol === "http:") return `ws://${u.host}`
  } catch {
    /* ignore */
  }
  return "wss://connect6-prodev.bay6.ai"
}

export function getConnect6AccessKey(): string {
  return process.env.NEXT_PUBLIC_CONNECT6_ACCESS_KEY || ""
}

export function getConnect6SecretKey(): string {
  return process.env.NEXT_PUBLIC_CONNECT6_SECRET_KEY || ""
}

/**
 * True when NEXT_PUBLIC_* keys exist in the client bundle.
 * Server-side keys (CONNECT6_ACCESS_KEY / CONNECT6_SECRET_KEY) are resolved via /api/connect6/* — use GET /api/connect6/status for that.
 */
export function isConnect6Configured(): boolean {
  return Boolean(getConnect6AccessKey() && getConnect6SecretKey())
}

/**
 * `DOXI` in JSON payloads is normalized to `DOX` (Angular chatbot-model).
 * The WebSocket **URL path** must use the raw `client_code` from generate-token (often `DOXI`).
 */
export function normalizeConnect6ClientCode(code: string): string {
  const t = code.trim()
  if (t.toUpperCase() === "DOXI") return "DOX"
  return t
}

/** Env default without DOXI→DOX — used for WS path fallback when token omits client_code. */
export function getConnect6ClientCodeRaw(): string {
  return (process.env.NEXT_PUBLIC_CONNECT6_CLIENT_CODE || "POLICYBUDDY").trim()
}

export function getConnect6ClientCode(): string {
  return normalizeConnect6ClientCode(getConnect6ClientCodeRaw())
}

export function getConnect6ClientIdHeader(): string {
  return process.env.NEXT_PUBLIC_CONNECT6_CLIENT_ID || "24"
}

export function getConnect6PocWorkspaceId(): string {
  return process.env.NEXT_PUBLIC_CONNECT6_POC_WORKSPACE_ID || "connect6-poc"
}

/**
 * Angular `websocket.service` opens WS right after generate-token (no create-chat-session).
 * Postman / some stacks need create-chat-session with `{ token }` first.
 *
 * Default: skip on `connect6dev.bay6.ai`. Force: `NEXT_PUBLIC_CONNECT6_CREATE_CHAT_SESSION=true`.
 * Opt-out elsewhere: `NEXT_PUBLIC_CONNECT6_SKIP_CREATE_CHAT_SESSION=true`.
 */
export function connect6ShouldCreateChatSessionBeforeWs(): boolean {
  if (process.env.NEXT_PUBLIC_CONNECT6_SKIP_CREATE_CHAT_SESSION === "true") {
    return false
  }
  if (process.env.NEXT_PUBLIC_CONNECT6_CREATE_CHAT_SESSION === "true") {
    return true
  }
  try {
    const u = new URL(getConnect6HttpBase())
    if (/connect6dev\.bay6\.ai$/i.test(u.hostname)) {
      return false
    }
  } catch {
    /* ignore */
  }
  return true
}

/** Bay6 enc_version V2 (AES wire) — must match PolicyBuddy; enable explicitly. */
export function isConnect6Bay6Encrypt(): boolean {
  return process.env.NEXT_PUBLIC_CONNECT6_BAY6_ENCRYPT === "true"
}

/**
 * WebSocket `v6/chatbot_websocket` wire encryption is independent of REST.
 * Explicit env wins; otherwise follow `NEXT_PUBLIC_CONNECT6_BAY6_ENCRYPT`, else plain WS.
 * (Plain REST + encrypted WS by default caused Bay6 to accept tokens then reply "Closing connection…".)
 */
export function isConnect6WsBay6Encrypt(): boolean {
  const v = process.env.NEXT_PUBLIC_CONNECT6_WS_BAY6_ENCRYPT
  if (v === "false") return false
  if (v === "true") return true
  return process.env.NEXT_PUBLIC_CONNECT6_BAY6_ENCRYPT === "true"
}
