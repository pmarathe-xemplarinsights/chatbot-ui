import type { ChatMessage } from "@/types"
import type React from "react"
import { v4 as uuidv4 } from "uuid"
import {
  getConnect6ClientCode,
  getConnect6HttpBase,
  getConnect6WsBase,
  isConnect6Bay6Encrypt,
  isConnect6WsBay6Encrypt
} from "./env"
import {
  BAY6_ENC_SEPARATOR,
  bay6DecryptMaybeJson,
  bay6EncryptWirePayload,
  normalizeBay6WireInput
} from "./bay6-crypto"
import {
  getConnectionId,
  getOrCreateSessionId,
  rotateConnectionId
} from "./session-storage"

/** Browser-only diagnostics (explicit console.log for DevTools filtering). */
function c6log(...args: unknown[]) {
  if (typeof window !== "undefined") {
    console.log("[Connect6]", ...args)
  }
}

function maskToken(t: string): string {
  if (!t || t.length <= 8) return "(token hidden)"
  return `${t.slice(0, 8)}…${t.slice(-4)}`
}

function wireDecryptCandidates(textPayload: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const pushNorm = (raw: string) => {
    const n = normalizeBay6WireInput(raw)
    if (!n.includes(BAY6_ENC_SEPARATOR) || seen.has(n)) return
    seen.add(n)
    out.push(n)
  }

  const trimmed = textPayload.trim()
  try {
    const j = JSON.parse(trimmed) as Record<string, unknown>
    if (j && typeof j === "object" && !Array.isArray(j)) {
      for (const key of [
        "body",
        "data",
        "payload",
        "encrypted_body",
        "enc_payload"
      ] as const) {
        const v = j[key]
        if (typeof v === "string") pushNorm(v)
      }
    }
  } catch {
    /* not JSON */
  }

  pushNorm(textPayload)
  return out
}

function sessionTimeStamp(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function browserUniqueId(): string {
  if (typeof window === "undefined") return uuidv4()
  const k = "connect6_browser_uid"
  let id = localStorage.getItem(k)
  if (!id) {
    id = uuidv4()
    localStorage.setItem(k, id)
  }
  return id
}

interface GenerateTokenResponse {
  success?: number | boolean | string
  token?: string
  client_code?: string
  message?: string
}

let sharedSocket: WebSocket | null = null
let sharedWsToken: string | null = null
let sharedClientCode: string | null = null

type PendingReply = {
  chunks: string[]
  resolve: (fullText: string) => void
  reject: (err: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
  flushUi: () => void
}

let pending: PendingReply | null = null

function closeSharedSocket() {
  if (sharedSocket) {
    sharedSocket.onclose = null
    sharedSocket.onmessage = null
    sharedSocket.onerror = null
    try {
      sharedSocket.close()
    } catch {
      /* ignore */
    }
    sharedSocket = null
  }
  sharedWsToken = null
  sharedClientCode = null
}

export function resetConnect6Connection(): void {
  closeSharedSocket()
}

async function generateToken(
  sessionId: string,
  connectionId: string
): Promise<GenerateTokenResponse> {
  c6log(
    "generate-token → POST /api/connect6/generate-token (server adds access_key / secret_key from .env)",
    "Bay6:",
    `${getConnect6HttpBase()}/connect6/v1/generate-token`
  )

  const body = {
    session_id: sessionId,
    connection_id: connectionId,
    privacy_policy: 1,
    kw_args: {
      user_context: {}
    },
    meta_data: {
      latitude: "",
      longitude: "",
      browser_unique_identifier: browserUniqueId(),
      ip_address: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      session_time: sessionTimeStamp(),
      hostUrl: typeof window !== "undefined" ? window.location.origin : "",
      website_url: typeof window !== "undefined" ? window.location.href : ""
    }
  }

  const res = await fetch("/api/connect6/generate-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })

  const data = (await res.json()) as GenerateTokenResponse & {
    message?: string
  }
  if (!res.ok) {
    throw new Error(
      data.message ||
        `Connect6 generate-token failed (${res.status}). Set CONNECT6_ACCESS_KEY and CONNECT6_SECRET_KEY in .env.local (server-only), or NEXT_PUBLIC_CONNECT6_ACCESS_KEY / SECRET_KEY, then restart dev.`
    )
  }
  return data
}

async function createChatSession(token: string): Promise<void> {
  console.log(
    "[Connect6] create-chat-session → POST /api/connect6/create-chat-session",
    "Bay6:",
    `${getConnect6HttpBase()}/connect6/v1/create-chat-session`,
    "token:",
    maskToken(token)
  )
  const res = await fetch("/api/connect6/create-chat-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  })
  const data = (await res.json()) as { message?: string }
  if (!res.ok) {
    throw new Error(
      data.message || `Connect6 create-chat-session failed (${res.status})`
    )
  }
}

function websocketUrl(token: string, clientCode: string): string {
  const base = getConnect6WsBase()
  const path = `/v6/chatbot_websocket/${clientCode}?token=${encodeURIComponent(token)}`
  return `${base}${path}`
}

async function ensureWebSocket(
  token: string,
  clientCode: string,
  signal: AbortSignal
): Promise<WebSocket> {
  if (
    sharedSocket?.readyState === WebSocket.OPEN &&
    sharedWsToken === token &&
    sharedClientCode === clientCode
  ) {
    return sharedSocket
  }

  closeSharedSocket()

  const url = websocketUrl(token, clientCode)
  console.log(
    "[Connect6] v6/chatbot_websocket → connecting WebSocket",
    url.replace(/token=[^&]+/, `token=${maskToken(token)}`),
    "(not /api/chat/*)"
  )
  const ws = new WebSocket(url)
  sharedSocket = ws
  sharedWsToken = token
  sharedClientCode = clientCode

  ws.onmessage = async event => {
    let raw: unknown = event.data
    if (raw instanceof Blob) {
      raw = await raw.text()
    } else if (raw instanceof ArrayBuffer) {
      raw = new TextDecoder().decode(raw)
    }
    let textPayload: string
    if (typeof raw === "string") {
      textPayload = raw
      const inboundLooksEncrypted =
        isConnect6WsBay6Encrypt() || textPayload.includes(BAY6_ENC_SEPARATOR)
      if (inboundLooksEncrypted) {
        const candidates = wireDecryptCandidates(textPayload)
        let decrypted = false
        for (const c of candidates) {
          try {
            const dec = bay6DecryptMaybeJson(c)
            textPayload =
              typeof dec === "object" && dec !== null
                ? JSON.stringify(dec)
                : String(dec)
            decrypted = true
            break
          } catch (err) {
            c6log("Bay6 decrypt inbound attempt failed", err)
          }
        }
        if (
          !decrypted &&
          (isConnect6Bay6Encrypt() || isConnect6WsBay6Encrypt())
        ) {
          c6log(
            "Bay6 decrypt inbound: no candidate succeeded; showing raw frame"
          )
        }
      }
      let parsed: Record<string, unknown> | null = null
      try {
        parsed = JSON.parse(textPayload) as Record<string, unknown>
      } catch {
        /* ignore */
      }
      c6log("WebSocket inbound", {
        decryptAttempted: inboundLooksEncrypted,
        outboundEncrypted: isConnect6WsBay6Encrypt(),
        bytes: textPayload.length,
        type: parsed?.type,
        keys:
          parsed && typeof parsed === "object"
            ? Object.keys(parsed).slice(0, 12)
            : undefined,
        has_response_chunk: typeof parsed?.response_chunk === "string",
        has_complete_response: Boolean(parsed?.complete_response)
      })
      handleWsMessage(textPayload)
    } else {
      c6log("WebSocket inbound (unexpected type)", typeof raw)
      handleWsMessage(raw)
    }
  }

  ws.onclose = ev => {
    c6log("WebSocket close", {
      code: ev.code,
      reason: ev.reason || "(none)",
      wasClean: ev.wasClean,
      hadPending: Boolean(pending),
      chunkCount: pending?.chunks.length ?? 0
    })
    if (sharedSocket === ws) {
      sharedSocket = null
      sharedWsToken = null
      sharedClientCode = null
    }
    if (pending) {
      const assembled = pending.chunks.join("")
      clearTimeout(pending.timeoutId)
      // Bay6 often streams chunks then closes without [END] / complete_response — keep partial text.
      if (assembled.trim().length > 0) {
        pending.resolve(assembled)
      } else {
        pending.reject(
          new Error(
            `WebSocket closed before any reply (code ${ev.code}${ev.reason ? `: ${ev.reason}` : ""}). Check NEXT_PUBLIC_CONNECT6_WS_BASE and client_code; see [Connect6] logs for inbound shapes.`
          )
        )
      }
      pending = null
    }
  }

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal.addEventListener("abort", onAbort)
    ws.onopen = () => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }
    ws.onerror = () => {
      signal.removeEventListener("abort", onAbort)
      reject(new Error("WebSocket connection failed"))
    }
  })

  return ws
}

function parseWsPayload(raw: unknown): unknown {
  if (typeof raw !== "string") return raw
  const s = raw.trim()
  if (!s || s === "[END]") return s
  try {
    return JSON.parse(s)
  } catch {
    return raw
  }
}

function extractTextChunk(msg: Record<string, unknown>): string {
  const candidates = [
    msg.response_chunk,
    msg.agent_response,
    msg.text,
    msg.content,
    msg.message,
    msg.delta,
    msg.output,
    msg.answer,
    msg.bot_response
  ]
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c
  }
  const nested = msg.data
  if (nested && typeof nested === "object" && nested !== null) {
    const d = nested as Record<string, unknown>
    for (const key of ["text", "content", "message", "response"] as const) {
      const v = d[key]
      if (typeof v === "string" && v.length > 0) return v
    }
  }
  return ""
}

function isStreamComplete(msg: Record<string, unknown>): boolean {
  if (msg.complete_response === true) return true
  if (
    typeof msg.complete_response === "string" &&
    msg.complete_response.length > 0
  )
    return true
  if (
    msg.complete_response != null &&
    typeof msg.complete_response === "object"
  )
    return true
  if (msg.end_of_stream === true || msg.stream_complete === true) return true
  if (msg.type === "complete" || msg.event === "complete") return true
  if (msg.type === "end" || msg.event === "end") return true
  return false
}

function handleWsMessage(raw: unknown) {
  if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (trimmed && trimmed !== "[END]" && !trimmed.startsWith("{")) {
      if (pending) {
        pending.chunks.push(trimmed)
        pending.flushUi()
      }
      return
    }
  }

  const data = parseWsPayload(raw)

  if (data === "[END]" || raw === "[END]") {
    if (pending) {
      clearTimeout(pending.timeoutId)
      const text = pending.chunks.join("")
      pending.resolve(text)
      pending = null
    }
    return
  }

  if (!pending || typeof data !== "object" || data === null) return

  const msg = data as Record<string, unknown>

  if (msg.type === "pong") return

  if (msg.type === "error" || msg.error) {
    const errText =
      typeof msg.message === "string"
        ? msg.message
        : typeof msg.error === "string"
          ? msg.error
          : JSON.stringify(msg.error ?? msg)
    c6log("WebSocket server error payload", msg)
    clearTimeout(pending.timeoutId)
    pending.reject(new Error(`Connect6 WebSocket error: ${errText}`))
    pending = null
    return
  }

  const chunk = extractTextChunk(msg)

  const thinking =
    typeof msg.thinking_update === "string" ? msg.thinking_update : ""
  if (thinking) {
    pending.chunks.push(thinking + "\n")
    pending.flushUi()
  }

  if (chunk) {
    pending.chunks.push(chunk)
    pending.flushUi()
  }

  if (isStreamComplete(msg)) {
    clearTimeout(pending.timeoutId)
    const full =
      typeof msg.complete_response === "string" &&
      msg.complete_response.length > 0
        ? msg.complete_response
        : pending.chunks.join("")
    pending.resolve(full)
    pending = null
  }
}

function buildUserPayload(
  sessionId: string,
  userMessage: string,
  conversationId: string,
  clientCode: string
) {
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, "0")
  const local =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  return {
    session_id: sessionId,
    request_id: uuidv4(),
    client_code: clientCode === "DOXI" ? "DOX" : clientCode,
    request_to_generate_greeting_message: 0,
    user_message: userMessage,
    session_attributes: {
      conversation_with_csr: ""
    },
    user_message_date_and_time: local,
    user_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    conversation_id: conversationId,
    language_code: "en",
    kw_args: {
      user_context: {},
      company_domain: "AI Solutions",
      internet_fallback_enabled: "1"
    }
  }
}

export async function handleConnect6Chat(
  messageContent: string,
  tempAssistantChatMessage: ChatMessage,
  controller: AbortController,
  setFirstTokenReceived: React.Dispatch<React.SetStateAction<boolean>>,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setToolInUse: React.Dispatch<React.SetStateAction<string>>
): Promise<string> {
  c6log(
    "Starting Connect6 chat turn — REST generate-token + create-chat-session, then WebSocket v6/chatbot_websocket (no /api/chat/*)"
  )
  const signal = controller.signal
  setToolInUse("none")

  const sessionId = getOrCreateSessionId()

  let ws: WebSocket
  let clientCodeForPayload: string

  if (
    sharedSocket?.readyState === WebSocket.OPEN &&
    sharedWsToken &&
    sharedClientCode
  ) {
    ws = sharedSocket
    clientCodeForPayload = sharedClientCode
    c6log(
      "Reusing existing WebSocket session (skipping generate-token / create-chat-session this turn)"
    )
  } else {
    let connectionId = getConnectionId()

    let tokenRes = await generateToken(sessionId, connectionId)
    const ok = (s: GenerateTokenResponse) =>
      (s.success === 1 || s.success === true || s.success === "1") && !!s.token

    if (!ok(tokenRes)) {
      rotateConnectionId()
      connectionId = getConnectionId()
      tokenRes = await generateToken(sessionId, connectionId)
    }

    if (!ok(tokenRes)) {
      throw new Error(
        tokenRes.message || "generate-token did not return success"
      )
    }

    const token = tokenRes.token as string
    clientCodeForPayload = tokenRes.client_code || getConnect6ClientCode()

    await createChatSession(token)

    ws = await ensureWebSocket(token, clientCodeForPayload, signal)
    c6log(
      "REST steps complete; WebSocket ready for client_code=",
      clientCodeForPayload
    )
  }
  const payload = buildUserPayload(
    sessionId,
    messageContent,
    sessionId,
    clientCodeForPayload
  )
  c6log("WebSocket outbound JSON (user_message preview)", {
    session_id: payload.session_id,
    conversation_id: payload.conversation_id,
    client_code: payload.client_code,
    user_message_preview:
      messageContent.length > 120
        ? `${messageContent.slice(0, 120)}…`
        : messageContent
  })
  const assistantId = tempAssistantChatMessage.message.id

  const replyPromise = new Promise<string>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (pending) {
        pending.reject(new Error("Connect6 reply timed out"))
        pending = null
      }
    }, 180_000)

    const flushUi = () => {
      setFirstTokenReceived(true)
      const text = pending?.chunks.join("") ?? ""
      setChatMessages(prev =>
        prev.map(cm =>
          cm.message.id === assistantId
            ? { ...cm, message: { ...cm.message, content: text } }
            : cm
        )
      )
    }

    pending = {
      chunks: [],
      resolve: text => {
        clearTimeout(timeoutId)
        resolve(text)
      },
      reject: err => {
        clearTimeout(timeoutId)
        reject(err)
      },
      timeoutId,
      flushUi
    }
  })

  signal.addEventListener(
    "abort",
    () => {
      if (pending) {
        clearTimeout(pending.timeoutId)
        pending.reject(new Error("Aborted"))
        pending = null
      }
      closeSharedSocket()
    },
    { once: true }
  )

  const outbound = isConnect6WsBay6Encrypt()
    ? bay6EncryptWirePayload(payload)
    : JSON.stringify(payload)
  ws.send(outbound)
  c6log(
    "WebSocket send() complete;",
    isConnect6WsBay6Encrypt() ? "encrypted wire payload" : "plain JSON",
    "— waiting for streamed chunks / complete_response"
  )

  const fullText = await replyPromise

  c6log("Connect6 reply finished; length=", fullText.length)

  setChatMessages(prev =>
    prev.map(cm =>
      cm.message.id === assistantId
        ? { ...cm, message: { ...cm.message, content: fullText } }
        : cm
    )
  )

  return fullText
}
