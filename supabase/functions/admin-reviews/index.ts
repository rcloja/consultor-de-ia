// Edge Function: admin-reviews
// Proxy de leitura/escrita para agent_compliance_reviews.
// Substitui o acesso direto via PostgREST do anon. NÃO há autenticação
// no app público, então mantemos a função aberta mas com input estrito.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_STATUS = new Set(["pendente", "aprovado", "rejeitado", "em_revisao"]);

interface ReqBody {
  action: "list" | "update";
  id?: string;
  review_status?: string;
  human_notes?: string | null;
  human_reviewer_id?: string | null;
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
    const limit = Math.min(Math.max(body.limit ?? 500, 1), 1000);
    const { data, error } = await admin
      .from("agent_compliance_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return json(500, { error: error.message });
    return json(200, { reviews: data ?? [] });
  }

  if (body.action === "update") {
    if (!body.id || typeof body.id !== "string") return json(400, { error: "id obrigatório" });
    if (!body.review_status || !ALLOWED_STATUS.has(body.review_status)) {
      return json(400, { error: "review_status inválido" });
    }
    const notes = typeof body.human_notes === "string"
      ? body.human_notes.slice(0, 2000) : null;
    const reviewer = typeof body.human_reviewer_id === "string"
      ? body.human_reviewer_id.slice(0, 200) : null;
    const { error } = await admin
      .from("agent_compliance_reviews")
      .update({
        review_status: body.review_status,
        human_notes: notes,
        human_reviewer_id: reviewer,
      })
      .eq("id", body.id);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(400, { error: "action inválida" });
});
