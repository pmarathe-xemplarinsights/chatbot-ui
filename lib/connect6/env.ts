/** Connect6 PolicyBuddy POC — reads public env (browser-safe). */

export function isConnect6PocMode(): boolean {
  return process.env.NEXT_PUBLIC_CONNECT6_POC_MODE === "true"
}

export function getConnect6HttpBase(): string {
  return (
    process.env.NEXT_PUBLIC_CONNECT6_HTTP_BASE?.replace(/\/$/, "") ||
    "https://connect6dev.bay6.ai"
  )
}

/**
 * Dev REST (`connect6dev.bay6.ai`) uses `connect6-proapi` for WSS. Other HTTPS bases
 * default to same-host `wss://` / `ws://` unless `NEXT_PUBLIC_CONNECT6_WS_BASE` is set.
 */
export function getConnect6WsBase(): string {
  const explicit = process.env.NEXT_PUBLIC_CONNECT6_WS_BASE?.replace(/\/$/, "")
  if (explicit) return explicit

  const http = getConnect6HttpBase()
  try {
    const u = new URL(http)
    if (/connect6dev\.bay6\.ai$/i.test(u.hostname)) {
      return "wss://connect6-proapi.bay6.ai"
    }
    if (u.protocol === "https:") return `wss://${u.host}`
    if (u.protocol === "http:") return `ws://${u.host}`
  } catch {
    /* ignore */
  }
  return "wss://connect6-proapi.bay6.ai"
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

export function getConnect6ClientCode(): string {
  return process.env.NEXT_PUBLIC_CONNECT6_CLIENT_CODE || "POLICYBUDDY"
}

export function getConnect6ClientIdHeader(): string {
  return process.env.NEXT_PUBLIC_CONNECT6_CLIENT_ID || "24"
}

export function getConnect6PocWorkspaceId(): string {
  return process.env.NEXT_PUBLIC_CONNECT6_POC_WORKSPACE_ID || "connect6-poc"
}

/** Bay6 enc_version V2 (AES wire) — must match PolicyBuddy; enable explicitly. */
export function isConnect6Bay6Encrypt(): boolean {
  return process.env.NEXT_PUBLIC_CONNECT6_BAY6_ENCRYPT === "true"
}

/**
 * WebSocket `v6/chatbot_websocket` expects Bay6 wire sends separate from REST encryption.
 * Disable with `NEXT_PUBLIC_CONNECT6_WS_BAY6_ENCRYPT=false`.
 */
export function isConnect6WsBay6Encrypt(): boolean {
  const v = process.env.NEXT_PUBLIC_CONNECT6_WS_BAY6_ENCRYPT
  if (v === "false") return false
  if (v === "true") return true
  return true
}
