// Edge Function: diagnostico-gerar
// Lê avaliações de pesquisa_satisfacao em um período, calcula CSAT/NPS,
// e usa Lovable AI para gerar pontos fortes, pontos fracos e sugestões.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  empresa_id?: string | null;
  periodo_dias?: number; // default 7
}

function media(arr: number[]): number | null {
  if (!arr.length) return null;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Body = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const dias = Math.max(1, Math.min(90, body.periodo_dias ?? 7));
  const periodo_fim = new Date();
  const periodo_inicio = new Date(periodo_fim.getTime() - dias * 24 * 60 * 60 * 1000);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let q = supabase
    .from("pesquisa_satisfacao")
    .select("*")
    .gte("created_at", periodo_inicio.toISOString())
    .lte("created_at", periodo_fim.toISOString())
    .not("nota", "is", null);

  if (body.empresa_id) q = q.eq("empresa_id", body.empresa_id);

  const { data: avaliacoes, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const lista = avaliacoes ?? [];
  const notas = lista.map((r) => r.nota as number);
  const notasIA = lista.filter((r) => r.tipo_atendimento === "IA").map((r) => r.nota as number);
  const notasHumano = lista.filter((r) => r.tipo_atendimento === "HUMANO").map((r) => r.nota as number);

  const promotores = notas.filter((n) => n >= 4).length;
  const neutros = notas.filter((n) => n === 3).length;
  const detratores = notas.filter((n) => n <= 2).length;
  const total = notas.length;
  const nps = total > 0
    ? Math.round(((promotores - detratores) / total) * 10000) / 100
    : 0;

  // Monta resumo para a IA
  const amostras = lista
    .filter((r) => r.comentario && r.comentario.trim())
    .slice(0, 80)
    .map((r) => ({
      nota: r.nota,
      tipo: r.tipo_atendimento,
      agente: r.agente_utilizado,
      atendente: r.nome_atendente,
      categoria: r.categoria,
      motivo: r.motivo_contato,
      comentario: (r.comentario as string).slice(0, 400),
    }));

  const prompt = `Você é um analista de qualidade de atendimento ao cliente.
Analise as ${total} avaliações abaixo (período de ${dias} dias) e produza um diagnóstico estruturado em JSON.

Estatísticas:
- CSAT geral: ${media(notas) ?? "n/d"}
- CSAT IA: ${media(notasIA) ?? "n/d"}
- CSAT humano: ${media(notasHumano) ?? "n/d"}
- NPS simplificado: ${nps}
- Promotores: ${promotores} | Neutros: ${neutros} | Detratores: ${detratores}

Amostras (até 80 comentários):
${JSON.stringify(amostras, null, 2)}

Responda SOMENTE com JSON válido, no formato:
{
  "pontos_fortes": [{ "titulo": string, "descricao": string }, ...],
  "pontos_fracos": [{ "titulo": string, "descricao": string, "frequencia": number }, ...],
  "sugestoes": [{ "titulo": string, "acao": string, "tipo": "FAQ"|"PROMPT"|"TOM"|"FLUXO"|"OUTRO" }, ...]
}
Máximo 5 itens em cada lista. Seja objetivo e específico.`;

  let pontos_fortes: unknown[] = [];
  let pontos_fracos: unknown[] = [];
  let sugestoes: unknown[] = [];

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey && total > 0) {
    try {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Lovable-API-Key": lovableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Você é um analista de qualidade. Responda SEMPRE com JSON válido." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (aiResp.ok) {
        const j = await aiResp.json();
        const text = j?.choices?.[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(text);
        pontos_fortes = parsed.pontos_fortes ?? [];
        pontos_fracos = parsed.pontos_fracos ?? [];
        sugestoes = parsed.sugestoes ?? [];
      } else {
        console.error("Lovable AI erro", aiResp.status, await aiResp.text());
      }
    } catch (e) {
      console.error("Erro ao chamar Lovable AI", e);
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("diagnostico_atendimento")
    .insert({
      empresa_id: body.empresa_id ?? null,
      periodo_inicio: periodo_inicio.toISOString(),
      periodo_fim: periodo_fim.toISOString(),
      csat_ia: media(notasIA),
      csat_humano: media(notasHumano),
      csat_geral: media(notas),
      nps,
      promotores,
      neutros,
      detratores,
      total_avaliacoes: total,
      pontos_fortes,
      pontos_fracos,
      sugestoes,
    })
    .select()
    .single();

  if (insertErr) {
    return new Response(JSON.stringify({ error: insertErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, diagnostico: inserted }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
