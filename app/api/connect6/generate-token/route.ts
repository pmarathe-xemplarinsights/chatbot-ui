import {
  bay6EncryptWirePayload,
  parseBay6HttpResponseBody
} from "@/lib/connect6/bay6-crypto"
import {
  getConnect6AccessKeyServer,
  getConnect6HttpBaseServer,
  getConnect6SecretKeyServer,
  isConnect6Bay6EncryptServer,
  isConnect6ConfiguredServer
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
  if (!isConnect6ConfiguredServer()) {
    return createResponse(
      {
        message:
          "Bay6 generate-token requires access_key + secret_key (see postman/). " +
          "Add CONNECT6_ACCESS_KEY and CONNECT6_SECRET_KEY to .env.local, restart dev. GET /api/connect6/debug"
      },
      400
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return createResponse({ message: "Invalid JSON body" }, 400)
  }

  const access = getConnect6AccessKeyServer()
  const secret = getConnect6SecretKeyServer()

  const plainPayload = {
    session_id: body.session_id,
    connection_id: body.connection_id,
    access_key: access,
    secret_key: secret,
    privacy_policy: body.privacy_policy ?? 1,
    kw_args: body.kw_args ?? { user_context: {} },
    meta_data: body.meta_data ?? {}
  }

  const encryptedMode = isConnect6Bay6EncryptServer()
  const headers = encryptedMode ? HEADERS_ENCRYPT : HEADERS_PLAIN
  const bodyStr = encryptedMode
    ? JSON.stringify({ body: bay6EncryptWirePayload(plainPayload) })
    : JSON.stringify(plainPayload)

  const url = `${getConnect6HttpBaseServer()}/connect6/v1/generate-token`
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
        : { _unexpected: parsed }
  } catch (e) {
    return createResponse(
      {
        message: `Connect6 generate-token parse/decrypt failed (${res.status}): ${e instanceof Error ? e.message : String(e)} — raw: ${text.slice(0, 160)}`
      },
      res.status || 502
    )
  }

  return createResponse(data, res.status)
}
