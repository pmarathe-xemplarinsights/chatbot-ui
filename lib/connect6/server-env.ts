/**
 * Server-only Connect6 config (Route Handlers).
 * Keys: CONNECT6_ACCESS_KEY + CONNECT6_SECRET_KEY (recommended), or NEXT_PUBLIC_* fallback.
 *
 * Also parses `.env` / `.env.local` from the project root at runtime so keys work even when
 * `process.env` was empty for this worker (some Windows / Next dev setups).
 */

import fs from "fs"
import path from "path"

let dotfilesLoaded = false

/** Reload-friendly KEY=VALUE lines (same folder as package.json). */
function parseDotEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return
  let raw = fs.readFileSync(filePath, "utf8")
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1)
  }
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq <= 0) continue
    let key = line.slice(0, eq).trim()
    if (key.startsWith("export ")) {
      key = key.slice(7).trim()
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    let val = line.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

export function ensureConnect6EnvLoaded(): void {
  if (dotfilesLoaded) return
  dotfilesLoaded = true
  try {
    const root = process.cwd()
    parseDotEnvFile(path.join(root, ".env"))
    parseDotEnvFile(path.join(root, ".env.local"))
  } catch (e) {
    console.error("[Connect6] Could not read .env / .env.local:", e)
  }
}

function firstEnv(...keys: string[]): string {
  ensureConnect6EnvLoaded()
  for (const k of keys) {
    const v = process.env[k]?.trim()
    if (v) return v
  }
  return ""
}

export function getConnect6HttpBaseServer(): string {
  ensureConnect6EnvLoaded()
  return (
    process.env.CONNECT6_HTTP_BASE?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_CONNECT6_HTTP_BASE?.replace(/\/$/, "") ||
    "https://connect6dev.bay6.ai"
  )
}

export function isConnect6Bay6EncryptServer(): boolean {
  ensureConnect6EnvLoaded()
  return (
    process.env.CONNECT6_BAY6_ENCRYPT === "true" ||
    process.env.NEXT_PUBLIC_CONNECT6_BAY6_ENCRYPT === "true"
  )
}

export function getConnect6AccessKeyServer(): string {
  return firstEnv(
    "CONNECT6_ACCESS_KEY",
    "NEXT_PUBLIC_CONNECT6_ACCESS_KEY",
    "CONNECT6_PUBLIC_ACCESS_KEY",
    "CONNECT6_API_KEY",
    "CONNECT6_KEY_ID"
  )
}

export function getConnect6SecretKeyServer(): string {
  return firstEnv(
    "CONNECT6_SECRET_KEY",
    "NEXT_PUBLIC_CONNECT6_SECRET_KEY",
    "CONNECT6_PRIVATE_KEY",
    "CONNECT6_CLIENT_SECRET",
    "CONNECT6_SECRET"
  )
}

export function getConnect6ClientIdServer(): string {
  ensureConnect6EnvLoaded()
  return (
    process.env.CONNECT6_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_CONNECT6_CLIENT_ID?.trim() ||
    "24"
  )
}

export function isConnect6ConfiguredServer(): boolean {
  return Boolean(getConnect6AccessKeyServer() && getConnect6SecretKeyServer())
}

export function getConnect6EnvDiagnostics(): {
  cwd: string
  dotEnvPath: string
  dotEnvLocalPath: string
  dotEnvExists: boolean
  dotEnvLocalExists: boolean
  configured: boolean
  /** Non-zero if any accepted alias resolved (length only, not the secret). */
  accessKeyCharCount: number
  secretKeyCharCount: number
  vars: Record<string, "missing" | "set">
} {
  ensureConnect6EnvLoaded()
  const root = process.cwd()
  const dotEnvPath = path.join(root, ".env")
  const dotEnvLocalPath = path.join(root, ".env.local")
  const keysToReport = [
    "CONNECT6_ACCESS_KEY",
    "CONNECT6_SECRET_KEY",
    "NEXT_PUBLIC_CONNECT6_ACCESS_KEY",
    "NEXT_PUBLIC_CONNECT6_SECRET_KEY"
  ] as const
  const vars: Record<string, "missing" | "set"> = {}
  for (const k of keysToReport) {
    vars[k] = process.env[k]?.trim() ? "set" : "missing"
  }
  const access = getConnect6AccessKeyServer()
  const secret = getConnect6SecretKeyServer()
  return {
    cwd: root,
    dotEnvPath,
    dotEnvLocalPath,
    dotEnvExists: fs.existsSync(dotEnvPath),
    dotEnvLocalExists: fs.existsSync(dotEnvLocalPath),
    configured: Boolean(access && secret),
    accessKeyCharCount: access.length,
    secretKeyCharCount: secret.length,
    vars
  }
}
