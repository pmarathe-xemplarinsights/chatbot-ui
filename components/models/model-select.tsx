import { ChatbotUIContext } from "@/context/context"
import {
  CONNECT6_POLICYBUDDY_LLM,
  CONNECT6_POLICYBUDDY_MODEL_ID
} from "@/lib/connect6/poc-mocks"
import { LLM, LLMID, ModelProvider } from "@/types"
import { IconCheck, IconChevronDown } from "@tabler/icons-react"
import { FC, useContext, useEffect, useRef, useState } from "react"
import { Button } from "../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "../ui/dropdown-menu"
import { Input } from "../ui/input"
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs"
import { ModelIcon } from "./model-icon"
import { ModelOption } from "./model-option"

interface ModelSelectProps {
  selectedModelId: string
  onSelectModel: (modelId: LLMID) => void
}

const CONNECT6_MODEL = CONNECT6_POLICYBUDDY_LLM

function connect6MatchesSearch(search: string): boolean {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return (
    CONNECT6_MODEL.modelName.toLowerCase().includes(q) ||
    CONNECT6_MODEL.modelId.toLowerCase().includes(q) ||
    "policybuddy".includes(q) ||
    "bay6".includes(q)
  )
}

export const ModelSelect: FC<ModelSelectProps> = ({
  selectedModelId,
  onSelectModel
}) => {
  const {
    profile,
    models,
    availableHostedModels,
    availableLocalModels,
    availableOpenRouterModels
  } = useContext(ChatbotUIContext)

  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<"hosted" | "local">("hosted")

  const customAndHosted = [
    ...models.map(model => ({
      modelId: model.model_id as LLMID,
      modelName: model.name,
      provider: "custom" as ModelProvider,
      hostedId: model.id,
      platformLink: "",
      imageInput: false
    })),
    ...availableHostedModels,
    ...availableLocalModels,
    ...availableOpenRouterModels
  ].filter(m => m.modelId !== CONNECT6_POLICYBUDDY_MODEL_ID)

  const allModels = [CONNECT6_MODEL, ...customAndHosted]

  const groupedModels = customAndHosted.reduce<Record<string, LLM[]>>(
    (groups, model) => {
      const key = model.provider
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(model)
      return groups
    },
    {}
  )

  const selectedModel = allModels.find(
    model => model.modelId === selectedModelId
  )

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  useEffect(() => {
    if (typeof window === "undefined") return
    console.log(
      "[Connect6 UI] ModelSelect — total choices:",
      allModels.length,
      {
        hasConnect6: allModels.some(
          m => m.modelId === CONNECT6_POLICYBUDDY_MODEL_ID
        ),
        connect6Label: CONNECT6_MODEL.modelName,
        profileLoaded: Boolean(profile)
      }
    )
  }, [allModels.length, profile])

  const handleSelectModel = (modelId: LLMID) => {
    if (typeof window !== "undefined") {
      console.log("[Connect6 UI] User picked model:", modelId)
    }
    onSelectModel(modelId)
    setIsOpen(false)
  }

  if (!profile) return null

  const showConnect6Row = connect6MatchesSearch(search)

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={isOpen => {
        setIsOpen(isOpen)
        setSearch("")
      }}
    >
      <DropdownMenuTrigger
        className="bg-background w-full justify-start border-2 px-3 py-5"
        asChild
        disabled={allModels.length === 0}
      >
        {allModels.length === 0 ? (
          <div className="rounded text-sm font-bold">
            Unlock models by entering API keys in your profile settings.
          </div>
        ) : (
          <Button
            ref={triggerRef}
            className="flex items-center justify-between"
            variant="ghost"
          >
            <div className="flex items-center">
              {selectedModel ? (
                <>
                  <ModelIcon
                    provider={selectedModel?.provider}
                    width={26}
                    height={26}
                  />
                  <div className="ml-2 flex items-center">
                    {selectedModel?.modelName}
                  </div>
                </>
              ) : (
                <div className="ml-2 flex items-center">Select a model</div>
              )}
            </div>

            <IconChevronDown />
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="space-y-2 overflow-auto p-2"
        style={{ width: triggerRef.current?.offsetWidth }}
        align="start"
      >
        <Input
          ref={inputRef}
          className="w-full"
          placeholder="Search models… (try “Connect6”)"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="max-h-[300px] overflow-auto">
          {showConnect6Row && (
            <div className="border-primary/30 mb-3 border-b pb-2">
              <div className="mb-1 ml-2 text-xs font-bold tracking-wide opacity-80">
                CONNECT6 (your API + v6/chatbot_websocket)
              </div>
              <div className="flex items-center space-x-1">
                {selectedModelId === CONNECT6_MODEL.modelId && (
                  <IconCheck className="ml-2" size={32} />
                )}
                <ModelOption
                  model={CONNECT6_MODEL}
                  onSelect={() => handleSelectModel(CONNECT6_MODEL.modelId)}
                />
              </div>
            </div>
          )}

          {availableLocalModels.length > 0 && (
            <Tabs value={tab} onValueChange={(value: any) => setTab(value)}>
              <TabsList
                defaultValue="hosted"
                className="mb-2 grid w-full grid-cols-2"
              >
                <TabsTrigger value="hosted">Hosted</TabsTrigger>
                <TabsTrigger value="local">Local</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {Object.entries(groupedModels).map(([provider, providerModels]) => {
            const filteredModels = providerModels
              .filter(model => {
                if (tab === "hosted") return model.provider !== "ollama"
                if (tab === "local") return model.provider === "ollama"
                return true
              })
              .filter(model =>
                model.modelName.toLowerCase().includes(search.toLowerCase())
              )
              .sort((a, b) => a.modelName.localeCompare(b.modelName))

            if (filteredModels.length === 0) return null

            return (
              <div key={provider}>
                <div className="mb-1 ml-2 text-xs font-bold tracking-wide opacity-50">
                  {provider === "openai" && profile.use_azure_openai
                    ? "AZURE OPENAI"
                    : provider.toLocaleUpperCase()}
                </div>

                <div className="mb-4">
                  {filteredModels.map(model => {
                    return (
                      <div
                        key={model.modelId}
                        className="flex items-center space-x-1"
                      >
                        {selectedModelId === model.modelId && (
                          <IconCheck className="ml-2" size={32} />
                        )}

                        <ModelOption
                          key={model.modelId}
                          model={model}
                          onSelect={() => handleSelectModel(model.modelId)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
