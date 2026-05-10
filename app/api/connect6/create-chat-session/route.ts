import {
  bay6EncryptWirePayload,
  parseBay6HttpResponseBody
} from "@/lib/connect6/bay6-crypto"
import {
  getConnect6ClientIdServer,
  getConnect6HttpBaseServer,
  isConnect6Bay6EncryptServer
} from "@/lib/connect6/server-env"
import { createResponse } from "@/lib/server/server-utils"
import { NextRequest } from "next/server"

export const runtime = "nodejs"

const HEADERS_PLAIN: Record<string, string> = {
  "Content-Type": "application/json",
  request_body_encrypted: "0",
  need_encrypted_response: "0",
  enc_version: "V2"
}

const HEADERS_ENCRYPT: Record<string, string> = {
  environment: "connect6",
  "Content-Type": "application/json",
  request_body_encrypted: "1",
  need_encrypted_response: "1",
  enc_version: "V2"
}

export async function POST(req: NextRequest) {
  let body: { token?: string }
  try {
    body = (await req.json()) as { token?: string }
  } catch {
    return createResponse({ message: "Invalid JSON body" }, 400)
  }

  if (!body.token || typeof body.token !== "string") {
    return createResponse({ message: "Missing token" }, 400)
  }

  const encryptedMode = isConnect6Bay6EncryptServer()
  const headers: Record<string, string> = {
    ...(encryptedMode ? HEADERS_ENCRYPT : HEADERS_PLAIN),
    client_id: getConnect6ClientIdServer()
  }

  const plain = { token: body.token }
  const bodyStr = encryptedMode
    ? JSON.stringify({ body: bay6EncryptWirePayload(plain) })
    : JSON.stringify(plain)

  const url = `${getConnect6HttpBaseServer()}/connect6/v1/create-chat-session`
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: bodyStr
  })

  const text = await res.text()
  let data: object
  try {
    const parsed = parseBay6HttpResponseBody(text, encryptedMode)
    data =
      parsed !== null && typeof parsed === "object"
        ? (parsed as object)
        : { result: parsed }
  } catch (e) {
    return createResponse(
      {
        message: `Connect6 create-chat-session parse/decrypt failed (${res.status}): ${e instanceof Error ? e.message : String(e)}`
      },
      res.status || 502
    )
  }

  return createResponse(data, res.status)
}
