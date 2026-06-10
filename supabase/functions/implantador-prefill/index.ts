// Edge Function: implantador-prefill
// Recebe URL do site da empresa e/ou textos extraídos de arquivos enviados,
// usa Firecrawl para raspar o site (quando informado) e a OpenAI para
// estruturar uma primeira versão da Base de Conhecimento.
//
// Resposta:
// {
//   base: Record<CAMPO, string[]>,
//   summary: string,         // bullet-list em markdown do que foi lido/relevante
//   sources: string[],       // URLs e nomes de arquivos processados
//   model: string,
//   usage: { input_tokens, output_tokens }
// }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CAMPOS = [
  "Empresa",
  "Produtos",
  "Serviços",
  "Público-Alvo",
  "Processo Comercial",
  "FAQ",
  "Objeções",
  "Diferenciais",
  "Políticas",
  "Casos de Sucesso",
  "Termos do Segmento",
  "Fluxo de Atendimento",
  "Regras do Agente",
] as const;

interface UploadedDoc {
  name: string;
  text: string; // já extraído no cliente
}

interface Body {
  url?: string;
  documents?: UploadedDoc[];
  language?: string;
}

const SYSTEM = `Você é o "Arquiteto de Conhecimento IA". Sua tarefa é ler o material fornecido sobre uma empresa (conteúdo do site e/ou documentos enviados) e estruturar uma primeira versão da Base de Conhecimento para treinar um agente de IA de atendimento.

Responda APENAS com um JSON válido no seguinte formato (sem markdown, sem comentários):
{
  "base": {
    "Empresa": [ "..." ],
    "Produtos": [ "..." ],
    "Serviços": [ "..." ],
    "Público-Alvo": [ "..." ],
    "Processo Comercial": [ "..." ],
    "FAQ": [ "..." ],
    "Objeções": [ "..." ],
    "Diferenciais": [ "..." ],
    "Políticas": [ "..." ],
    "Casos de Sucesso": [ "..." ],
    "Termos do Segmento": [ "..." ],
    "Fluxo de Atendimento": [ "..." ],
    "Regras do Agente": [ "..." ]
  },
  "summary": "- bullet em markdown do que foi lido e considerado relevante\\n- outro bullet..."
}

Regras:
- Use apenas informações presentes no material. NÃO invente.
- Se um campo não tiver informação, deixe o array vazio [].
- Frases curtas e objetivas (até ~25 palavras cada).
- O "summary" deve listar de forma clara o que foi extraído e de qual fonte (ex.: "Site → produtos identificados: X, Y"). Use português do Brasil.`;

async function firecrawlScrape(url: string, apiKey: string): Promise<string> {
  const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Firecrawl scrape falhou (${resp.status}): ${t.slice(0, 300)}`);
  }
  const data = await resp.json();
  const md: string =
    data?.markdown ?? data?.data?.markdown ?? data?.data?.content ?? "";
  return typeof md === "string" ? md : "";
}

async function firecrawlMap(url: string, apiKey: string): Promise<string[]> {
  try {
    const resp = await fetch("https://api.firecrawl.dev/v2/map", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, limit: 30 }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const links: string[] = data?.links ?? data?.data?.links ?? [];
    return Array.isArray(links) ? links : [];
  } catch {
    return [];
  }
}

function pickRelevantLinks(links: string[], base: string): string[] {
  const keywords = [
    "sobre",
    "about",
    "produto",
    "product",
    "servic",
    "service",
    "solucao",
    "solucoes",
    "soluti",
    "preco",
    "pricing",
    "plano",
    "plans",
    "faq",
    "pergunt",
    "garantia",
    "politica",
    "policy",
    "term",
    "diferen",
    "contato",
    "contact",
  ];
  const baseHost = (() => {
    try { return new URL(base).host; } catch { return ""; }
  })();
  const filtered = links.filter((l) => {
    try {
      const u = new URL(l);
      if (baseHost && u.host !== baseHost) return false;
      const path = u.pathname.toLowerCase();
      return keywords.some((k) => path.includes(k));
    } catch {
      return false;
    }
  });
  return Array.from(new Set(filtered)).slice(0, 6);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
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

  const url = body.url?.trim();
  const docs = Array.isArray(body.documents) ? body.documents : [];

  if (!url && docs.length === 0) {
    return new Response(
      JSON.stringify({ error: "Forneça uma URL ou ao menos um documento." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return new Response(
      JSON.stringify({ error: "Serviço de IA indisponível no momento." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
  const sources: string[] = [];
  const chunks: { source: string; text: string }[] = [];

  // 1) Site via Firecrawl
  if (url) {
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({
          error:
            "Scraping de site indisponível: conector Firecrawl não está configurado.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    try {
      const main = await firecrawlScrape(url, firecrawlKey);
      if (main) {
        sources.push(url);
        chunks.push({ source: url, text: main });
      }
      // pega páginas auxiliares relevantes
      const links = await firecrawlMap(url, firecrawlKey);
      const relevant = pickRelevantLinks(links, url);
      for (const link of relevant) {
        try {
          const t = await firecrawlScrape(link, firecrawlKey);
          if (t) {
            sources.push(link);
            chunks.push({ source: link, text: t });
          }
        } catch (e) {
          console.warn("falha em página secundária:", link, e);
        }
      }
    } catch (e) {
      console.error("Firecrawl erro:", e);
      return new Response(
        JSON.stringify({
          error:
            "Não consegui ler o site informado agora. Verifique a URL ou tente novamente.",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  // 2) Documentos enviados (texto já extraído no cliente)
  for (const d of docs) {
    if (!d?.text || typeof d.text !== "string") continue;
    const name = d.name || "documento";
    sources.push(name);
    chunks.push({ source: name, text: d.text });
  }

  // Limita o tamanho para não estourar tokens
  const MAX_CHARS_PER_CHUNK = 12000;
  const MAX_TOTAL_CHARS = 60000;
  let total = 0;
  const trimmed = chunks.map((c) => {
    const slice = c.text.slice(0, MAX_CHARS_PER_CHUNK);
    total += slice.length;
    return { source: c.source, text: slice };
  });
  if (total > MAX_TOTAL_CHARS) {
    // corta proporcionalmente
    const ratio = MAX_TOTAL_CHARS / total;
    for (const c of trimmed) c.text = c.text.slice(0, Math.floor(c.text.length * ratio));
  }

  const materialMontado = trimmed
    .map((c, i) => `--- FONTE ${i + 1}: ${c.source} ---\n${c.text}`)
    .join("\n\n");

  const userMsg = `Material da empresa para extração da Base de Conhecimento (campos válidos: ${CAMPOS.join(", ")}):\n\n${materialMontado}`;

  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";

  try {
    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 2000,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("OpenAI prefill erro:", aiResp.status, t);
      return new Response(
        JSON.stringify({
          error:
            "Não consegui estruturar o material agora. Tente novamente em instantes.",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await aiResp.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { base?: Record<string, unknown>; summary?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const baseOut: Record<string, string[]> = {};
    for (const campo of CAMPOS) {
      const v = parsed.base?.[campo];
      if (Array.isArray(v)) {
        baseOut[campo] = v
          .map((x) => (typeof x === "string" ? x.trim() : String(x).trim()))
          .filter(Boolean);
      } else if (typeof v === "string" && v.trim()) {
        baseOut[campo] = [v.trim()];
      } else {
        baseOut[campo] = [];
      }
    }

    return new Response(
      JSON.stringify({
        base: baseOut,
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
        sources,
        model,
        usage: {
          input_tokens: data?.usage?.prompt_tokens ?? 0,
          output_tokens: data?.usage?.completion_tokens ?? 0,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("Erro inesperado prefill:", e);
    return new Response(
      JSON.stringify({
        error: "Falha ao processar o material. Tente novamente em instantes.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
