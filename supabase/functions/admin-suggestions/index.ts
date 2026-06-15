// Edge Function: admin-suggestions
// Proxy de leitura/escrita para sugestoes_base_conhecimento.
// Substitui o acesso direto via PostgREST anônimo (agora bloqueado por RLS).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_STATUS = new Set(["pendente", "aprovada", "rejeitada"]);

interface ReqBody {
  action: "list" | "update";
  empresa_id?: string;
  status?: string;       // filtro de listagem
  id?: string;           // alvo do update
  new_status?: string;   // novo status
  aprovado_em?: string | null;
  limit?: number;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido" });

  let body: ReqBody;
  try { body = await req.json(); } catch { return json(400, { error: "JSON inválido" }); }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (body.action === "list") {
    if (!body.empresa_id || typeof body.empresa_id !== "string") {
      return json(400, { error: "empresa_id obrigatório" });
    }
    const status = body.status && ALLOWED_STATUS.has(body.status) ? body.status : "pendente";
    const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);
    const { data, error } = await admin
      .from("sugestoes_base_conhecimento")
      .select("id, tipo, titulo, conteudo, status, origem, created_at")
      .eq("empresa_id", body.empresa_id)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return json(500, { error: error.message });
    return json(200, { sugestoes: data ?? [] });
  }

  if (body.action === "update") {
    if (!body.id || typeof body.id !== "string") return json(400, { error: "id obrigatório" });
    if (!body.new_status || !ALLOWED_STATUS.has(body.new_status)) {
      return json(400, { error: "new_status inválido" });
    }
    const patch: Record<string, unknown> = { status: body.new_status };
    if (body.new_status === "aprovada") {
      patch.aprovado_em = body.aprovado_em ?? new Date().toISOString();
    }
    const { error } = await admin
      .from("sugestoes_base_conhecimento")
      .update(patch)
      .eq("id", body.id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(400, { error: "action inválida" });
});
