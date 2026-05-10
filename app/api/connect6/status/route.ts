import { isConnect6ConfiguredServer } from "@/lib/connect6/server-env"
import { createResponse } from "@/lib/server/server-utils"

export const runtime = "nodejs"

export async function GET() {
  return createResponse({ configured: isConnect6ConfiguredServer() }, 200)
}
