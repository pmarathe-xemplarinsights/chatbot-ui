import { v4 as uuidv4 } from "uuid"

const SESSION_KEY = "connect6_session_id"
const CONNECTION_KEY = "connect6_connection_id"

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
  const keys: string[] = []
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i)
    if (k?.startsWith("connect6_conv_")) keys.push(k)
  }
  for (const k of keys) sessionStorage.removeItem(k)
}
