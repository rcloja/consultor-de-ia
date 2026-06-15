// Edge Function: cliente-memoria-update
// Atualiza (ou cria) a memória resumida de um cliente a partir das últimas mensagens.
// Recebe { empresa_id, cliente_id, mensagens } e usa IA para produzir um resumo estruturado.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = Deno.env.get("OPENAI_CHAT_MODEL") ?? "gpt-4o-mini";

interface Msg { role: "user" | "assistant"; content: string }
interface ReqBody {
  empresa_id: string;
  cliente_id: string;
  mensagens: Msg[];
}

const SYSTEM = `Você é um analista de CRM. A partir do histórico de uma conversa entre um Cliente e um Agente, atualize a memória resumida do cliente.
Responda APENAS em JSON válido com este schema:
{
  "nome": string|null,
  "cidade": string|null,
  "empresa": string|null,
  "interesses": string[],
  "produtos_vistos": string[],
  "objecoes": string[],
  "probabilidade_compra": 0-100,
  "resumo": string
}
Regras:
- Se a informação não estiver clara, use null ou array vazio. Nunca invente.
- "resumo": 1 a 3 frases curtas em português, foco em o que importa pra próximo atendimento.
- Junte com o que já existia (se enviado em CONTEXTO ANTERIOR), sem duplicar itens.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Método não permitido", { status: 405, headers: corsHeaders });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ error: "OPENAI_API_KEY ausente" }), { status: 500, headers: corsHeaders });

  let body: ReqBody;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!body?.empresa_id || !body?.cliente_id || !Array.isArray(body?.mensagens)) {
    return new Response(JSON.stringify({ error: "Campos obrigatórios: empresa_id, cliente_id, mensagens" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Memória existente
  const { data: atual } = await admin
    .from("cliente_memoria")
    .select("*")
    .eq("empresa_id", body.empresa_id)
    .eq("cliente_id", body.cliente_id)
    .maybeSingle();

  const historico = body.mensagens.slice(-20).map((m) => `${m.role === "user" ? "Cliente" : "Agente"}: ${m.content}`).join("\n");
  const contextoAnterior = atual
    ? `\n\nCONTEXTO ANTERIOR (mescle, não sobrescreva):\n${JSON.stringify({
        nome: atual.nome, cidade: atual.cidade, empresa: atual.empresa,
        interesses: atual.interesses, produtos_vistos: atual.produtos_vistos,
        objecoes: atual.objecoes, resumo: atual.resumo,
      }, null, 2)}`
    : "";

  let parsed: Record<string, unknown> = {};
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `HISTÓRICO:\n${historico}${contextoAnterior}` },
        ],
      }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}`);
    const j = await r.json();
    parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
  } catch (e) {
    console.error("cliente-memoria IA falhou:", e);
    return new Response(JSON.stringify({ error: "Falha IA" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const arr = (v: unknown) => Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 20) : [];
  const txt = (v: unknown) => typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null;
  const prob = typeof parsed.probabilidade_compra === "number"
    ? Math.max(0, Math.min(100, Math.round(parsed.probabilidade_compra as number))) : null;

  const payload = {
    empresa_id: body.empresa_id,
    cliente_id: body.cliente_id,
    nome: txt(parsed.nome),
    cidade: txt(parsed.cidade),
    empresa: txt(parsed.empresa),
    interesses: arr(parsed.interesses),
    produtos_vistos: arr(parsed.produtos_vistos),
    objecoes: arr(parsed.objecoes),
    probabilidade_compra: prob,
    resumo: txt(parsed.resumo),
    ultima_interacao: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("cliente_memoria")
    .upsert(payload, { onConflict: "empresa_id,cliente_id" })
    .select()
    .single();

  if (error) {
    console.error("upsert cliente_memoria:", error);
    return new Response(JSON.stringify({ error: "Falha ao salvar memória" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ memoria: data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
