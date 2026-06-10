import { supabase } from "@/integrations/supabase/client";

export interface ImplantadorChatHistoryItem {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ImplantadorChatRequest {
  agent_id: string;
  conversation_id: string;
  message: string;
  context?: unknown;
  history?: ImplantadorChatHistoryItem[];
}

export interface ImplantadorChatResponse {
  response: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Chama a Edge Function `implantador-chat`, que por sua vez chama a OpenAI
 * usando OPENAI_API_KEY armazenada apenas no servidor.
 * Nunca expõe a chave para o navegador.
 */
export async function chamarImplantadorAi(
  payload: ImplantadorChatRequest,
): Promise<ImplantadorChatResponse> {
  const { data, error } = await supabase.functions.invoke("implantador-chat", {
    body: payload,
  });
  if (error) {
    throw new Error(error.message ?? "Falha ao chamar o consultor de IA.");
  }
  if (!data || typeof (data as { response?: unknown }).response !== "string") {
    throw new Error("Resposta inesperada do consultor de IA.");
  }
  return data as ImplantadorChatResponse;
}
