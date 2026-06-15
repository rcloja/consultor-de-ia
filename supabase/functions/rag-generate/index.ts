// Edge Function: rag-generate
// Arquiteto de Conhecimento (v2):
//  1) REFINA o prompt principal recebido: mantém só persona/objetivos/comportamento/
//     regras/limites/estilo/quando perguntar/quando transferir. Remove FAQ, produtos,
//     políticas, casos — esses viram chunks.
//  2) Gera RAGs estruturadas em 6 categorias: faq, objecoes, casos_de_uso, vendas,
//     tom_de_voz, restricoes (além dos chunks determinísticos da base).
//  3) Calcula um SCORE de qualidade (0-100) com pontos fortes/fracos e status.
//  4) Salva o prompt REFINADO em public.prompts e devolve os chunks PROPOSTOS para
//     revisão humana antes da persistência vetorial (feita por rag-save).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

interface ScoreImplantacao {
  total: number;
  status: "aprovado" | "sugerir_melhorias" | "exigir_melhorias";
  pontos_fortes: string[];
  pontos_fracos: string[];
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
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_`#>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const frases = t.split(/(?<=[\.\!\?])\s+/);
  const filtradas = frases.filter(
    (f) => !REFS_PROIBIDAS.some((r) => f.toLowerCase().includes(r)),
  );
  return filtradas.join(" ").trim();
}

function chunkValido(c: { titulo: string; conteudo: string }): boolean {
  if (!c?.conteudo) return false;
  const len = c.conteudo.length;
  return len >= 80 && len <= 1400;
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

  if (base["Empresa"]?.length) push("empresa", "Sobre a empresa", join("Empresa"));
  if (base["Produtos e serviços"]?.length) {
    for (const item of base["Produtos e serviços"]) {
      const cat: Categoria = /serv|atend|consult/i.test(item) ? "servicos" : "produtos";
      push(cat, item.slice(0, 80), item);
    }
  }
  if (base["Público-alvo"]?.length) push("empresa", "Público-alvo", join("Público-alvo"));
  if (base["Tom de voz"]?.length) push("tom_de_voz", "Tom de voz do agente", join("Tom de voz"));
  if (base["Políticas e regras"]?.length) {
    for (const item of base["Políticas e regras"]) push("politicas", item.slice(0, 80), item);
  }
  if (base["Restrições"]?.length) push("restricoes", "O que o agente não deve fazer", join("Restrições"));
  if (base["Processo comercial"]?.length) push("vendas", "Processo comercial", join("Processo comercial"));
  if (base["FAQ"]?.length) {
    for (const item of base["FAQ"]) push("faq", item.slice(0, 80), item);
  }
  if (base["Atendimento"]?.length) push("atendimento", "Fluxo de atendimento", join("Atendimento"));
  return out;
}

// Chunks padrão de tom_de_voz e restrições — entram mesmo se a IA falhar.
function chunksPadrao(): Chunk[] {
  return [
    {
      categoria: "tom_de_voz",
      titulo: "Estilo WhatsApp curto",
      origem: "base",
      conteudo:
        "Responda como um consultor experiente em mensagens curtas de WhatsApp. Máximo 4 linhas, de preferência 1 parágrafo, até cerca de 300 caracteres. Linguagem simples, cordial e profissional. No máximo uma pergunta por vez e no máximo um emoji discreto (🙂 ou 👍). Evite listas longas, jargões e textos extensos.",
    },
    {
      categoria: "tom_de_voz",
      titulo: "Palavras a evitar",
      origem: "base",
      conteudo:
        "Nunca use expressões como 'conforme mencionado acima', 'descrito abaixo', 'texto anterior' ou 'empresa mencionada'. Nunca diga 'antes preciso entender melhor' quando já houver informação suficiente para ajudar. Cada resposta precisa fazer sentido sozinha, como uma mensagem real de WhatsApp.",
    },
    {
      categoria: "vendas",
      titulo: "Diagnóstico rápido (máx. 2 perguntas)",
      origem: "base",
      conteudo:
        "Para entender o cliente, faça no máximo 2 perguntas cobrindo: segmento/atividade, como opera hoje e principal dificuldade ou objetivo. Se ele já trouxe essas informações de forma espontânea, NÃO repita perguntas — avance direto para a recomendação. Nunca pergunte só para prolongar a conversa.",
    },
    {
      categoria: "vendas",
      titulo: "Intenção de compra → responder direto",
      origem: "base",
      conteudo:
        "Se o cliente perguntar preço, planos, como funciona, teste grátis, fidelidade, como contratar, cancelamento ou condições, entenda como interesse comercial. NÃO faça novas perguntas investigativas: responda direto com a informação da base e avance para o fechamento.",
    },
    {
      categoria: "vendas",
      titulo: "Transparência de preços e condições",
      origem: "base",
      conteudo:
        "Nunca esconda preço ou condição comercial que já esteja disponível. Se o cliente pediu valor, ou já explicou a necessidade, ou demonstrou intenção de compra, apresente as informações relevantes na hora. Proibido usar 'antes preciso entender melhor' ou frases que criem fricção desnecessária.",
    },
    {
      categoria: "vendas",
      titulo: "Recomendação consultiva",
      origem: "base",
      conteudo:
        "Depois de entender minimamente o cenário, recomende a solução mais adequada explicando em uma linha o motivo. Aja como consultor experiente, não como FAQ. Se houver várias opções, indique a mais indicada para o caso do cliente.",
    },
    {
      categoria: "vendas",
      titulo: "CTA obrigatório em respostas comerciais",
      origem: "base",
      conteudo:
        "Toda resposta comercial termina com uma chamada curta para a próxima etapa. Exemplos: 'Posso te indicar a melhor opção para o seu caso.', 'Quer que eu explique rapidamente como funciona?', 'Posso simular o cenário ideal para sua empresa.', 'Quer iniciar um teste?', 'Posso te mostrar os próximos passos.' Nunca encerre uma resposta comercial sem CTA.",
    },
    {
      categoria: "vendas",
      titulo: "Gatilho de fechamento",
      origem: "base",
      conteudo:
        "Se o cliente já informou segmento, forma de operação ou principal problema, assuma postura de fechamento. Fluxo desejado: Entender → Recomendar → Fechar. Evite o anti-padrão Entender → Perguntar → Perguntar → Perguntar → Explicar em excesso.",
    },
    {
      categoria: "restricoes",
      titulo: "Assuntos bloqueados",
      origem: "base",
      conteudo:
        "Não trate de golpes, pirâmides, jogos ilegais, conteúdo adulto, drogas, falsificações, invasões, armas ilegais ou qualquer atividade ilícita. Resposta padrão: 'Este assunto não pode ser tratado por aqui. Posso ajudar com os produtos e serviços autorizados da empresa 🙂'.",
    },
    {
      categoria: "restricoes",
      titulo: "Quando não souber",
      origem: "base",
      conteudo:
        "Se a informação não estiver na base, não invente valores, prazos ou políticas. Diga com naturalidade que vai confirmar com a equipe humana e siga a conversa pedindo o contato preferido do cliente.",
    },
  ];
}

const SYSTEM_ARQUITETO = `Você é um Arquiteto de Conhecimento sênior. 

PRINCÍPIO MESTRE (acima de qualquer outra regra):
Toda regra, instrução, chunk e prompt que você criar DEVE priorizar conversas naturais, objetivas e orientadas a resultado. É PROIBIDO gerar prompts longos, burocráticos, acadêmicos, formais ou cheios de seções/listas extensas — isso reduz conversão e piora a experiência do cliente final. Prefira linguagem simples e direta, em tópicos curtos, como se estivesse orientando um vendedor humano experiente. Se um item puder ser cortado sem perder clareza, corte.

A partir de uma base estruturada de uma empresa e de um rascunho de prompt principal, você precisa:

1) REFINAR o prompt principal mantendo APENAS:
   - Persona do agente (consultor experiente, objetivo, simpático, orientado à conversão — não entrevistador, não FAQ burocrático)
   - Objetivos (resolver o problema do cliente e conduzir naturalmente ao fechamento)
   - Comportamento esperado (diagnóstico rápido em até 2 perguntas; quando o cliente já trouxe segmento/operação/dor, NÃO repete perguntas e avança para recomendação; quando há intenção de compra — preço, planos, como funciona, teste, fidelidade, contratar, cancelar, condições — responde direto e avança para o fechamento)
   - Regras e limites (sem inventar dados; sem esconder preços já disponíveis; sem frases de fricção como "antes preciso entender melhor"; sem repetir perguntas; máximo 1 pergunta por vez)
   - Estilo de resposta (WhatsApp: máx. 4 linhas, preferência por 1 parágrafo curto, ~300 caracteres, 1 emoji discreto no máximo)
   - Quando perguntar antes de responder (apenas se faltar contexto MÍNIMO e o cliente ainda não tiver trazido)
   - Quando transferir para humano
   - CTA OBRIGATÓRIO em respostas comerciais (sempre termina com uma chamada curta para a próxima etapa)
   - FLUXO: Entender → Recomendar → Fechar. Evitar Perguntar → Perguntar → Perguntar.
   REMOVA do prompt qualquer FAQ, lista de produtos, preços, políticas detalhadas, casos de uso, exemplos longos — esses viram chunks de RAG. O prompt refinado deve ter no máximo ~1500 caracteres, em tópicos curtos e linguagem natural. Se passar disso, REESCREVA mais enxuto. Nada de jargão acadêmico, nada de seções burocráticas.

2) GERAR chunks de conhecimento em 6 categorias:
   - faq (6-10 itens): preço, prazo, garantia, cancelamento, entrega, suporte, troca, funcionamento. Respostas diretas, sem fricção.
   - objecoes (6-8 itens): "está caro", "vou pensar", "já tenho fornecedor", "não preciso", "medo de IA", "falar com sócio". Cada conteúdo: motivo provável + abordagem + resposta curta sugerida (com CTA no final).
   - casos_de_uso (4-6 itens): "Cliente: ... | Agente: ..." em uma linha, mostrando diagnóstico rápido, recomendação consultiva e fechamento com CTA.
   - vendas (5-8 itens): benefícios, diferenciais, gatilhos mentais, provas sociais, frases de fechamento, exemplos de CTA prontos para usar.
   - tom_de_voz (2-3 itens extras específicos da marca).
   - restricoes (2-3 itens extras específicos do negócio).

3) AVALIAR a qualidade da implantação com um SCORE de 0 a 100.
   - 0-69 = exigir_melhorias, 70-85 = sugerir_melhorias, 86-100 = aprovado.
   - Liste 2-5 pontos_fortes e 2-5 pontos_fracos curtos e objetivos. Penalize: prompt que pede muitas perguntas, prompt que esconde preços, ausência de CTA, ausência de postura de fechamento.

REGRAS ABSOLUTAS:
- Responda APENAS com JSON válido no schema solicitado.
- Cada chunk: 150 a 900 caracteres, autocontido, sem "acima/abaixo/mencionado/anteriormente".
- Não invente preços, prazos, garantias, políticas: se faltar, oriente o agente a confirmar com a equipe.
- Português do Brasil, tom WhatsApp curto, postura consultiva e de fechamento.

SCHEMA JSON:
{
  "prompt_principal_refinado": "...",
  "score": {
    "total": 0-100,
    "status": "aprovado" | "sugerir_melhorias" | "exigir_melhorias",
    "pontos_fortes": ["...", "..."],
    "pontos_fracos": ["...", "..."]
  },
  "chunks": {
    "faq":          [{"titulo":"...","conteudo":"..."}],
    "objecoes":     [{"titulo":"...","conteudo":"..."}],
    "casos_de_uso": [{"titulo":"...","conteudo":"..."}],
    "vendas":       [{"titulo":"...","conteudo":"..."}],
    "tom_de_voz":   [{"titulo":"...","conteudo":"..."}],
    "restricoes":   [{"titulo":"...","conteudo":"..."}]
  }
}`;

interface SaidaIA {
  prompt_refinado: string;
  score: ScoreImplantacao | null;
  chunks: Chunk[];
}

async function chamarArquitetoIA(
  base: Record<string, string[]>,
  promptPrincipal: string,
  apiKey: string,
  model: string,
): Promise<SaidaIA> {
  const userContent =
    `RASCUNHO DO PROMPT PRINCIPAL:\n${promptPrincipal.slice(0, 8000)}\n\n` +
    `BASE ESTRUTURADA (JSON):\n${JSON.stringify(base, null, 2)}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 5000,
      messages: [
        { role: "system", content: SYSTEM_ARQUITETO },
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
  const parsed = JSON.parse(raw);

  const promptRef = String(parsed?.prompt_principal_refinado ?? "").trim();

  const mapeamento: Record<string, Categoria> = {
    faq: "faq", objecoes: "objecoes", casos_de_uso: "casos_de_uso",
    vendas: "vendas", tom_de_voz: "tom_de_voz", restricoes: "restricoes",
  };
  const chunks: Chunk[] = [];
  const grupos = parsed?.chunks ?? {};
  for (const [k, lista] of Object.entries(grupos)) {
    const cat = mapeamento[k];
    if (!cat || !Array.isArray(lista)) continue;
    for (const item of lista as Array<{ titulo: string; conteudo: string }>) {
      const conteudo = limparChunk(String(item?.conteudo ?? ""));
      const titulo = String(item?.titulo ?? "").trim().slice(0, 120) || cat;
      if (chunkValido({ titulo, conteudo })) {
        chunks.push({ categoria: cat, titulo, conteudo, origem: "ia" });
      }
    }
  }

  let score: ScoreImplantacao | null = null;
  const s = parsed?.score;
  if (s && typeof s.total === "number") {
    const total = Math.max(0, Math.min(100, Math.round(s.total)));
    const status: ScoreImplantacao["status"] =
      total >= 86 ? "aprovado" : total >= 70 ? "sugerir_melhorias" : "exigir_melhorias";
    score = {
      total,
      status,
      pontos_fortes: Array.isArray(s.pontos_fortes) ? s.pontos_fortes.slice(0, 6).map(String) : [],
      pontos_fracos: Array.isArray(s.pontos_fracos) ? s.pontos_fracos.slice(0, 6).map(String) : [],
    };
  }

  return { prompt_refinado: promptRef, score, chunks };
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

  // 1) Chunks determinísticos a partir da base estruturada
  const chunksBase = chunksDaBase(body.base);
  const chunksFixos = chunksPadrao();

  // 2) Chama o Arquiteto (refina prompt + RAGs + score)
  let promptFinal = body.prompt_principal.trim();
  let chunksIA: Chunk[] = [];
  let score: ScoreImplantacao | null = null;
  let geracaoErro: string | null = null;
  try {
    const out = await chamarArquitetoIA(body.base, body.prompt_principal, apiKey, model);
    if (out.prompt_refinado && out.prompt_refinado.length >= 200) {
      promptFinal = out.prompt_refinado;
    }
    chunksIA = out.chunks;
    score = out.score;
  } catch (e) {
    geracaoErro = e instanceof Error ? e.message : String(e);
    console.error("Falha Arquiteto IA:", geracaoErro);
  }

  // 3) Salva o prompt (REFINADO se a IA respondeu, senão o rascunho original)
  const tituloPrompt = body.titulo_prompt?.trim() || "Prompt principal";
  const { data: promptRow, error: promptErr } = await admin
    .from("prompts")
    .insert({
      empresa_id: body.empresa_id,
      titulo: tituloPrompt,
      conteudo: promptFinal,
    })
    .select("id")
    .single();
  if (promptErr) {
    console.error("Erro salvando prompt:", promptErr);
    return new Response(JSON.stringify({ error: "Falha ao salvar prompt principal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 4) Dedup simples por (categoria + titulo)
  const todos = [...chunksBase, ...chunksFixos, ...chunksIA];
  const vistos = new Set<string>();
  const chunks_propostos = todos.filter((c) => {
    const k = `${c.categoria}::${c.titulo.toLowerCase().trim()}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  return new Response(
    JSON.stringify({
      prompt_id: promptRow?.id,
      prompt_principal_refinado: promptFinal,
      score,
      chunks_propostos,
      total: chunks_propostos.length,
      geracao_ia_erro: geracaoErro,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
