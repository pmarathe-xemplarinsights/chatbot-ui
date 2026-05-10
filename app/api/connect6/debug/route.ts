import { getConnect6EnvDiagnostics } from "@/lib/connect6/server-env"
import { createResponse } from "@/lib/server/server-utils"

export const runtime = "nodejs"

/**
 * Safe diagnostics: no secret values, only which vars exist and project paths.
 * Open in browser when Connect6 reports “keys missing”.
 */
export async function GET() {
  const d = getConnect6EnvDiagnostics()
  return createResponse(
    {
      ...d,
      hint:
        "Put keys in .env.local next to package.json (not inside app/). " +
        "Names: CONNECT6_ACCESS_KEY + CONNECT6_SECRET_KEY (or NEXT_PUBLIC_* pair). " +
        "Restart `npm run dev` after saving."
    },
    200
  )
}
