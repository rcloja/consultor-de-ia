// Edge Function: implantador-chat
// Recebe mensagens do Agente Implantador (Arquiteto de Conhecimento IA),
// repassa para a OpenAI usando OPENAI_API_KEY (somente no servidor)
// e registra logs em public.implantador_logs.
//
// O modelo pode ser trocado sem alterar o frontend definindo o secret
// OPENAI_MODEL (ex.: "gpt-4o", "gpt-4.1", "gpt-5"). Default: "gpt-4o".

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface RequestBody {
  agent_id?: string;
  conversation_id?: string;
  message: string;
  context?: unknown;
  history?: ChatMessage[];
}

const SYSTEM_PROMPT = `Você é o "Arquiteto de Conhecimento IA", também chamado de Consultor de Implantação de IA da AtendenteAI.
Seu objetivo NÃO é vender, e sim ajudar o empresário a estruturar a base de conhecimento da empresa dele para treinar um agente de IA.
- Seja consultivo, breve (1 a 3 frases), claro e acolhedor.
- Comente brevemente a resposta do usuário, valide o que foi entendido e, quando útil, sugira um detalhe a mais que enriqueceria a base.
- Não repita a pergunta seguinte (outro componente cuida disso).
- Use português do Brasil.`;

async function logUsage(params: {
  agent_id?: string | null;
  conversation_id?: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  status: "success" | "error";
  error_message?: string | null;
}) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);
    await admin.from("implantador_logs").insert({
      agent_id: params.agent_id ?? null,
      conversation_id: params.conversation_id ?? null,
      model: params.model,
      input_tokens: params.input_tokens,
      output_tokens: params.output_tokens,
      total_tokens: params.input_tokens + params.output_tokens,
      status: params.status,
      error_message: params.error_message ?? null,
    });
  } catch (e) {
    console.error("Falha ao gravar implantador_logs:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";
  const apiKey = Deno.env.get("OPENAI_API_KEY");

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          "Serviço de IA indisponível no momento. Por favor, tente novamente em instantes.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body?.message || typeof body.message !== "string") {
    return new Response(
      JSON.stringify({ error: "Campo 'message' é obrigatório." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  if (body.context !== undefined && body.context !== null) {
    try {
      const ctxStr =
        typeof body.context === "string"
          ? body.context
          : JSON.stringify(body.context, null, 2);
      messages.push({
        role: "system",
        content: `Contexto atual da implantação (use como referência, não repita literalmente):\n${ctxStr}`,
      });
    } catch {
      /* ignore */
    }
  }

  if (Array.isArray(body.history)) {
    for (const m of body.history.slice(-10)) {
      if (
        m &&
        typeof m.content === "string" &&
        (m.role === "user" || m.role === "assistant" || m.role === "system")
      ) {
        messages.push({ role: m.role, content: m.content });
      }
    }
  }

  messages.push({ role: "user", content: body.message });

  try {
    const openaiResp = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.6,
          max_tokens: 400,
        }),
      },
    );

    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      console.error("OpenAI erro:", openaiResp.status, errText);
      await logUsage({
        agent_id: body.agent_id,
        conversation_id: body.conversation_id,
        model,
        input_tokens: 0,
        output_tokens: 0,
        status: "error",
        error_message: `HTTP ${openaiResp.status}: ${errText.slice(0, 500)}`,
      });
      return new Response(
        JSON.stringify({
          error:
            "Não consegui me conectar ao serviço de IA agora. Tente novamente em instantes.",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await openaiResp.json();
    const responseText: string =
      data?.choices?.[0]?.message?.content?.trim() ?? "";
    const input_tokens: number = data?.usage?.prompt_tokens ?? 0;
    const output_tokens: number = data?.usage?.completion_tokens ?? 0;

    await logUsage({
      agent_id: body.agent_id,
      conversation_id: body.conversation_id,
      model,
      input_tokens,
      output_tokens,
      status: "success",
    });

    return new Response(
      JSON.stringify({
        response: responseText,
        model,
        usage: { input_tokens, output_tokens },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Erro ao chamar OpenAI:", detail);
    await logUsage({
      agent_id: body.agent_id,
      conversation_id: body.conversation_id,
      model,
      input_tokens: 0,
      output_tokens: 0,
      status: "error",
      error_message: detail.slice(0, 500),
    });
    return new Response(
      JSON.stringify({
        error:
          "Não consegui me conectar ao serviço de IA agora. Tente novamente em instantes.",
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
