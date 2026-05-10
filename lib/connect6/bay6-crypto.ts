/**
 * Bay6 Connect6 enc_version V2 — matches PolicyBuddy iframe bundle (crypto-js AES-CBC + morph).
 * WebSocket frames are this format when encryption is enabled on connect6-proapi.bay6.ai.
 */

import CryptoJS from "crypto-js"

/** Same as PolicyBuddy `environment.encSeprator` */
export const BAY6_ENC_SEPARATOR = "rE7pRxTGlqT6"

/** Collapse whitespace so proxies cannot break morphed key|iv segments. */
export function normalizeBay6WireInput(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/gu, "")
    .replace(/\u200b/gu, "")
    .replace(/\ufeff/gu, "")
}

const BAY6_ENC_PATTERN =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

/** Same as PolicyBuddy `environment.encRules` */
const BAY6_ENC_RULES: Record<string, string> = {
  R: "Ef4YsO2cbQZ2",
  W: "U4Bai5Qn1ZCp",
  q: "zR2H8Cd5maEc",
  a: "yUz4P1a7Dz6v",
  E: "Xm5VaT2B7c9a"
}

function getPadding(length: number): string {
  let result = ""
  for (let i = 0; i < length; i++) {
    result += BAY6_ENC_PATTERN.charAt(
      Math.floor(Math.random() * BAY6_ENC_PATTERN.length)
    )
  }
  return result.trim()
}

function morphString(inStr: string): string {
  return inStr
    .split("")
    .map(ch => (ch in BAY6_ENC_RULES ? BAY6_ENC_RULES[ch]! : ch))
    .join("")
}

function demorphString(morphedKey: string): string {
  let out = morphedKey
  for (const [char, morphedValue] of Object.entries(BAY6_ENC_RULES)) {
    while (out.includes(morphedValue)) {
      out = out.replace(morphedValue, char)
    }
  }
  return out
}

function childEncrypt(msg: string, secretKey: string, iv: string): string {
  const _key = CryptoJS.enc.Utf8.parse(secretKey)
  const _iv = CryptoJS.enc.Utf8.parse(iv)
  const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(msg), _key, {
    keySize: 256,
    iv: _iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })
  return encrypted.toString()
}

function childDecrypt(inText: string, secretKey: string, iv: string): string {
  const key = CryptoJS.enc.Utf8.parse(secretKey)
  const ivParsed = CryptoJS.enc.Utf8.parse(iv)
  const decrypted = CryptoJS.AES.decrypt(inText, key, {
    iv: ivParsed,
    padding: CryptoJS.pad.Pkcs7,
    mode: CryptoJS.mode.CBC
  })
  return decrypted.toString(CryptoJS.enc.Utf8)
}

/** Encrypt JSON (or string) into Bay6 wire format (three segments joined by separator). */
export function bay6EncryptWirePayload(payload: unknown): string {
  const msg = typeof payload === "string" ? payload : JSON.stringify(payload)
  const key = getPadding(32)
  const IV = getPadding(16)
  const morphedKey = morphString(key)
  const morphedIV = morphString(IV)
  const encString = childEncrypt(msg, key, IV)
  const padding = getPadding(12)
  return [morphedKey, morphedIV, `${padding}${encString}`].join(
    BAY6_ENC_SEPARATOR
  )
}

/** Decrypt Bay6 wire format → parsed JSON (object). */
export function bay6DecryptWirePayloadToJson(encryptedtext: string): unknown {
  const parts = encryptedtext.split(BAY6_ENC_SEPARATOR)
  if (parts.length < 3) {
    throw new Error("Bay6 decrypt: expected morphedKey|morphedIV|ciphertext")
  }
  const morphedKey = parts[0]!
  const morphedIV = parts[1]!
  const encBody = parts.slice(2).join(BAY6_ENC_SEPARATOR)
  const actualSecretKey = demorphString(morphedKey).replace(/^"/, "").trim()
  const actualIV = demorphString(morphedIV)
  const actualEncBody = encBody.substring(12)
  const plain = childDecrypt(actualEncBody, actualSecretKey, actualIV)
  const trimmedPlain = plain.trim()
  if (!trimmedPlain) {
    if (actualEncBody.trim().length > 0) {
      throw new Error(
        "Bay6 decrypt: empty plaintext (malformed wire or padding)"
      )
    }
    return {}
  }
  try {
    return JSON.parse(trimmedPlain) as unknown
  } catch {
    return trimmedPlain
  }
}

/** Parse Bay6 HTTP JSON body (plain or `{ body: wire }` or full wire string). */
export function parseBay6HttpResponseBody(
  text: string,
  encryptedMode: boolean
): unknown {
  const trimmed = text.trim()
  if (!trimmed) return {}
  if (!encryptedMode) {
    return JSON.parse(trimmed) as unknown
  }
  try {
    const j = JSON.parse(trimmed) as Record<string, unknown>
    if (
      typeof j.token === "string" &&
      (j.success === 1 || j.success === true || j.success === "1")
    ) {
      return j
    }
    if (typeof j.body === "string") {
      return bay6DecryptWirePayloadToJson(j.body)
    }
  } catch {
    /* not JSON */
  }
  return bay6DecryptWirePayloadToJson(trimmed)
}

/** Try decrypt; if not a Bay6 blob, parse as JSON; otherwise rethrow. */
export function bay6DecryptMaybeJson(raw: string): unknown {
  const t = raw.trim()
  if (!t) return {}
  if (!t.includes(BAY6_ENC_SEPARATOR)) {
    try {
      return JSON.parse(t) as unknown
    } catch {
      return { raw: t }
    }
  }
  try {
    return bay6DecryptWirePayloadToJson(t)
  } catch {
    try {
      return JSON.parse(t) as unknown
    } catch {
      throw new Error("Bay6 decrypt failed and body is not JSON")
    }
  }
}
