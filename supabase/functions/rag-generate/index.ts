// Edge Function: rag-generate
// Recebe a base de conhecimento finalizada + prompt principal e:
//  1) Salva o prompt principal em public.prompts
//  2) Pede à OpenAI para gerar 4 RAGs (faq, objeções, casos_de_uso, vendas) em JSON estruturado
//  3) Também monta chunks determinísticos a partir da base (empresa, produtos, serviços, etc)
//  4) Retorna a lista de chunks PROPOSTOS — ainda NÃO são salvos no banco vetorial.
//     A persistência (com embeddings) é feita pela função rag-save após revisão humana.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Categoria =
  | "empresa" | "produtos" | "servicos" | "faq" | "objecoes" | "vendas"
  | "politicas" | "atendimento" | "casos_de_uso" | "tom_de_voz"
  | "restricoes" | "exemplos";

interface Chunk {
  categoria: Categoria;
  titulo: string;
  conteudo: string;
  origem: "base" | "ia";
}

interface ReqBody {
  empresa_id: string;
  titulo_prompt?: string;
  prompt_principal: string;
  base: Record<string, string[]>;
}

const REFS_PROIBIDAS = [
  "mencionado acima", "descrito abaixo", "conforme explicado anteriormente",
  "responda conforme acima", "utilize o tom descrito", "produto informado anteriormente",
  "empresa mencionada", "texto acima", "texto abaixo", "como dito antes",
  "ver acima", "ver abaixo", "vide acima", "vide abaixo",
];

function limparChunk(texto: string): string {
  let t = (texto || "")
    .replace(/<[^>]+>/g, " ")            // tira HTML
    .replace(/[*_`#>]+/g, " ")           // tira markdown leve
    .replace(/\s+/g, " ")
    .trim();
  // remove frases que contenham referências proibidas
  const frases = t.split(/(?<=[\.\!\?])\s+/);
  const filtradas = frases.filter(
    (f) => !REFS_PROIBIDAS.some((r) => f.toLowerCase().includes(r)),
  );
  t = filtradas.join(" ").trim();
  return t;
}

function chunkValido(c: { titulo: string; conteudo: string }): boolean {
  if (!c?.conteudo) return false;
  const len = c.conteudo.length;
  return len >= 80 && len <= 1200;
}

function chunksDaBase(base: Record<string, string[]>): Chunk[] {
  const out: Chunk[] = [];
  const push = (categoria: Categoria, titulo: string, conteudo: string) => {
    const c = limparChunk(conteudo);
    if (chunkValido({ titulo, conteudo: c })) {
      out.push({ categoria, titulo, conteudo: c, origem: "base" });
    }
  };
  const join = (k: string) => (base[k] ?? []).filter(Boolean).join(". ");

  if (base["Empresa"]?.length) {
    push("empresa", "Sobre a empresa", join("Empresa"));
  }
  if (base["Produtos e serviços"]?.length) {
    for (const item of base["Produtos e serviços"]) {
      const cat: Categoria = /serv|atend|consult/i.test(item) ? "servicos" : "produtos";
      push(cat, item.slice(0, 80), item);
    }
  }
  if (base["Público-alvo"]?.length) {
    push("empresa", "Público-alvo", join("Público-alvo"));
  }
  if (base["Tom de voz"]?.length) {
    push("tom_de_voz", "Tom de voz do agente", join("Tom de voz"));
  }
  if (base["Políticas e regras"]?.length) {
    for (const item of base["Políticas e regras"]) {
      push("politicas", item.slice(0, 80), item);
    }
  }
  if (base["Restrições"]?.length) {
    push("restricoes", "O que o agente não deve fazer", join("Restrições"));
  }
  if (base["Processo comercial"]?.length) {
    push("vendas", "Processo comercial", join("Processo comercial"));
  }
  if (base["FAQ"]?.length) {
    for (const item of base["FAQ"]) {
      push("faq", item.slice(0, 80), item);
    }
  }
  if (base["Atendimento"]?.length) {
    push("atendimento", "Fluxo de atendimento", join("Atendimento"));
  }
  return out;
}

const SYSTEM_GERAR_RAGS = `Você é um Arquiteto de Conhecimento. A partir da base estruturada de uma empresa,
você deve gerar 4 grupos de conhecimento (RAGs) para alimentar um agente de IA no WhatsApp.

REGRAS ABSOLUTAS:
- Responda APENAS com JSON válido no schema solicitado.
- Cada chunk deve ter 150 a 900 caracteres, ser autocontido e fazer sentido sozinho.
- NÃO use frases como "conforme acima", "descrito abaixo", "mencionado anteriormente", "texto acima/abaixo".
- NÃO invente produtos, preços, prazos ou políticas que não estejam na base.
- Quando faltar dado concreto, formule a pergunta/objeção de forma genérica e oriente o agente
  a dizer que vai confirmar com a equipe — nunca invente número, valor ou prazo.
- Português do Brasil, tom profissional e cordial estilo WhatsApp.
- Respostas curtas (1 a 3 frases) sempre que possível.

GRUPOS A GERAR:
1) faq — perguntas frequentes (preço, prazo, garantia, cancelamento, entrega, suporte, troca, funcionamento). 6 a 10 itens.
2) objecoes — objeções comerciais ("está caro", "vou pensar", "já tenho fornecedor", "não preciso", "medo de IA", "falar com sócio", "me envie por email"). 6 a 8 itens. Cada conteúdo deve trazer: motivo provável + melhor abordagem + resposta curta sugerida.
3) casos_de_uso — diálogos curtos exemplificando interações reais (cliente curioso, cliente decidido, transferência humana, recuperação de contexto, caso difícil). 4 a 6 itens. Formato: "Cliente: ... | Agente: ..." em uma única linha.
4) vendas — conhecimento comercial (benefícios, diferenciais, gatilhos mentais, provas sociais, fechamentos). 5 a 8 itens.

FORMATO JSON:
{
  "faq":         [{"titulo":"...","conteudo":"..."}],
  "objecoes":    [{"titulo":"...","conteudo":"..."}],
  "casos_de_uso":[{"titulo":"...","conteudo":"..."}],
  "vendas":      [{"titulo":"...","conteudo":"..."}]
}`;

async function gerarRagsIA(
  base: Record<string, string[]>,
  promptPrincipal: string,
  apiKey: string,
  model: string,
): Promise<Chunk[]> {
  const userContent = `BASE ESTRUTURADA DA EMPRESA (JSON):\n${JSON.stringify(base, null, 2)}\n\nPROMPT PRINCIPAL JÁ GERADO (para contexto, não reproduza literalmente):\n${promptPrincipal.slice(0, 6000)}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 4000,
      messages: [
        { role: "system", content: SYSTEM_GERAR_RAGS },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 400)}`);
  }
  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, Array<{ titulo: string; conteudo: string }>>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Resposta da IA não é JSON válido");
  }

  const mapeamento: Record<string, Categoria> = {
    faq: "faq",
    objecoes: "objecoes",
    casos_de_uso: "casos_de_uso",
    vendas: "vendas",
  };
  const chunks: Chunk[] = [];
  for (const [k, lista] of Object.entries(parsed)) {
    const cat = mapeamento[k];
    if (!cat || !Array.isArray(lista)) continue;
    for (const item of lista) {
      const conteudo = limparChunk(String(item?.conteudo ?? ""));
      const titulo = String(item?.titulo ?? "").trim().slice(0, 120) || cat;
      if (chunkValido({ titulo, conteudo })) {
        chunks.push({ categoria: cat, titulo, conteudo, origem: "ia" });
      }
    }
  }
  return chunks;
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
  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";

  let body: ReqBody;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body?.empresa_id || !body?.prompt_principal || !body?.base) {
    return new Response(JSON.stringify({ error: "Campos obrigatórios: empresa_id, prompt_principal, base" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Salva (upsert lógico — sempre inserindo uma nova versão) o prompt principal
  const tituloPrompt = body.titulo_prompt?.trim() || "Prompt principal";
  const { data: promptRow, error: promptErr } = await admin
    .from("prompts")
    .insert({
      empresa_id: body.empresa_id,
      titulo: tituloPrompt,
      conteudo: body.prompt_principal,
    })
    .select("id")
    .single();
  if (promptErr) {
    console.error("Erro salvando prompt:", promptErr);
    return new Response(JSON.stringify({ error: "Falha ao salvar prompt principal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2) Chunks determinísticos da própria base
  const chunksBase = chunksDaBase(body.base);

  // 3) RAGs geradas por IA
  let chunksIA: Chunk[] = [];
  let geracaoErro: string | null = null;
  try {
    chunksIA = await gerarRagsIA(body.base, body.prompt_principal, apiKey, model);
  } catch (e) {
    geracaoErro = e instanceof Error ? e.message : String(e);
    console.error("Falha gerar RAGs IA:", geracaoErro);
  }

  return new Response(
    JSON.stringify({
      prompt_id: promptRow?.id,
      chunks_propostos: [...chunksBase, ...chunksIA],
      total: chunksBase.length + chunksIA.length,
      geracao_ia_erro: geracaoErro,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
