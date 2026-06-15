// Edge Function: atendimento-webhook
// Webhook público para sistemas externos (plataforma de chat, CRM, atendimento)
// notificarem o fim de um atendimento. Dispara a pesquisa de satisfação
// conforme as regras de envio definidas.
//
// Autenticação: header `x-webhook-secret` deve bater com ATENDIMENTO_WEBHOOK_SECRET.
//
// Eventos suportados (campo "evento"):
//   - "atendimento.encerrado"        → envia pesquisa imediatamente
//   - "cliente.confirmou_resolvido"  → envia pesquisa imediatamente
//   - "atendimento.inativo"          → envia se status="Resolvido" e inatividade_minutos > 0
//
// Payload mínimo:
// {
//   "evento": "atendimento.encerrado",
//   "atendimento": {
//     "empresa_id": "...", "cliente_id": "...",
//     "tipo_atendimento": "IA" | "HUMANO" | "HIBRIDO",
//     "agente_utilizado": "...", "nome_atendente": "...",
//     "resumo_atendimento": "...", "categoria": "...", "motivo_contato": "...",
//     "data_inicio": "ISO", "data_fim": "ISO",
//     "tempo_atendimento_segundos": 320,
//     "status": "Resolvido",
//     "inatividade_minutos": 10
//   }
// }

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Evento =
  | "atendimento.encerrado"
  | "cliente.confirmou_resolvido"
  | "atendimento.inativo";

interface Atendimento {
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
  status?: string;
  inatividade_minutos?: number;
}

interface Body {
  evento: Evento;
  atendimento: Atendimento;
}

function decidirEnvio(evento: Evento, a: Atendimento): { ok: boolean; motivo: string } {
  if (evento === "cliente.confirmou_resolvido") {
    return { ok: true, motivo: "cliente_confirmou_resolvido" };
  }
  if (evento === "atendimento.encerrado") {
    return { ok: true, motivo: "atendimento_encerrado" };
  }
  if (evento === "atendimento.inativo") {
    if ((a.inatividade_minutos ?? 0) > 0 && (a.status ?? "").toLowerCase() === "resolvido") {
      return { ok: true, motivo: `inatividade_${a.inatividade_minutos}min_resolvido` };
    }
    return { ok: false, motivo: "inatividade_sem_status_resolvido" };
  }
  return { ok: false, motivo: "evento_desconhecido" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const expected = Deno.env.get("ATENDIMENTO_WEBHOOK_SECRET");
  if (!expected) {
    return new Response(JSON.stringify({ error: "Webhook não configurado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const provided = req.headers.get("x-webhook-secret");
  if (!provided || provided !== expected) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
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

  if (!body?.evento || !body?.atendimento) {
    return new Response(
      JSON.stringify({ error: "Campos 'evento' e 'atendimento' são obrigatórios" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const decisao = decidirEnvio(body.evento, body.atendimento);
  if (!decisao.ok) {
    return new Response(
      JSON.stringify({ enviada: false, motivo: decisao.motivo }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const a = body.atendimento;
  const { data, error } = await supabase
    .from("pesquisa_satisfacao")
    .insert({
      empresa_id: a.empresa_id ?? null,
      cliente_id: a.cliente_id ?? null,
      tipo_atendimento: a.tipo_atendimento ?? null,
      agente_utilizado: a.agente_utilizado ?? null,
      nome_atendente: a.nome_atendente ?? null,
      resumo_atendimento: a.resumo_atendimento ?? null,
      categoria: a.categoria ?? null,
      motivo_contato: a.motivo_contato ?? null,
      data_inicio: a.data_inicio ?? null,
      data_fim: a.data_fim ?? null,
      tempo_atendimento_segundos: a.tempo_atendimento_segundos ?? null,
      status_envio: "enviada",
    })
    .select("id")
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
    JSON.stringify({
      enviada: true,
      motivo: decisao.motivo,
      pesquisa_id: data.id,
      mensagem,
      // URL para o sistema externo registrar a resposta do cliente:
      callback: {
        endpoint: "/functions/v1/pesquisa-responder",
        method: "POST",
        body_exemplo: { pesquisa_id: data.id, resposta: "5", comentario: "Ótimo!" },
      },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
