// Edge Function: pesquisa-enviar
// Registra (ou marca como "enviada") uma pesquisa de satisfação pós-atendimento.
// Regras de envio: só envia quando o atendimento está resolvido / encerrado,
// ou após inatividade superior a "inatividade_minutos" com status "Resolvido".

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  empresa_id?: string;
  cliente_id?: string;
  tipo_atendimento?: "IA" | "HUMANO" | "HIBRIDO";
  agente_utilizado?: string;
  nome_atendente?: string;
  resumo_atendimento?: string;
  categoria?: string;
  motivo_contato?: string;
  data_inicio?: string;
  data_fim?: string;
  tempo_atendimento_segundos?: number;
  // Sinais que autorizam o envio
  cliente_confirmou_resolvido?: boolean;
  atendimento_encerrado?: boolean;
  inatividade_minutos?: number;
  status?: string; // "Resolvido" para combinar com inatividade
}

function podeEnviar(b: Body): { ok: boolean; motivo: string } {
  if (b.cliente_confirmou_resolvido) return { ok: true, motivo: "cliente_confirmou_resolvido" };
  if (b.atendimento_encerrado) return { ok: true, motivo: "atendimento_encerrado" };
  if ((b.inatividade_minutos ?? 0) > 0 && (b.status ?? "").toLowerCase() === "resolvido") {
    return { ok: true, motivo: `inatividade_${b.inatividade_minutos}min_resolvido` };
  }
  return { ok: false, motivo: "condicoes_nao_atendidas" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const check = podeEnviar(body);
  if (!check.ok) {
    return new Response(
      JSON.stringify({ enviada: false, motivo: check.motivo, mensagem: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("pesquisa_satisfacao")
    .insert({
      empresa_id: body.empresa_id ?? null,
      cliente_id: body.cliente_id ?? null,
      tipo_atendimento: body.tipo_atendimento ?? null,
      agente_utilizado: body.agente_utilizado ?? null,
      nome_atendente: body.nome_atendente ?? null,
      resumo_atendimento: body.resumo_atendimento ?? null,
      categoria: body.categoria ?? null,
      motivo_contato: body.motivo_contato ?? null,
      data_inicio: body.data_inicio ?? null,
      data_fim: body.data_fim ?? null,
      tempo_atendimento_segundos: body.tempo_atendimento_segundos ?? null,
      status_envio: "enviada",
    })
    .select()
    .single();

  if (error) {
    console.error("Erro ao gravar pesquisa_satisfacao", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const mensagem =
    "Seu atendimento foi útil? 🙂\n\nSua opinião nos ajuda a melhorar.\n\n" +
    "⭐ 1 - Muito ruim\n⭐⭐ 2 - Ruim\n⭐⭐⭐ 3 - Regular\n" +
    "⭐⭐⭐⭐ 4 - Bom\n⭐⭐⭐⭐⭐ 5 - Excelente";

  return new Response(
    JSON.stringify({ enviada: true, motivo: check.motivo, pesquisa_id: data.id, mensagem }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
