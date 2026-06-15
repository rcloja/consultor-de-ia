// Edge Function: sugestoes-base-gerar
// Analisa avaliações/comentários recentes e gera sugestões para a Base de Conhecimento.
// IMPORTANTE: a IA NUNCA altera a base — apenas cria registros com status "pendente".

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  empresa_id?: string | null;
  periodo_dias?: number;
}

const TIPOS_VALIDOS = new Set(["FAQ", "PROMPT", "TOM", "FLUXO", "OUTRO"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Body = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const dias = Math.max(1, Math.min(90, body.periodo_dias ?? 30));
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let q = supabase
    .from("pesquisa_satisfacao")
    .select("nota, comentario, categoria, motivo_contato, resumo_atendimento, tipo_atendimento")
    .gte("created_at", desde.toISOString());
  if (body.empresa_id) q = q.eq("empresa_id", body.empresa_id);

  const { data: pesquisas, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY ausente" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const amostra = (pesquisas ?? []).slice(0, 120);
  const prompt = `Você é especialista em base de conhecimento para agentes de IA de atendimento.
Analise as avaliações abaixo e proponha sugestões CONCRETAS de melhoria para a base.
Cada sugestão deve ter um tipo entre: FAQ, PROMPT, TOM, FLUXO, OUTRO.

Avaliações:
${JSON.stringify(amostra, null, 2)}

Responda SOMENTE com JSON válido:
{
  "sugestoes": [
    { "tipo": "FAQ"|"PROMPT"|"TOM"|"FLUXO"|"OUTRO", "titulo": string, "conteudo": string }
  ]
}
Máximo 8 sugestões. Seja específico e acionável. NÃO repita sugestões.`;

  let sugestoesIA: { tipo: string; titulo: string; conteudo: string }[] = [];
  try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Lovable-API-Key": lovableKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você gera sugestões para base de conhecimento. Responda apenas JSON válido." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("Lovable AI erro", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Falha ao gerar sugestões", detail: t }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const j = await aiResp.json();
    const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
    sugestoesIA = Array.isArray(parsed.sugestoes) ? parsed.sugestoes : [];
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = sugestoesIA
    .filter((s) => s && typeof s.conteudo === "string" && s.conteudo.trim())
    .map((s) => ({
      empresa_id: body.empresa_id ?? null,
      tipo: TIPOS_VALIDOS.has(s.tipo) ? s.tipo : "OUTRO",
      titulo: s.titulo?.slice(0, 200) ?? null,
      conteudo: s.conteudo.slice(0, 4000),
      status: "pendente" as const,
      origem: "ia_diagnostico",
    }));

  if (rows.length) {
    const { error: insErr } = await supabase.from("sugestoes_base_conhecimento").insert(rows);
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, criadas: rows.length }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
