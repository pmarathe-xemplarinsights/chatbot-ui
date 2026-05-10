import type { Tables } from "@/supabase/types"
import type { LLM } from "@/types"

export const CONNECT6_POLICYBUDDY_MODEL_ID = "connect6-policybuddy" as const

export const CONNECT6_POLICYBUDDY_LLM: LLM = {
  modelId: CONNECT6_POLICYBUDDY_MODEL_ID,
  modelName: "Connect6",
  provider: "connect6",
  hostedId: "connect6-policybuddy",
  platformLink: "",
  imageInput: false
}

export function createConnect6PocProfile(): Tables<"profiles"> {
  const uid = "connect6-poc-user"
  return {
    id: "connect6-poc-profile",
    user_id: uid,
    username: "poc",
    display_name: "Connect6 POC",
    bio: "",
    image_path: "",
    image_url: "",
    profile_context: "",
    use_azure_openai: false,
    has_onboarded: true,
    created_at: new Date().toISOString(),
    updated_at: null,
    anthropic_api_key: null,
    azure_openai_35_turbo_id: null,
    azure_openai_45_turbo_id: null,
    azure_openai_45_vision_id: null,
    azure_openai_api_key: null,
    azure_openai_embeddings_id: null,
    azure_openai_endpoint: null,
    google_gemini_api_key: null,
    groq_api_key: null,
    mistral_api_key: null,
    openai_api_key: null,
    openai_organization_id: null,
    openrouter_api_key: null,
    perplexity_api_key: null
  }
}

export function createConnect6PocWorkspace(
  workspaceId: string
): Tables<"workspaces"> {
  return {
    id: workspaceId,
    name: "Connect6 POC",
    description: "",
    instructions: "",
    default_model: CONNECT6_POLICYBUDDY_MODEL_ID,
    default_prompt: "",
    default_temperature: 0.5,
    default_context_length: 4096,
    embeddings_provider: "openai",
    include_profile_context: false,
    include_workspace_instructions: false,
    is_home: true,
    sharing: "private",
    image_path: "",
    created_at: new Date().toISOString(),
    updated_at: null,
    user_id: "connect6-poc-user"
  }
}
