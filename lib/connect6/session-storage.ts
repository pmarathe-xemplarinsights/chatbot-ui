import { v4 as uuidv4 } from "uuid"

const SESSION_KEY = "connect6_session_id"
const CONNECTION_KEY = "connect6_connection_id"
/** From `create-chat-session` — use on the **next** `generate-token` only (not for WS body). */
const BAY6_SESSION_KEY = "connect6_bay6_session_id"
/** `session_id` last sent to `generate-token` for the active token — must match WebSocket `session_id`. */
const WS_PAYLOAD_SESSION_KEY = "connect6_ws_payload_session_id"

function conversationStorageKey(sessionId: string): string {
  return `connect6_conv_${sessionId}`
}

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return uuidv4()
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = uuidv4()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export function rotateConnectionId(): string {
  const id = uuidv4()
  if (typeof window !== "undefined") {
    sessionStorage.setItem(CONNECTION_KEY, id)
  }
  return id
}

export function getConnectionId(): string {
  if (typeof window === "undefined") return uuidv4()
  let id = sessionStorage.getItem(CONNECTION_KEY)
  if (!id) {
    id = rotateConnectionId()
  }
  return id
}

export function setBay6ServerSessionId(id: string): void {
  if (typeof window === "undefined") return
  sessionStorage.setItem(BAY6_SESSION_KEY, id.trim())
}

export function getBay6ServerSessionId(): string | null {
  if (typeof window === "undefined") return null
  const v = sessionStorage.getItem(BAY6_SESSION_KEY)
  return v?.trim() || null
}

export function setLastWsPayloadSessionId(id: string): void {
  if (typeof window === "undefined") return
  sessionStorage.setItem(WS_PAYLOAD_SESSION_KEY, id.trim())
}

export function getLastWsPayloadSessionId(): string | null {
  if (typeof window === "undefined") return null
  const v = sessionStorage.getItem(WS_PAYLOAD_SESSION_KEY)
  return v?.trim() || null
}

/**
 * Body `session_id` for `generate-token`: after the first `create-chat-session`, prefer Bay6's id
 * so the next token is issued for the same chat session. **WebSocket JSON must use the id from
 * the generate-token call that produced the URL token** (`getLastWsPayloadSessionId`).
 */
export function getSessionIdForBay6Api(): string {
  return getBay6ServerSessionId() ?? getOrCreateSessionId()
}

/** Stable thread id for Bay6 (must not reuse session_id — some gateways reject that pairing). */
export function getOrCreateConnect6ConversationId(sessionId: string): string {
  if (typeof window === "undefined") return uuidv4()
  const key = conversationStorageKey(sessionId)
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = uuidv4()
    sessionStorage.setItem(key, id)
  }
  return id
}

/** New UI chat → fresh Connect6 REST identity (after closing shared WS). */
export function resetConnect6BrowserSession(): void {
  if (typeof window === "undefined") return
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(CONNECTION_KEY)
  sessionStorage.removeItem(BAY6_SESSION_KEY)
  sessionStorage.removeItem(WS_PAYLOAD_SESSION_KEY)
  const keys: string[] = []
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i)
    if (k?.startsWith("connect6_conv_")) keys.push(k)
  }
  for (const k of keys) sessionStorage.removeItem(k)
}
