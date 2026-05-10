"use client"

import { ChatbotUISVG } from "@/components/icons/chatbotui-svg"
import {
  getConnect6PocWorkspaceId,
  isConnect6PocMode
} from "@/lib/connect6/env"
import { IconArrowRight } from "@tabler/icons-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { useParams } from "next/navigation"

export default function HomePage() {
  const { theme } = useTheme()
  const params = useParams()
  const locale = typeof params?.locale === "string" ? params.locale : "en"
  const startHref = isConnect6PocMode()
    ? `/${locale}/${getConnect6PocWorkspaceId()}/chat`
    : "/login"

  return (
    <div className="flex size-full flex-col items-center justify-center">
      <div>
        <ChatbotUISVG theme={theme === "dark" ? "dark" : "light"} scale={0.3} />
      </div>

      <div className="mt-2 text-4xl font-bold">Chatbot UI</div>

      <Link
        className="mt-4 flex w-[200px] items-center justify-center rounded-md bg-blue-500 p-2 font-semibold"
        href={startHref}
      >
        Start Chatting
        <IconArrowRight className="ml-1" size={20} />
      </Link>
    </div>
  )
}
