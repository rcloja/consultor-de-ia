// Edge Function: pesquisa-responder
// Recebe a resposta do cliente (nota e/ou comentário) e atualiza o registro.
// Retorna a pergunta de follow-up adequada conforme a nota.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  pesquisa_id: string;
  resposta?: string; // "1".."5", "⭐", "⭐⭐⭐⭐⭐", ou texto livre
  comentario?: string;
}

function parseNota(resposta?: string): number | null {
  if (!resposta) return null;
  const s = resposta.trim();
  const digit = s.match(/^[1-5]$/);
  if (digit) return parseInt(digit[0], 10);
  const stars = (s.match(/⭐/g) || []).length;
  if (stars >= 1 && stars <= 5) return stars;
  return null;
}

function perguntaFollowUp(nota: number | null): string | null {
  if (nota === null) return null;
  if (nota <= 3) {
    return "Sentimos muito. Você poderia nos dizer rapidamente o que podemos melhorar?";
  }
  return "Ficamos felizes com sua avaliação 🙂 Existe algo que possamos fazer ainda melhor?";
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

  if (!body?.pesquisa_id) {
    return new Response(JSON.stringify({ error: "pesquisa_id é obrigatório" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const nota = parseNota(body.resposta);
  const update: Record<string, unknown> = { status_envio: "respondida" };
  if (nota !== null) update.nota = nota;
  if (body.comentario && body.comentario.trim()) update.comentario = body.comentario.trim();

  const { error } = await supabase
    .from("pesquisa_satisfacao")
    .update(update)
    .eq("id", body.pesquisa_id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, nota, pergunta_follow_up: perguntaFollowUp(nota) }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
