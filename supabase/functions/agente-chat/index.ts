// Edge Function: agente-chat (v2 — com Auditor de Respostas)
// Recebe { empresa_id, messages } e responde usando:
//   1) Prompt principal salvo em public.prompts (versão mais recente)
//   2) Top-K chunks de public.rag_chunks via match_rag_chunks (pgvector)
//   3) OpenAI gpt-4o-mini para gerar resposta no estilo WhatsApp curto
//   4) AUDITOR: valida tamanho, "acima/abaixo", contradição com a base e cobertura
//      da pergunta. Se falhar, refaz UMA VEZ com instruções corretivas.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Msg { role: "user" | "assistant"; content: string }
interface ReqBody {
  empresa_id: string;
  messages: Msg[];
  top_k?: number;
  cliente_id?: string;
}

const EMBED_MODEL = "text-embedding-3-small";
const CHAT_MODEL = Deno.env.get("OPENAI_CHAT_MODEL") ?? "gpt-4o-mini";

const REFS_PROIBIDAS = [
  "mencionado acima", "descrito abaixo", "conforme explicado anteriormente",
  "texto acima", "texto abaixo", "como dito antes", "ver acima", "ver abaixo",
  "vide acima", "vide abaixo", "empresa mencionada", "conforme acima",
];

// Frases de fricção que travam a conversão e devem ser evitadas.
const FRASES_FRICCAO = [
  "antes preciso entender melhor",
  "antes de te passar o valor",
  "antes de falar de preço",
  "antes de apresentar o valor",
  "preciso entender melhor seu cenário",
  "primeiro preciso entender",
];

// Padrões que indicam intenção de compra explícita do cliente.
const PADROES_INTENCAO_COMPRA = [
  /quanto\s+custa/i, /qual\s+o\s+pre[cç]o/i, /quais?\s+(os?\s+)?planos?/i,
  /como\s+funciona/i, /teste\s+gr[aá]tis/i, /tem\s+fidelidade/i,
  /como\s+contrato/i, /como\s+contratar/i, /posso\s+cancelar/i,
  /valor(es)?/i, /mensalidade/i, /assinatura/i,
];

// CTAs aceitas (heurística: pergunta final, verbo de ação, oferta de próximo passo).
const PADROES_CTA = [
  /\?\s*$/, /quer\s+que\s+eu/i, /posso\s+te\s+(indicar|mostrar|explicar|enviar|simular)/i,
  /vamos\s+(come[cç]ar|agendar|fechar)/i, /quer\s+(iniciar|come[cç]ar|agendar|testar)/i,
  /te\s+envio/i, /te\s+chamo/i,
];

async function embed(text: string, apiKey: string): Promise<number[]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!r.ok) throw new Error(`embeddings ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.data[0].embedding as number[];
}

function montaContexto(chunks: Array<{ categoria: string; titulo: string; conteudo: string; similarity: number }>) {
  if (!chunks.length) return "Nenhum trecho relevante encontrado na base.";
  return chunks
    .map((c, i) => `[#${i + 1} • ${c.categoria} • ${c.titulo} • score=${c.similarity.toFixed(2)}]\n${c.conteudo}`)
    .join("\n\n");
}

const REGRAS_RESPOSTA = `REGRAS DE RESPOSTA (obrigatórias):
- Use APENAS fatos dos TRECHOS DA BASE abaixo e do seu prompt principal. Não invente preços, prazos, garantias ou políticas.
- Se a base não trouxer a resposta, diga com naturalidade que vai confirmar com a equipe e siga a conversa.
- Estilo WhatsApp: 1 a 3 frases curtas, até ~300 caracteres. No máximo 1 pergunta por vez.
- Português do Brasil, tom cordial e profissional. Máximo 1 emoji discreto (🙂 ou 👍) quando fizer sentido.
- NUNCA escreva "acima", "abaixo", "mencionado", "anteriormente", "conforme citado", "texto anterior".
- Não cite "trechos", "documento", "base de conhecimento" ou números de referência ao cliente.`;

interface AuditoriaResultado {
  ok: boolean;
  problemas: string[];
}

function auditar(resposta: string, perguntaUsuario: string): AuditoriaResultado {
  const problemas: string[] = [];
  const r = resposta.trim();
  if (!r) problemas.push("Resposta vazia.");
  if (r.length > 600) problemas.push(`Resposta muito longa (${r.length} caracteres). Reduza para no máximo 300.`);
  const baixo = r.toLowerCase();
  for (const ref of REFS_PROIBIDAS) {
    if (baixo.includes(ref)) {
      problemas.push(`Contém referência proibida ("${ref}"). Reescreva sem citar partes "acima/abaixo".`);
      break;
    }
  }
  // emojis: máximo 1
  const emojis = (r.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emojis > 1) problemas.push("Usou mais de um emoji. Use no máximo um, discreto.");
  // perguntas: máximo 1
  const perguntas = (r.match(/\?/g) ?? []).length;
  if (perguntas > 1) problemas.push("Fez mais de uma pergunta. Faça no máximo uma por vez.");
  // cobertura mínima: se a pergunta era curta e a resposta não tem nenhuma palavra-chave em comum
  const palsPerg = perguntaUsuario.toLowerCase().match(/[a-záéíóúâêôãõç]{4,}/gi) ?? [];
  if (palsPerg.length >= 2) {
    const hit = palsPerg.some((p) => baixo.includes(p.toLowerCase()));
    if (!hit && r.length < 60) problemas.push("Resposta parece não endereçar a pergunta do cliente.");
  }
  return { ok: problemas.length === 0, problemas };
}

async function gerarResposta(
  apiKey: string,
  chatMessages: Array<{ role: string; content: string }>,
): Promise<string> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.4,
      max_tokens: 400,
      messages: chatMessages,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`OpenAI ${r.status}: ${err.slice(0, 400)}`);
  }
  const j = await r.json();
  return (j?.choices?.[0]?.message?.content ?? "").trim();
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
  if (!body?.empresa_id || !Array.isArray(body?.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "Campos obrigatórios: empresa_id, messages" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ultima = [...body.messages].reverse().find((m) => m.role === "user");
  if (!ultima?.content?.trim()) {
    return new Response(JSON.stringify({ error: "Nenhuma mensagem de usuário" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Prompt principal (versão mais recente)
  const { data: promptRow } = await admin
    .from("prompts")
    .select("conteudo, titulo, created_at")
    .eq("empresa_id", body.empresa_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const promptPrincipal = promptRow?.conteudo?.trim() ||
    "Você é um agente de atendimento profissional pelo WhatsApp. Seja claro, cordial e objetivo.";

  // Memória do cliente (se cliente_id veio)
  let memoriaCliente: Record<string, unknown> | null = null;
  if (body.cliente_id) {
    const { data: mc } = await admin
      .from("cliente_memoria")
      .select("nome, cidade, empresa, interesses, produtos_vistos, objecoes, probabilidade_compra, resumo")
      .eq("empresa_id", body.empresa_id)
      .eq("cliente_id", body.cliente_id)
      .maybeSingle();
    memoriaCliente = mc ?? null;
  }

  // Embedding + busca semântica
  let chunks: Array<{ categoria: string; titulo: string; conteudo: string; similarity: number }> = [];
  let buscaErro: string | null = null;
  try {
    const queryVec = await embed(ultima.content, apiKey);
    const { data: matches, error: matchErr } = await admin.rpc("match_rag_chunks", {
      p_empresa_id: body.empresa_id,
      query_embedding: queryVec as unknown as string,
      match_count: Math.min(Math.max(body.top_k ?? 6, 1), 12),
    });
    if (matchErr) throw matchErr;
    chunks = (matches ?? []) as typeof chunks;
  } catch (e) {
    buscaErro = e instanceof Error ? e.message : String(e);
    console.error("Busca RAG falhou:", buscaErro);
  }

  const contexto = montaContexto(chunks);
  const blocoMemoria = memoriaCliente
    ? `\n\n---\nMEMÓRIA DESTE CLIENTE (use para personalizar, mas não cite literalmente):\n${JSON.stringify(memoriaCliente, null, 2)}`
    : "";
  const system =
    `${promptPrincipal}\n\n---\n${REGRAS_RESPOSTA}\n\n---\nTRECHOS DA BASE (use apenas estes fatos):\n${contexto}${blocoMemoria}`;
  const historico = body.messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));

  let resposta = "";
  let auditoria: AuditoriaResultado = { ok: true, problemas: [] };
  let refeita = false;

  try {
    resposta = await gerarResposta(apiKey, [
      { role: "system", content: system },
      ...historico,
    ]);
    auditoria = auditar(resposta, ultima.content);

    // 1 retry se o auditor reprovar
    if (!auditoria.ok) {
      const correcoes = auditoria.problemas.map((p) => `- ${p}`).join("\n");
      const respostaRefeita = await gerarResposta(apiKey, [
        { role: "system", content: system },
        ...historico,
        { role: "assistant", content: resposta },
        {
          role: "user",
          content:
            `Sua resposta anterior tem estes problemas detectados pelo auditor:\n${correcoes}\n\n` +
            `Reescreva APENAS a resposta final ao cliente, corrigindo todos os pontos. ` +
            `Mantenha as regras de estilo WhatsApp. Não comente o erro, apenas envie a nova resposta.`,
        },
      ]);
      const auditoria2 = auditar(respostaRefeita, ultima.content);
      if (respostaRefeita && (auditoria2.ok || auditoria2.problemas.length < auditoria.problemas.length)) {
        resposta = respostaRefeita;
        auditoria = auditoria2;
        refeita = true;
      }
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Log da conversa (fire-and-forget)
  const fontesPayload = chunks.map((c) => ({
    categoria: c.categoria, titulo: c.titulo, similarity: Number(c.similarity.toFixed(3)),
  }));
  admin.from("conversas_agente").insert({
    empresa_id: body.empresa_id,
    cliente_id: body.cliente_id ?? null,
    pergunta: ultima.content.slice(0, 4000),
    resposta: resposta.slice(0, 4000),
    fontes: fontesPayload,
    auditor: { ok: auditoria.ok, problemas: auditoria.problemas, refeita },
  }).then(({ error }) => { if (error) console.error("log conversa:", error); });

  // Atualiza memória do cliente em background (não bloqueia resposta)
  if (body.cliente_id && body.messages.length >= 2) {
    const mensagensParaMem = [...body.messages, { role: "assistant" as const, content: resposta }];
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/cliente-memoria-update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        empresa_id: body.empresa_id,
        cliente_id: body.cliente_id,
        mensagens: mensagensParaMem,
      }),
    }).catch((e) => console.error("memoria-update bg:", e));
  }


  return new Response(
    JSON.stringify({
      resposta,
      fontes: chunks.map((c) => ({
        categoria: c.categoria,
        titulo: c.titulo,
        similarity: Number(c.similarity.toFixed(3)),
      })),
      prompt_encontrado: !!promptRow,
      busca_erro: buscaErro,
      auditor: {
        ok: auditoria.ok,
        problemas: auditoria.problemas,
        refeita,
      },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
