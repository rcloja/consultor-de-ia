// Edge Function: rag-save
// Recebe a lista final (já revisada/editada pelo usuário) de chunks e:
//  1) Gera embedding via OpenAI text-embedding-3-small (1536 dims) para cada chunk
//  2) Insere em public.rag_chunks com vector embedding
//
// Acesso interno: usa service_role para escrever na tabela (RLS sem policy pública).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORIAS_VALIDAS = new Set([
  "empresa","produtos","servicos","faq","objecoes","vendas",
  "politicas","atendimento","casos_de_uso","tom_de_voz","restricoes","exemplos",
]);

interface ChunkIn {
  categoria: string;
  titulo: string;
  conteudo: string;
}
interface ReqBody {
  empresa_id: string;
  chunks: ChunkIn[];
  substituir?: boolean; // se true, apaga chunks anteriores dessa empresa antes de inserir
}

async function embedBatch(textos: string[], apiKey: string): Promise<number[][]> {
  // OpenAI aceita até 2048 inputs por request; mandamos em lotes de 96 para segurança.
  const out: number[][] = [];
  const tamanho = 96;
  for (let i = 0; i < textos.length; i += tamanho) {
    const lote = textos.slice(i, i + tamanho);
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: lote,
      }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OpenAI embeddings ${resp.status}: ${err.slice(0, 300)}`);
    }
    const data = await resp.json();
    for (const item of data.data) out.push(item.embedding as number[]);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY ausente" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: ReqBody;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body?.empresa_id || !Array.isArray(body.chunks) || body.chunks.length === 0) {
    return new Response(JSON.stringify({ error: "Campos obrigatórios: empresa_id, chunks[]" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // valida/limpa chunks
  const limpos = body.chunks
    .map((c) => ({
      categoria: String(c?.categoria ?? "").trim(),
      titulo: String(c?.titulo ?? "").trim().slice(0, 200),
      conteudo: String(c?.conteudo ?? "").trim(),
    }))
    .filter((c) =>
      CATEGORIAS_VALIDAS.has(c.categoria) &&
      c.conteudo.length >= 40 &&
      c.conteudo.length <= 2000 &&
      c.titulo.length > 0,
    );

  if (limpos.length === 0) {
    return new Response(JSON.stringify({ error: "Nenhum chunk válido após validação" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Substituir conhecimento anterior se solicitado
  if (body.substituir) {
    const { error: delErr } = await admin
      .from("rag_chunks")
      .delete()
      .eq("empresa_id", body.empresa_id);
    if (delErr) {
      console.error("Falha ao apagar chunks antigos:", delErr);
      return new Response(JSON.stringify({ error: "Falha ao limpar memória anterior" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Gera embeddings
  let embeddings: number[][];
  try {
    embeddings = await embedBatch(limpos.map((c) => c.conteudo), apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Falha embeddings:", msg);
    return new Response(JSON.stringify({ error: `Falha ao gerar embeddings: ${msg}` }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = limpos.map((c, i) => ({
    empresa_id: body.empresa_id,
    categoria: c.categoria,
    titulo: c.titulo,
    conteudo: c.conteudo,
    // pgvector aceita o array literal "[0.1,0.2,...]" — o supabase-js serializa como JSON;
    // para garantir, mandamos como string no formato vetor:
    embedding: `[${embeddings[i].join(",")}]`,
  }));

  const { error: insErr, count } = await admin
    .from("rag_chunks")
    .insert(rows, { count: "exact" });

  if (insErr) {
    console.error("Falha inserindo chunks:", insErr);
    return new Response(JSON.stringify({ error: "Falha ao salvar memória vetorial" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ salvos: count ?? rows.length }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
