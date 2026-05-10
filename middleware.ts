import { connect6SkipsSupabaseAuth } from "@/lib/connect6/env"
import { createClient } from "@/lib/supabase/middleware"
import { i18nRouter } from "next-i18n-router"
import { NextResponse, type NextRequest } from "next/server"
import i18nConfig from "./i18nConfig"

function localeAndLoginPath(pathname: string): { locale: string } | null {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 1 && segments[0] === "login") {
    return { locale: i18nConfig.defaultLocale }
  }
  if (
    segments.length === 2 &&
    segments[1] === "login" &&
    i18nConfig.locales.includes(segments[0])
  ) {
    return { locale: segments[0] }
  }
  return null
}

export async function middleware(request: NextRequest) {
  if (connect6SkipsSupabaseAuth()) {
    const workspaceId =
      process.env.NEXT_PUBLIC_CONNECT6_POC_WORKSPACE_ID || "connect6-poc"
    const loginPath = localeAndLoginPath(request.nextUrl.pathname)
    if (loginPath) {
      return NextResponse.redirect(
        new URL(
          `/${loginPath.locale}/${workspaceId}/chat`,
          request.url
        )
      )
    }
  }

  const i18nResult = i18nRouter(request, i18nConfig)
  if (i18nResult) return i18nResult

  try {
    const { supabase, response } = createClient(request)

    const session = await supabase.auth.getSession()

    const redirectToChat = session && request.nextUrl.pathname === "/"

    if (redirectToChat) {
      const { data: homeWorkspace, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("user_id", session.data.session?.user.id)
        .eq("is_home", true)
        .single()

      if (!homeWorkspace) {
        throw new Error(error?.message)
      }

      return NextResponse.redirect(
        new URL(`/${homeWorkspace.id}/chat`, request.url)
      )
    }

    return response
  } catch (e) {
    return NextResponse.next({
      request: {
        headers: request.headers
      }
    })
  }
}

export const config = {
  matcher: "/((?!api|static|.*\\..*|_next|auth).*)"
}
