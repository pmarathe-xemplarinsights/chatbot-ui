import { ChatbotUIContext } from "@/context/context"
import { getAssistantCollectionsByAssistantId } from "@/db/assistant-collections"
import { getAssistantFilesByAssistantId } from "@/db/assistant-files"
import { getAssistantToolsByAssistantId } from "@/db/assistant-tools"
import { updateChat } from "@/db/chats"
import { getCollectionFilesByCollectionId } from "@/db/collection-files"
import { deleteMessagesIncludingAndAfter } from "@/db/messages"
import { buildFinalMessages } from "@/lib/build-prompt"
import { Tables } from "@/supabase/types"
import { ChatMessage, ChatPayload, LLMID, ModelProvider } from "@/types"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useContext, useEffect, useRef } from "react"
import { LLM_LIST } from "../../../lib/models/llm/llm-list"
import {
  handleConnect6Chat,
  resetConnect6Connection
} from "@/lib/connect6/connect6-chat"
import { isConnect6PocMode } from "@/lib/connect6/env"
import { resetConnect6BrowserSession } from "@/lib/connect6/session-storage"
import {
  CONNECT6_POLICYBUDDY_LLM,
  CONNECT6_POLICYBUDDY_MODEL_ID
} from "@/lib/connect6/poc-mocks"
import {
  createTempMessages,
  handleCreateChat,
  handleCreateMessages,
  handleHostedChat,
  handleLocalChat,
  handleRetrieval,
  processResponse,
  validateChatSettings
} from "../chat-helpers"

export const useChatHandler = () => {
  const router = useRouter()

  const {
    userInput,
    chatFiles,
    setUserInput,
    setNewMessageImages,
    profile,
    setIsGenerating,
    setChatMessages,
    setFirstTokenReceived,
    selectedChat,
    selectedWorkspace,
    setSelectedChat,
    setChats,
    setSelectedTools,
    availableLocalModels,
    availableOpenRouterModels,
    abortController,
    setAbortController,
    chatSettings,
    newMessageImages,
    selectedAssistant,
    chatMessages,
    chatImages,
    setChatImages,
    setChatFiles,
    setNewMessageFiles,
    setShowFilesDisplay,
    newMessageFiles,
    chatFileItems,
    setChatFileItems,
    setToolInUse,
    useRetrieval,
    sourceCount,
    setIsPromptPickerOpen,
    setIsFilePickerOpen,
    selectedTools,
    selectedPreset,
    setChatSettings,
    models,
    isPromptPickerOpen,
    isFilePickerOpen,
    isToolPickerOpen
  } = useContext(ChatbotUIContext)

  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isPromptPickerOpen || !isFilePickerOpen || !isToolPickerOpen) {
      chatInputRef.current?.focus()
    }
  }, [isPromptPickerOpen, isFilePickerOpen, isToolPickerOpen])

  const handleNewChat = async () => {
    if (!selectedWorkspace) return

    resetConnect6Connection()
    resetConnect6BrowserSession()

    setUserInput("")
    setChatMessages([])
    setSelectedChat(null)
    setChatFileItems([])

    setIsGenerating(false)
    setFirstTokenReceived(false)

    setChatFiles([])
    setChatImages([])
    setNewMessageFiles([])
    setNewMessageImages([])
    setShowFilesDisplay(false)
    setIsPromptPickerOpen(false)
    setIsFilePickerOpen(false)

    setSelectedTools([])
    setToolInUse("none")

    if (selectedAssistant) {
      setChatSettings({
        model: selectedAssistant.model as LLMID,
        prompt: selectedAssistant.prompt,
        temperature: selectedAssistant.temperature,
        contextLength: selectedAssistant.context_length,
        includeProfileContext: selectedAssistant.include_profile_context,
        includeWorkspaceInstructions:
          selectedAssistant.include_workspace_instructions,
        embeddingsProvider: selectedAssistant.embeddings_provider as
          | "openai"
          | "local"
      })

      let allFiles = []

      const assistantFiles = (
        await getAssistantFilesByAssistantId(selectedAssistant.id)
      ).files
      allFiles = [...assistantFiles]
      const assistantCollections = (
        await getAssistantCollectionsByAssistantId(selectedAssistant.id)
      ).collections
      for (const collection of assistantCollections) {
        const collectionFiles = (
          await getCollectionFilesByCollectionId(collection.id)
        ).files
        allFiles = [...allFiles, ...collectionFiles]
      }
      const assistantTools = (
        await getAssistantToolsByAssistantId(selectedAssistant.id)
      ).tools

      setSelectedTools(assistantTools)
      setChatFiles(
        allFiles.map(file => ({
          id: file.id,
          name: file.name,
          type: file.type,
          file: null
        }))
      )

      if (allFiles.length > 0) setShowFilesDisplay(true)
    } else if (selectedPreset) {
      setChatSettings({
        model: selectedPreset.model as LLMID,
        prompt: selectedPreset.prompt,
        temperature: selectedPreset.temperature,
        contextLength: selectedPreset.context_length,
        includeProfileContext: selectedPreset.include_profile_context,
        includeWorkspaceInstructions:
          selectedPreset.include_workspace_instructions,
        embeddingsProvider: selectedPreset.embeddings_provider as
          | "openai"
          | "local"
      })
    } else if (selectedWorkspace) {
      // setChatSettings({
      //   model: (selectedWorkspace.default_model ||
      //     "gpt-4-1106-preview") as LLMID,
      //   prompt:
      //     selectedWorkspace.default_prompt ||
      //     "You are a friendly, helpful AI assistant.",
      //   temperature: selectedWorkspace.default_temperature || 0.5,
      //   contextLength: selectedWorkspace.default_context_length || 4096,
      //   includeProfileContext:
      //     selectedWorkspace.include_profile_context || true,
      //   includeWorkspaceInstructions:
      //     selectedWorkspace.include_workspace_instructions || true,
      //   embeddingsProvider:
      //     (selectedWorkspace.embeddings_provider as "openai" | "local") ||
      //     "openai"
      // })
    }

    return router.push(`/${selectedWorkspace.id}/chat`)
  }

  const handleFocusChatInput = () => {
    chatInputRef.current?.focus()
  }

  const handleStopMessage = () => {
    if (abortController) {
      abortController.abort()
    }
  }

  const handleSendMessage = async (
    messageContent: string,
    chatMessages: ChatMessage[],
    isRegeneration: boolean
  ) => {
    const startingInput = messageContent

    try {
      setUserInput("")
      setIsGenerating(true)
      setIsPromptPickerOpen(false)
      setIsFilePickerOpen(false)
      setNewMessageImages([])

      const newAbortController = new AbortController()
      setAbortController(newAbortController)

      const connect6Poc = isConnect6PocMode()
      const settingsForRequest =
        connect6Poc && chatSettings
          ? {
              ...chatSettings,
              model: CONNECT6_POLICYBUDDY_MODEL_ID as LLMID
            }
          : chatSettings!

      if (typeof window !== "undefined") {
        console.info("[chat-route]", {
          connect6Poc,
          uiModel: chatSettings?.model,
          forcedModelForRequest: settingsForRequest.model,
          note: connect6Poc
            ? "POC: requests must use Connect6 only (see [Connect6] logs); not /api/chat/*"
            : "Using normal model routing"
        })
      }

      const modelData =
        [
          ...models.map(model => ({
            modelId: model.model_id as LLMID,
            modelName: model.name,
            provider: "custom" as ModelProvider,
            hostedId: model.id,
            platformLink: "",
            imageInput: false
          })),
          ...LLM_LIST,
          ...availableLocalModels,
          ...availableOpenRouterModels
        ].find(llm => llm.modelId === settingsForRequest.model) ??
        (settingsForRequest.model === CONNECT6_POLICYBUDDY_MODEL_ID ||
        connect6Poc
          ? CONNECT6_POLICYBUDDY_LLM
          : undefined)

      validateChatSettings(
        settingsForRequest,
        modelData,
        profile,
        selectedWorkspace,
        messageContent
      )

      let currentChat = selectedChat ? { ...selectedChat } : null

      const b64Images = newMessageImages.map(image => image.base64)

      let retrievedFileItems: Tables<"file_items">[] = []

      if (
        (newMessageFiles.length > 0 || chatFiles.length > 0) &&
        useRetrieval
      ) {
        setToolInUse("retrieval")

        retrievedFileItems = await handleRetrieval(
          userInput,
          newMessageFiles,
          chatFiles,
          settingsForRequest.embeddingsProvider,
          sourceCount
        )
      }

      const { tempUserChatMessage, tempAssistantChatMessage } =
        createTempMessages(
          messageContent,
          chatMessages,
          settingsForRequest,
          b64Images,
          isRegeneration,
          setChatMessages,
          selectedAssistant
        )

      let payload: ChatPayload = {
        chatSettings: settingsForRequest,
        workspaceInstructions: selectedWorkspace!.instructions || "",
        chatMessages: isRegeneration
          ? [...chatMessages]
          : [...chatMessages, tempUserChatMessage],
        assistant: selectedChat?.assistant_id ? selectedAssistant : null,
        messageFileItems: retrievedFileItems,
        chatFileItems: chatFileItems
      }

      let generatedText = ""

      const useConnect6ChatPath =
        connect6Poc || modelData!.provider === "connect6"
      const connect6Selected = modelData!.provider === "connect6"

      if (typeof window !== "undefined") {
        console.info("[chat-route] backend branch:", {
          useConnect6ChatPath,
          provider: modelData!.provider,
          willCallHostedChatApi:
            !useConnect6ChatPath && selectedTools.length === 0,
          toolsSkippedForConnect6:
            connect6Selected && selectedTools.length > 0 ? true : false
        })
      }

      if (selectedTools.length > 0 && !connect6Poc && !connect6Selected) {
        setToolInUse("Tools")

        const formattedMessages = await buildFinalMessages(
          payload,
          profile!,
          chatImages
        )

        const response = await fetch("/api/chat/tools", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chatSettings: payload.chatSettings,
            messages: formattedMessages,
            selectedTools
          })
        })

        setToolInUse("none")

        generatedText = await processResponse(
          response,
          isRegeneration
            ? payload.chatMessages[payload.chatMessages.length - 1]
            : tempAssistantChatMessage,
          true,
          newAbortController,
          setFirstTokenReceived,
          setChatMessages,
          setToolInUse
        )
      } else {
        if (useConnect6ChatPath) {
          if (typeof window !== "undefined") {
            console.info(
              "[chat-route] invoking Connect6 handleConnect6Chat — not fetch(/api/chat/…)"
            )
          }
          generatedText = await handleConnect6Chat(
            messageContent,
            tempAssistantChatMessage,
            newAbortController,
            setFirstTokenReceived,
            setChatMessages,
            setToolInUse
          )
        } else if (modelData!.provider === "ollama") {
          if (typeof window !== "undefined") {
            console.info("[chat-route] invoking local Ollama (not Connect6)")
          }
          generatedText = await handleLocalChat(
            payload,
            profile!,
            settingsForRequest,
            tempAssistantChatMessage,
            isRegeneration,
            newAbortController,
            setIsGenerating,
            setFirstTokenReceived,
            setChatMessages,
            setToolInUse
          )
        } else {
          if (typeof window !== "undefined") {
            console.info(
              "[chat-route] invoking hosted chat → fetch(/api/chat/<provider>) provider=",
              modelData!.provider
            )
          }
          generatedText = await handleHostedChat(
            payload,
            profile!,
            modelData!,
            tempAssistantChatMessage,
            isRegeneration,
            newAbortController,
            newMessageImages,
            chatImages,
            setIsGenerating,
            setFirstTokenReceived,
            setChatMessages,
            setToolInUse
          )
        }
      }

      const skipSupabasePersistence = useConnect6ChatPath && connect6Poc

      if (
        connect6Selected &&
        selectedTools.length > 0 &&
        typeof window !== "undefined"
      ) {
        console.warn(
          "[chat-route] Connect6 model: ignoring tools; replies use Connect6 WebSocket only"
        )
      }

      if (!skipSupabasePersistence) {
        if (!currentChat) {
          currentChat = await handleCreateChat(
            settingsForRequest,
            profile!,
            selectedWorkspace!,
            messageContent,
            selectedAssistant!,
            newMessageFiles,
            setSelectedChat,
            setChats,
            setChatFiles
          )
        } else {
          const updatedChat = await updateChat(currentChat.id, {
            updated_at: new Date().toISOString()
          })

          setChats(prevChats => {
            const updatedChats = prevChats.map(prevChat =>
              prevChat.id === updatedChat.id ? updatedChat : prevChat
            )

            return updatedChats
          })
        }

        await handleCreateMessages(
          chatMessages,
          currentChat,
          profile!,
          modelData!,
          messageContent,
          generatedText,
          newMessageImages,
          isRegeneration,
          retrievedFileItems,
          setChatMessages,
          setChatFileItems,
          setChatImages,
          selectedAssistant
        )
      }

      setIsGenerating(false)
      setFirstTokenReceived(false)
    } catch (error) {
      setIsGenerating(false)
      setFirstTokenReceived(false)
      setUserInput(startingInput)

      if (error instanceof Error) {
        console.error(error)
        toast.error(error.message)
      } else {
        console.error("Unknown error sending message", error)
        toast.error("Failed to send message")
      }
    }
  }

  const handleSendEdit = async (
    editedContent: string,
    sequenceNumber: number
  ) => {
    if (!selectedChat) return

    await deleteMessagesIncludingAndAfter(
      selectedChat.user_id,
      selectedChat.id,
      sequenceNumber
    )

    const filteredMessages = chatMessages.filter(
      chatMessage => chatMessage.message.sequence_number < sequenceNumber
    )

    setChatMessages(filteredMessages)

    handleSendMessage(editedContent, filteredMessages, false)
  }

  return {
    chatInputRef,
    prompt,
    handleNewChat,
    handleSendMessage,
    handleFocusChatInput,
    handleStopMessage,
    handleSendEdit
  }
}
