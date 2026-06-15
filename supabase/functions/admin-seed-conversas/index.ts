// Edge Function: admin-seed-conversas
// Semeia 5 conversas de exemplo em public.conversas_agente para uma empresa,
// úteis para testar o fluxo de Diagnóstico de Sugestões.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ReqBody { empresa_id: string }

const AMOSTRAS = [
  {
    pergunta: "Vocês fazem agendamento para sábado à tarde?",
    resposta: "Posso verificar a agenda. Pode me confirmar o procedimento desejado?",
    auditor: { problemas: ["resposta evasiva: não informou horários disponíveis"], score: 4 },
    transferida_humano: false,
  },
  {
    pergunta: "Qual o valor da limpeza de pele profunda?",
    resposta: "Os valores variam conforme o protocolo. Vou transferir para uma consultora.",
    auditor: { problemas: ["preço não respondido", "transferência desnecessária"], score: 3 },
    transferida_humano: true,
  },
  {
    pergunta: "Vocês têm convênio com Unimed?",
    resposta: "No momento não trabalhamos com convênios, apenas particular. Aceitamos cartão em até 6x.",
    auditor: { problemas: [], score: 9 },
    transferida_humano: false,
  },
  {
    pergunta: "Quero cancelar minha sessão de amanhã às 14h",
    resposta: "Vou repassar para a recepção, aguarde por favor.",
    auditor: { problemas: ["fluxo de cancelamento ausente da base"], score: 4 },
    transferida_humano: true,
  },
  {
    pergunta: "Esse tratamento de drenagem dói? Estou com medo",
    resposta: "Olha, depende muito de cada pessoa, varia bastante, tem gente que sente mais, gente que sente menos, mas no geral é tranquilo, a maioria dos clientes acha relaxante, é uma massagem suave, não é igual massagem modeladora que essa sim costuma incomodar mais.",
    auditor: { problemas: ["resposta longa demais", "tom inseguro/hesitante"], score: 5 },
    transferida_humano: false,
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Método não permitido", { status: 405, headers: corsHeaders });
  }

  let body: ReqBody;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!body?.empresa_id) {
    return new Response(JSON.stringify({ error: "empresa_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const rows = AMOSTRAS.map((a) => ({
    empresa_id: body.empresa_id,
    cliente_id: "seed-cliente",
    pergunta: a.pergunta,
    resposta: a.resposta,
    fontes: [],
    auditor: a.auditor,
    transferida_humano: a.transferida_humano,
  }));

  const { data, error } = await admin.from("conversas_agente").insert(rows).select("id");
  if (error) {
    console.error("seed conversas:", error);
    return new Response(JSON.stringify({ error: "Falha ao semear" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ inseridas: data?.length ?? 0 }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
