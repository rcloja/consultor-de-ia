// Edge Function: agente-chat
// Recebe { empresa_id, messages } e responde usando:
//   1) Prompt principal salvo em public.prompts (última versão)
//   2) Top-K chunks recuperados de public.rag_chunks via match_rag_chunks (pgvector)
//   3) OpenAI gpt-4o-mini para gerar a resposta no estilo WhatsApp curto

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Msg { role: "user" | "assistant"; content: string }
interface ReqBody {
  empresa_id: string;
  messages: Msg[];
  top_k?: number;
}

const EMBED_MODEL = "text-embedding-3-small";
const CHAT_MODEL = Deno.env.get("OPENAI_CHAT_MODEL") ?? "gpt-4o-mini";

async function embed(text: string, apiKey: string): Promise<number[]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!r.ok) throw new Error(`embeddings ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.data[0].embedding as number[];
}

function montaContexto(chunks: Array<{ categoria: string; titulo: string; conteudo: string; similarity: number }>) {
  if (!chunks.length) return "Nenhum trecho relevante encontrado na base.";
  return chunks
    .map((c, i) => `[#${i + 1} • ${c.categoria} • ${c.titulo} • score=${c.similarity.toFixed(2)}]\n${c.conteudo}`)
    .join("\n\n");
}

const REGRAS_RESPOSTA = `REGRAS DE RESPOSTA (obrigatórias):
- Responda APENAS com base nos TRECHOS DA BASE abaixo e no seu prompt principal. Não invente fatos, preços, prazos ou políticas.
- Se a base não trouxer a resposta, diga com naturalidade que vai confirmar com a equipe e siga a conversa.
- Estilo WhatsApp: 1 a 3 frases curtas, até ~300 caracteres. No máximo 1 pergunta por vez.
- Português do Brasil, tom cordial e profissional. Máximo 1 emoji (🙂 ou 👍), só quando fizer sentido.
- Não cite "trechos", "documento", "base de conhecimento" ou números de referência ao cliente.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY ausente" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: ReqBody;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body?.empresa_id || !Array.isArray(body?.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "Campos obrigatórios: empresa_id, messages" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ultima = [...body.messages].reverse().find((m) => m.role === "user");
  if (!ultima?.content?.trim()) {
    return new Response(JSON.stringify({ error: "Nenhuma mensagem de usuário" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Carrega prompt principal (versão mais recente)
  const { data: promptRow } = await admin
    .from("prompts")
    .select("conteudo, titulo, created_at")
    .eq("empresa_id", body.empresa_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const promptPrincipal = promptRow?.conteudo?.trim() ||
    "Você é um agente de atendimento profissional pelo WhatsApp. Seja claro, cordial e objetivo.";

  // 2) Embedding da pergunta + busca semântica
  let chunks: Array<{ categoria: string; titulo: string; conteudo: string; similarity: number }> = [];
  let buscaErro: string | null = null;
  try {
    const queryVec = await embed(ultima.content, apiKey);
    const { data: matches, error: matchErr } = await admin.rpc("match_rag_chunks", {
      p_empresa_id: body.empresa_id,
      query_embedding: queryVec as unknown as string,
      match_count: Math.min(Math.max(body.top_k ?? 6, 1), 12),
    });
    if (matchErr) throw matchErr;
    chunks = (matches ?? []) as typeof chunks;
  } catch (e) {
    buscaErro = e instanceof Error ? e.message : String(e);
    console.error("Busca RAG falhou:", buscaErro);
  }

  const contexto = montaContexto(chunks);

  // 3) Monta mensagens para o LLM
  const system =
    `${promptPrincipal}\n\n---\n${REGRAS_RESPOSTA}\n\n---\nTRECHOS DA BASE (use apenas estes fatos):\n${contexto}`;

  const chatMessages = [
    { role: "system", content: system },
    ...body.messages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
  ];

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.4,
      max_tokens: 400,
      messages: chatMessages,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    return new Response(JSON.stringify({ error: `OpenAI ${r.status}: ${err.slice(0, 400)}` }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const j = await r.json();
  const resposta = j?.choices?.[0]?.message?.content?.trim() ?? "";

  return new Response(
    JSON.stringify({
      resposta,
      fontes: chunks.map((c) => ({
        categoria: c.categoria,
        titulo: c.titulo,
        similarity: Number(c.similarity.toFixed(3)),
      })),
      prompt_encontrado: !!promptRow,
      busca_erro: buscaErro,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
