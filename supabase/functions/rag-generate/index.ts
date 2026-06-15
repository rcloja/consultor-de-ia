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

// Chunks padrão de tom_de_voz, vendas e restrições — entram mesmo se a IA falhar.
function chunksPadrao(): Chunk[] {
  return [
    {
      categoria: "tom_de_voz",
      titulo: "Estilo WhatsApp curto e comercial",
      origem: "base",
      conteudo:
        "Responda como um consultor comercial experiente pelo WhatsApp: no máximo 4 linhas, 1 parágrafo, linguagem simples e direta. Nunca faça mais de 1 pergunta por vez e nunca pergunte apenas para prolongar a conversa. Use no máximo 1 emoji discreto (🙂 ou 👍). Toda resposta de cunho comercial deve terminar com uma CTA (chamada para ação) clara.",
    },
    {
      categoria: "tom_de_voz",
      titulo: "Palavras a evitar",
      origem: "base",
      conteudo:
        "Nunca use 'conforme mencionado acima', 'descrito abaixo', 'texto anterior', 'empresa mencionada' nem 'antes preciso entender melhor'. Cada resposta deve fazer sentido sozinha, como uma mensagem real de WhatsApp, sem fricção desnecessária.",
    },
    {
      categoria: "vendas",
      titulo: "Diagnóstico rápido (máx. 2 perguntas)",
      origem: "base",
      conteudo:
        "Faça no máximo 2 perguntas para entender: segmento da empresa, como atende hoje e principal dificuldade. Se o cliente já tiver informado espontaneamente qualquer um desses pontos, NÃO pergunte de novo: avance direto para apresentação da solução e recomendação de plano. Fluxo desejado: Entender → Recomendar → Fechar.",
    },
    {
      categoria: "vendas",
      titulo: "Intenção de compra: responder direto",
      origem: "base",
      conteudo:
        "Se o cliente perguntar 'quanto custa', 'quais os planos', 'como funciona', 'tem teste grátis', 'tem fidelidade', 'como contratar' ou 'posso cancelar', ele já demonstrou interesse comercial. NÃO faça novas perguntas investigativas: responda diretamente, apresente preços e avance para o fechamento com uma CTA.",
    },
    {
      categoria: "vendas",
      titulo: "Tabela de preços (apresentar sem rodeios)",
      origem: "base",
      conteudo:
        "Planos da AtendenteAI: Plano Start R$ 597/mês, Plano Profissional R$ 797/mês, Plano Empresarial R$ 997/mês. Extras: R$ 59/mês por item adicional. Sempre que o cliente perguntar valores, demonstrar intenção de compra ou já tiver explicado a necessidade, apresente os preços imediatamente. Nunca esconda preço nem responda 'antes preciso entender melhor'.",
    },
    {
      categoria: "vendas",
      titulo: "Recomendação automática de plano",
      origem: "base",
      conteudo:
        "Após entender minimamente o cenário, recomende o plano mais adequado como um consultor. Ex.: 'Como vocês atendem pelo WhatsApp e precisam reduzir o tempo de resposta, o Plano Profissional é a melhor opção'. Aja como especialista, não como um FAQ.",
    },
    {
      categoria: "vendas",
      titulo: "CTAs obrigatórias em respostas comerciais",
      origem: "base",
      conteudo:
        "Toda resposta comercial deve terminar com uma CTA, escolhendo a mais adequada: 'Posso te indicar o plano ideal?', 'Quer que eu explique como funciona a implantação?', 'Posso simular sua operação?', 'Quer iniciar um teste gratuito?', 'Posso te mostrar o investimento mensal?'. Nunca finalize sem CTA.",
    },
    {
      categoria: "vendas",
      titulo: "Gatilho de fechamento",
      origem: "base",
      conteudo:
        "Se o cliente já informou segmento, forma de atendimento OU principal problema, assuma postura de fechamento: recomende o plano, mostre o preço e convide para o próximo passo. Evite o ciclo 'perguntar → perguntar → perguntar → explicar demais'.",
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
        "Se a informação não estiver na base (exceto preços já listados), não invente valores, prazos ou políticas. Diga com naturalidade que vai confirmar com a equipe humana e continue conduzindo a conversa para o fechamento.",
    },
  ];
}

const SYSTEM_ARQUITETO = `Você é um Arquiteto de Conhecimento sênior especializado em agentes COMERCIAIS de WhatsApp. A partir de uma base estruturada de uma empresa e de um rascunho de prompt principal, você precisa:

1) REFINAR o prompt principal mantendo APENAS:
   - Persona do agente (consultor comercial experiente, objetivo, simpático, orientado a conversão)
   - Objetivos comerciais (entender rapidamente, recomendar, fechar)
   - Comportamento esperado segundo as REGRAS COMERCIAIS abaixo
   - Regras e limites
   - Estilo de resposta (WhatsApp: máx. 4 linhas, 1 parágrafo, máx. 1 pergunta por vez, 1 emoji discreto)
   - Quando perguntar (máx. 2 perguntas de diagnóstico; nunca repetir o que o cliente já informou)
   - Quando transferir para humano

   REGRAS COMERCIAIS OBRIGATÓRIAS que o prompt refinado deve deixar explícitas:
   a) Diagnóstico rápido: no máximo 2 perguntas para entender segmento, forma de atendimento atual e principal dificuldade. Se o cliente já tiver dado essas informações, NÃO perguntar de novo.
   b) Detecção de intenção de compra: se o cliente perguntar preço, planos, como funciona, teste grátis, fidelidade, como contratar ou cancelamento, considerar interesse comercial e responder direto, SEM novas perguntas investigativas.
   c) Apresentação de preços: nunca esconder valores. Quando o cliente perguntar preço, demonstrar intenção ou já tiver explicado a necessidade, apresentar imediatamente os planos (Start R$ 597/mês, Profissional R$ 797/mês, Empresarial R$ 997/mês, Extras R$ 59/mês por item). Nunca dizer 'antes preciso entender melhor'.
   d) Recomendação automática: após entender minimamente o cenário, sugerir o plano mais adequado como consultor experiente.
   e) CTA obrigatória: toda resposta comercial deve terminar com uma chamada para ação clara.
   f) Gatilho de fechamento: se o cliente já informou segmento, forma de atendimento OU principal problema, assumir postura de fechamento (Entender → Recomendar → Fechar) — evitar perguntar repetidamente.
   g) Tamanho: máx. 4 linhas, 1 parágrafo, sem listas longas nem explicações excessivas. Preferir 'resposta curta + CTA' em vez de 'resposta longa + detalhes'.
   h) Personalidade: consultor comercial humano, transparente em preços, focado em resolver e converter; nunca robô burocrático ou entrevistador.

   REMOVA do prompt qualquer FAQ, lista de produtos, preços detalhados, políticas, casos de uso, exemplos longos — esses viram chunks de RAG. O prompt refinado deve ter no máximo ~2000 caracteres, conciso e estruturado em seções curtas.

2) GERAR chunks de conhecimento em 6 categorias:
   - faq (6-10 itens): preço, prazo, garantia, cancelamento, entrega, suporte, troca, funcionamento.
   - objecoes (6-8 itens): "está caro", "vou pensar", "já tenho fornecedor", "não preciso", "medo de IA", "falar com sócio". Cada conteúdo: motivo provável + abordagem curta + resposta sugerida terminada em CTA.
   - casos_de_uso (4-6 itens): "Cliente: ... | Agente: ..." em uma linha, sempre com CTA no final (curioso, decidido, pediu preço, objeção, fechamento).
   - vendas (5-8 itens): benefícios, diferenciais, gatilhos mentais, provas sociais, scripts de fechamento curtos.
   - tom_de_voz (2-3 itens extras específicos da marca).
   - restricoes (2-3 itens extras específicos do negócio).

3) AVALIAR a qualidade da implantação com um SCORE de 0 a 100.
   - 0-69 = exigir_melhorias, 70-85 = sugerir_melhorias, 86-100 = aprovado.
   - Liste 2-5 pontos_fortes e 2-5 pontos_fracos curtos e objetivos.

REGRAS ABSOLUTAS:
- Responda APENAS com JSON válido no schema solicitado.
- Cada chunk: 150 a 900 caracteres, autocontido, sem "acima/abaixo/mencionado/anteriormente".
- Não invente preços novos: use somente os planos listados acima.
- Português do Brasil, tom WhatsApp curto e comercial.

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
