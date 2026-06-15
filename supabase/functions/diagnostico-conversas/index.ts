// Edge Function: diagnostico-conversas
// Analisa as últimas conversas do agente para uma empresa e gera sugestões de
// melhoria da base de conhecimento (FAQ, TOM, FLUXO, PROMPT, OUTRO).
// Grava as sugestões em public.sugestoes_base_conhecimento com status 'pendente'.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = Deno.env.get("OPENAI_CHAT_MODEL") ?? "gpt-4o-mini";
const TIPOS_VALIDOS = new Set(["FAQ", "PROMPT", "TOM", "FLUXO", "OUTRO"]);

const SYSTEM = `Você é um auditor de qualidade de um agente de IA no WhatsApp.
A partir das últimas conversas (pergunta do cliente + resposta do agente + alertas do auditor automático), identifique padrões e gere sugestões de melhoria para a base de conhecimento.

Procure:
- perguntas sem resposta clara
- objeções recorrentes não tratadas
- respostas muito longas
- contradições entre respostas
- temas frequentes ausentes da base
- excesso de transferências/respostas evasivas

Responda APENAS em JSON válido:
{
  "sugestoes": [
    {
      "tipo": "FAQ" | "PROMPT" | "TOM" | "FLUXO" | "OUTRO",
      "titulo": "string curta (até 100 chars)",
      "conteudo": "explique o problema + sugestão concreta de conteúdo/regra a adicionar (200-700 chars, autocontido, sem 'acima/abaixo')"
    }
  ]
}

Gere de 3 a 8 sugestões priorizadas (mais impactantes primeiro). Se não houver dados suficientes, retorne lista vazia.`;

interface ReqBody {
  empresa_id: string;
  limite?: number; // quantas conversas analisar (default 50)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Método não permitido", { status: 405, headers: corsHeaders });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ error: "OPENAI_API_KEY ausente" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let body: ReqBody;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!body?.empresa_id) {
    return new Response(JSON.stringify({ error: "empresa_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const limite = Math.min(Math.max(body.limite ?? 50, 5), 200);
  const { data: conversas, error: errC } = await admin
    .from("conversas_agente")
    .select("pergunta, resposta, auditor, transferida_humano, created_at")
    .eq("empresa_id", body.empresa_id)
    .order("created_at", { ascending: false })
    .limit(limite);

  if (errC) {
    return new Response(JSON.stringify({ error: "Falha ao ler conversas" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!conversas || conversas.length < 3) {
    return new Response(JSON.stringify({ sugestoes: [], aviso: "Conversas insuficientes para diagnóstico (mínimo 3)." }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const amostra = conversas.map((c, i) => {
    const alertas = c.auditor && typeof c.auditor === "object" && Array.isArray((c.auditor as { problemas?: string[] }).problemas)
      ? ((c.auditor as { problemas: string[] }).problemas).join(" | ") : "";
    return `#${i + 1}\nCliente: ${c.pergunta}\nAgente: ${c.resposta}${alertas ? `\nAuditor: ${alertas}` : ""}${c.transferida_humano ? "\n(transferida para humano)" : ""}`;
  }).join("\n\n");

  let sugestoesIA: Array<{ tipo: string; titulo: string; conteudo: string }> = [];
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 2500,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `AMOSTRA DE ${conversas.length} CONVERSAS (mais recentes primeiro):\n\n${amostra}` },
        ],
      }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}`);
    const j = await r.json();
    const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
    if (Array.isArray(parsed?.sugestoes)) sugestoesIA = parsed.sugestoes;
  } catch (e) {
    console.error("diagnostico IA:", e);
    return new Response(JSON.stringify({ error: "Falha IA" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const rows = sugestoesIA
    .filter((s) => TIPOS_VALIDOS.has(s.tipo) && typeof s.conteudo === "string" && s.conteudo.trim().length >= 60)
    .slice(0, 8)
    .map((s) => ({
      empresa_id: body.empresa_id,
      tipo: s.tipo,
      titulo: String(s.titulo ?? "").trim().slice(0, 200) || "Sugestão",
      conteudo: s.conteudo.trim().slice(0, 1500),
      origem: "diagnostico",
      status: "pendente" as const,
    }));

  if (rows.length === 0) {
    return new Response(JSON.stringify({ sugestoes: [], aviso: "Nenhuma sugestão relevante encontrada." }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: salvas, error: insErr } = await admin
    .from("sugestoes_base_conhecimento")
    .insert(rows)
    .select();
  if (insErr) {
    console.error("inserir sugestoes:", insErr);
    return new Response(JSON.stringify({ error: "Falha ao salvar sugestões" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ sugestoes: salvas, total: salvas?.length ?? 0 }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
