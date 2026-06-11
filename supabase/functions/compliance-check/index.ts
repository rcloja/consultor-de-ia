// Edge Function: compliance-check
// Analisa conteúdo (base de conhecimento, prompt, descrição, produtos, mensagens)
// em busca de temas proibidos antes de aprovar a implantação de um agente.
// Usa LOVABLE_API_KEY (gateway) com fallback para OPENAI_API_KEY.
// Grava em public.agent_compliance_reviews.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RiskLevel = "baixo" | "medio" | "alto" | "critico";
type Decision = "liberado" | "revisao_humana" | "bloqueado";

interface ReqBody {
  tenant_id?: string | null;
  agent_id?: string | null;
  user_id?: string | null;
  conversation_id?: string | null;
  trigger_event?: string;
  payload: {
    nome_negocio?: string;
    descricao_empresa?: string;
    base?: Record<string, string[]> | unknown;
    prompt_persona?: string;
    produtos_servicos?: string;
    mensagens_automaticas?: string;
    urls?: string[];
    termos_comerciais?: string;
    [k: string]: unknown;
  };
}

const SYSTEM_PROMPT = `Você é um analista de COMPLIANCE da plataforma AtendenteAI. Sua função é detectar uso indevido para atividades ilegais, ilícitas, abusivas ou proibidas.

TEMAS PROIBIDOS (categorias):
1. golpe_fraude — golpes, fraudes, estelionato, phishing, engenharia social, captação enganosa.
2. piramide_mlm — pirâmides, Ponzi, MLM abusivo, promessa de ganhos garantidos.
3. jogos_apostas_ilegais — jogos ilegais, apostas/cassinos não autorizados, rifas/bingos ilegais.
4. conteudo_adulto — conteúdo sexual explícito, prostituição, acompanhantes, exploração sexual, qualquer erotização de menores.
5. drogas — venda, intermediação ou incentivo a drogas ilícitas.
6. armas — armas, munições, explosivos, instruções criminosas.
7. lavagem — lavagem de dinheiro, ocultação patrimonial, laranjas, contas falsas, evasão.
8. documentos_falsos — falsificação, clonagem, contas/chips fraudulentos.
9. hacking_spam — invasão, malware, spam, disparos abusivos, roubo de dados.
10. enganoso_profissional — atividades médicas/jurídicas/financeiras enganosas, sem autorização, com promessa garantida.
11. discurso_odio — ódio, discriminação, assédio, ameaças, incentivo à violência.
12. burla_regras — tentativas de burlar leis, plataformas, bancos, gateways, marketplaces, políticas públicas.

REGRAS DE CLASSIFICAÇÃO:
- CRITICO: menção direta a golpe, fraude, pirâmide, cassino ilegal, aposta clandestina, conteúdo adulto explícito, venda de droga, documento falso, invasão de sistema.
- ALTO: promessa de dinheiro fácil, renda/lucro garantido, retorno garantido, investimento sem risco, "ganhe sem vender".
- MEDIO: termos ambíguos — "sinais", "grupo VIP", "robô de ganhos", "operação automática", "jogo secreto", "método garantido", "esquema", "conta laranja", "laranja", "chip frio", "CPF para aprovação".
- BAIXO: nada suspeito detectado.
- Se houver tentativa de mascarar atividade proibida com sinônimos, MANTER bloqueio.

DECISÃO:
- baixo → liberado
- medio → revisao_humana
- alto → revisao_humana
- critico → bloqueado

Responda SOMENTE com JSON válido neste schema:
{
  "risk_level": "baixo|medio|alto|critico",
  "decision": "liberado|revisao_humana|bloqueado",
  "detected_categories": ["..."],
  "suspicious_excerpt": "trecho literal mais suspeito ou string vazia",
  "justification": "1-2 frases curtas em pt-BR"
}`;

async function classifyWithLLM(content: string): Promise<{
  risk_level: RiskLevel;
  decision: Decision;
  detected_categories: string[];
  suspicious_excerpt: string;
  justification: string;
}> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  let url: string;
  let headers: Record<string, string>;
  let model: string;

  if (lovableKey) {
    url = "https://ai.gateway.lovable.dev/v1/chat/completions";
    headers = {
      "Content-Type": "application/json",
      "Lovable-API-Key": lovableKey,
    };
    model = "google/gemini-3-flash-preview";
  } else if (openaiKey) {
    url = "https://api.openai.com/v1/chat/completions";
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    };
    model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
  } else {
    throw new Error("Nenhuma chave de IA configurada (LOVABLE_API_KEY/OPENAI_API_KEY).");
  }

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analise o conteúdo abaixo e classifique conforme o schema:\n\n${content}`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`LLM HTTP ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data = await resp.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text);

  const allowedRisk: RiskLevel[] = ["baixo", "medio", "alto", "critico"];
  const risk: RiskLevel = allowedRisk.includes(parsed.risk_level)
    ? parsed.risk_level
    : "baixo";
  const decision: Decision =
    risk === "critico"
      ? "bloqueado"
      : risk === "baixo"
      ? "liberado"
      : "revisao_humana";

  return {
    risk_level: risk,
    decision,
    detected_categories: Array.isArray(parsed.detected_categories)
      ? parsed.detected_categories.map(String)
      : [],
    suspicious_excerpt: String(parsed.suspicious_excerpt ?? ""),
    justification: String(parsed.justification ?? ""),
  };
}

// Heurística simples como rede de segurança (caso o LLM subestime).
function heuristicFloor(content: string): RiskLevel {
  const c = content.toLowerCase();
  const critico = [
    "venda de droga", "cocaina", "maconha para venda", "documento falso",
    "cpf falso", "cnh falsa", "rg falso", "clonagem de cartão", "clonar cartão",
    "invadir sistema", "hackear", "malware", "phishing", "cassino clandestino",
    "aposta clandestina", "pornô", "acompanhante sexual", "garota de programa",
    "prostituição", "menor de idade sexo",
  ];
  const alto = [
    "renda garantida", "lucro garantido", "ganho garantido", "dinheiro fácil",
    "ganhe sem vender", "investimento sem risco", "retorno garantido",
    "pirâmide", "marketing multinível",
  ];
  const medio = [
    "sinais", "grupo vip", "robô de ganhos", "operação automática",
    "jogo secreto", "método garantido", "esquema", "conta laranja", "laranja",
    "chip frio", "cpf para aprovação",
  ];
  if (critico.some((k) => c.includes(k))) return "critico";
  if (alto.some((k) => c.includes(k))) return "alto";
  if (medio.some((k) => c.includes(k))) return "medio";
  return "baixo";
}

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const rank: Record<RiskLevel, number> = { baixo: 0, medio: 1, alto: 2, critico: 3 };
  return rank[a] >= rank[b] ? a : b;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const content = JSON.stringify(body.payload ?? {}, null, 2);

  let llmResult: Awaited<ReturnType<typeof classifyWithLLM>>;
  try {
    llmResult = await classifyWithLLM(content);
  } catch (e) {
    console.error("Falha LLM compliance:", e);
    // fallback: usa apenas heurística
    const r = heuristicFloor(content);
    llmResult = {
      risk_level: r,
      decision:
        r === "critico" ? "bloqueado" : r === "baixo" ? "liberado" : "revisao_humana",
      detected_categories: [],
      suspicious_excerpt: "",
      justification: "Análise via heurística (LLM indisponível).",
    };
  }

  const floor = heuristicFloor(content);
  const finalRisk = maxRisk(llmResult.risk_level, floor);
  const finalDecision: Decision =
    finalRisk === "critico"
      ? "bloqueado"
      : finalRisk === "baixo"
      ? "liberado"
      : "revisao_humana";

  // Persistir review (sempre, para auditoria — inclusive os liberados).
  let reviewId: string | null = null;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);
    const { data, error } = await admin
      .from("agent_compliance_reviews")
      .insert({
        tenant_id: body.tenant_id ?? null,
        agent_id: body.agent_id ?? null,
        user_id: body.user_id ?? null,
        conversation_id: body.conversation_id ?? null,
        risk_level: finalRisk,
        detected_categories: llmResult.detected_categories,
        suspicious_excerpt: llmResult.suspicious_excerpt || null,
        decision: finalDecision,
        review_status: finalDecision === "liberado" ? "aprovado" : "pendente",
        justification: llmResult.justification,
        trigger_event: body.trigger_event ?? "implantacao",
        payload: body.payload ?? {},
      })
      .select("id")
      .single();
    if (error) console.error("Erro ao salvar review:", error);
    else reviewId = data?.id ?? null;
  } catch (e) {
    console.error("Erro persistindo compliance:", e);
  }

  return new Response(
    JSON.stringify({
      review_id: reviewId,
      risk_level: finalRisk,
      decision: finalDecision,
      detected_categories: llmResult.detected_categories,
      suspicious_excerpt: llmResult.suspicious_excerpt,
      justification: llmResult.justification,
      allow_proceed: finalDecision === "liberado",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
