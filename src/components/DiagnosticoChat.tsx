import { useEffect, useRef, useState } from "react";
import { Bot, Send, X, Sparkles, CheckCircle2, AlertCircle, FileText, RefreshCw, Save, Globe, Upload, Loader2, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { chamarImplantadorAi, type ImplantadorChatHistoryItem } from "@/lib/implantadorAi";
import { chamarPrefill, extractTextFromFile, type PrefillDoc } from "@/lib/prefill";
import {
  runComplianceCheck,
  MSG_REVISAO_HUMANA,
  MSG_BLOQUEIO_CRITICO,
  type ComplianceCheckResult,
} from "@/lib/compliance";
import {
  validarPayload,
  interpretarResposta,
  type RespostaInterpretada,
} from "@/lib/payloadValidation";

const AGENT_ID = "arquiteto-conhecimento-ia";

function gerarConversationId() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch { /* noop */ }
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type MessageAction = { label: string; kind: "retry" | "create" };

interface Message {
  role: "agent" | "user" | "system";
  text: string;
  tone?: "save" | "gap" | "info" | "error";
  title?: string;
  actions?: MessageAction[];
}

interface Pergunta {
  texto: string;
  etapaIdx: number;
  campo: string;
  lacunaSe?: (resp: string) => boolean;
  lacunaMsg?: string;
  opcional?: boolean;
}

const SKIP_REGEX = /^(pular|skip|n[aã]o|nao quero|sem nome|nenhum|nenhuma|--|-)$/i;

function derivarNomeAgente(base: Record<string, string[]>): string {
  const escolhido = (base["Nome do Agente"] ?? []).map((s) => s?.trim()).find((s) => s && !SKIP_REGEX.test(s));
  if (escolhido) return escolhido;
  const empresaRaw = (base["Empresa"] ?? [])[0] ?? "";
  // pega a primeira parte antes de vírgula/“e”/“-” e a primeira palavra significativa
  const limpo = empresaRaw.split(/[,;\-–—|]/)[0].replace(/\b(ltda|me|eireli|s\.?a\.?|epp)\b/gi, "").trim();
  const primeira = limpo.split(/\s+/).filter((w) => w.length > 2 && !/^(da|de|do|das|dos|the|a|o)$/i.test(w))[0] ?? "";
  const nome = primeira ? primeira[0].toUpperCase() + primeira.slice(1).toLowerCase() : "IA";
  return `Agente ${nome}`;
}

const ETAPAS = [
  "Conhecendo a empresa",
  "Produtos e serviços",
  "Processo comercial",
  "Dúvidas frequentes",
  "Objeções de venda",
  "Diferenciais competitivos",
  "Processos internos",
  "Políticas e regras",
  "Casos reais e linguagem do negócio",
  "Revisão final da Base de Conhecimento",
];

const curta = (r: string) => r.trim().split(/\s+/).length < 4;

const PERGUNTAS: Pergunta[] = [
  {
    texto:
      "Antes de tudo, como você gostaria de chamar o seu agente de IA? (Opcional — se preferir, digite 'pular' e usaremos 'Agente <nome da sua empresa>', por exemplo 'Agente Colombo'.)",
    etapaIdx: 0,
    campo: "Nome do Agente",
    opcional: true,
  },
  { texto: "Para começarmos, qual é o nome da sua empresa e em qual segmento ela atua?", etapaIdx: 0, campo: "Empresa" },
  { texto: "Há quanto tempo sua empresa está no mercado e qual região você atende?", etapaIdx: 0, campo: "Empresa" },
  { texto: "Quem é o principal público que sua empresa atende hoje? (descreva quem são, faixa etária, nível cultural, hábitos e o que costumam buscar)", etapaIdx: 0, campo: "Público-Alvo", lacunaSe: curta, lacunaMsg: "Não definiu público-alvo com clareza" },
  { texto: "Quais são os principais produtos ou serviços que sua empresa oferece?", etapaIdx: 1, campo: "Produtos" },
  { texto: "Existe algum produto ou serviço que você considera o mais importante ou mais vendido?", etapaIdx: 1, campo: "Produtos" },
  { texto: "Como os clientes normalmente chegam até sua empresa?", etapaIdx: 2, campo: "Processo Comercial" },
  { texto: "Como acontece o atendimento desde o primeiro contato até a venda?", etapaIdx: 2, campo: "Processo Comercial" },
  { texto: "Depois que o cliente compra, existe algum processo de acompanhamento ou pós-venda?", etapaIdx: 2, campo: "Processo Comercial", lacunaSe: curta, lacunaMsg: "Processo de pós-venda precisa de mais detalhes" },
  { texto: "Quais são as perguntas que os clientes mais fazem antes de comprar?", etapaIdx: 3, campo: "FAQ" },
  { texto: "Para cada uma dessas perguntas, qual seria a resposta ideal que sua empresa gostaria que a IA desse?", etapaIdx: 3, campo: "FAQ" },
  { texto: "O que normalmente impede um cliente de fechar negócio com sua empresa?", etapaIdx: 4, campo: "Objeções", lacunaSe: curta, lacunaMsg: "Objeções comerciais incompletas" },
  { texto: "Quando o cliente apresenta essa objeção, qual costuma ser a melhor resposta para convencê-lo com segurança?", etapaIdx: 4, campo: "Objeções" },
  { texto: "Por que o cliente deveria escolher sua empresa e não um concorrente?", etapaIdx: 5, campo: "Diferenciais" },
  { texto: "Quais provas, resultados, garantias ou experiências reforçam esses diferenciais?", etapaIdx: 5, campo: "Diferenciais" },
  { texto: "Como funciona seu processo desde o primeiro contato até a entrega do serviço ou produto?", etapaIdx: 6, campo: "Fluxo de Atendimento" },
  { texto: "Existe alguma etapa que sempre precisa de aprovação humana antes da IA responder ou avançar?", etapaIdx: 6, campo: "Regras do Agente" },
  { texto: "Quais são as regras da sua empresa sobre garantia, troca, cancelamento, reembolso e prazos?", etapaIdx: 7, campo: "Políticas", lacunaSe: curta, lacunaMsg: "Política de reembolso/garantia ainda não definida" },
  { texto: "Existe alguma situação em que a IA nunca deve prometer algo ao cliente?", etapaIdx: 7, campo: "Regras do Agente" },
  { texto: "Pode me contar alguns exemplos de clientes que tiveram bons resultados com sua empresa?", etapaIdx: 8, campo: "Casos de Sucesso" },
  { texto: "Quais termos técnicos, expressões, gírias ou palavras do seu segmento a IA precisa conhecer?", etapaIdx: 8, campo: "Termos do Segmento" },
  { texto: "Como você gostaria que a IA falasse com seus clientes: mais formal, mais próxima, mais consultiva ou mais objetiva?", etapaIdx: 8, campo: "Regras do Agente" },
  { texto: "Existe alguma informação importante sobre sua empresa que ainda não perguntamos e que a IA precisa saber?", etapaIdx: 9, campo: "Empresa" },
  { texto: "Existe algum tipo de cliente, pedido ou situação que sua empresa prefere evitar?", etapaIdx: 9, campo: "Regras do Agente" },
  { texto: "Antes de finalizar, posso revisar a Base de Conhecimento construída e listar os pontos que ainda precisam ser completados?", etapaIdx: 9, campo: "Revisão" },
];

const TOTAL = PERGUNTAS.length;

const OPENING =
  "Olá! Vou ajudá-lo a transformar o conhecimento do seu negócio em uma base estruturada para que sua Inteligência Artificial consiga atender clientes de forma eficiente e segura. Farei algumas perguntas e, conforme avançarmos, organizarei todas as informações em uma base de conhecimento pronta para treinamento do agente.";

const ENDPOINT = "https://admin.atendenteai.com.br/api/consultor.php";

/**
 * Lê o ID do agente externo passado via query string (?agente=...).
 * Esse ID é gerado no painel do cliente e usado para atrelar a base
 * de conhecimento construída aqui ao agente correspondente no banco dele.
 *
 * IMPORTANTE: NÃO persistimos esse valor em localStorage/sessionStorage.
 * O backend é a única fonte de verdade — o ID vem sempre da URL.
 * Mantemos apenas uma referência em memória (módulo) enquanto a aba está aberta,
 * para suportar navegações internas da SPA que removam o query param.
 */
let __agenteExternoMem: string | null = null;
function getAgenteExterno(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("agente");
    if (fromUrl && fromUrl.trim()) {
      __agenteExternoMem = fromUrl.trim().slice(0, 128);
      return __agenteExternoMem;
    }
    return __agenteExternoMem;
  } catch {
    return __agenteExternoMem;
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * ID opcional de uma Base de Conhecimento já existente.
   * Quando informado, o chat entra em MODO ATUALIZAÇÃO:
   *  - faz GET em `${ENDPOINT}?id=${id}` para carregar a base
   *  - permite ajustes livres
   *  - ao concluir, faz POST de volta com o mesmo ID
   */
  promptId?: string | null;
  /**
   * Quando true, o `promptId` é tratado como TOKEN do agente externo
   * (originado de `?agente=...` ao abrir pelo botão do AtendenteAI).
   * O GET de carregamento usa `?token=...` em vez de `?id=...`.
   */
  tokenMode?: boolean;
}

// NOTA: Caso o servidor bloqueie por CORS, será necessário liberar CORS no
// endpoint ou criar um proxy/backend intermediário. Usamos no-cors como fallback no POST.
// O GET precisa de CORS liberado para conseguir LER a resposta — sem isso a base
// existente não poderá ser carregada no navegador do cliente.
export interface SendResult {
  ok: boolean;
  motivo?: string;
  etapa?: "validacao" | "rede" | "resposta";
  resposta?: RespostaInterpretada;
}

// NOTA: Caso o servidor bloqueie por CORS, será necessário liberar CORS no
// endpoint ou criar um proxy/backend intermediário. Usamos no-cors como fallback no POST.
// O GET precisa de CORS liberado para conseguir LER a resposta — sem isso a base
// existente não poderá ser carregada no navegador do cliente.
async function enviarPerguntaParaServidor(
  pergunta: string,
  etapaAtual: string,
  numeroEtapa: number,
  totalEtapas: number,
  progressoPercentual: number,
  promptId?: string | null,
): Promise<SendResult> {
  const payload = {
    origem: "pagina_implantacao_atendenteai",
    arquiteto: "Arquiteto de Conhecimento IA",
    funcao: "Consultor de Implantação de IA",
    agente: getAgenteExterno(),
    modo: promptId ? "atualizacao" : "criacao",
    prompt_id: promptId ?? null,
    etapa_atual: etapaAtual,
    numero_etapa: numeroEtapa,
    total_etapas: totalEtapas,
    progresso_percentual: progressoPercentual,
    pergunta,
    timestamp: new Date().toISOString(),
  };
  const v = validarPayload(payload);
  if (!v.ok) {
    console.warn("Payload inválido (pergunta):", v.motivo);
    return { ok: false, motivo: v.motivo ?? "Payload inválido.", etapa: "validacao" };
  }
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: true };
  } catch (error) {
    console.error("Erro ao enviar pergunta para o servidor:", error);
    return { ok: false, motivo: "Falha de rede ao registrar a pergunta no servidor.", etapa: "rede" };
  }
}

type LoadResult =
  | { status: "ok"; base: Record<string, string[]>; lacunas: string[]; raw?: unknown }
  | { status: "cors"; detail: string }
  | { status: "notfound" }
  | { status: "http"; code: number }
  | { status: "parse"; detail: string };

async function carregarBaseExistente(
  id: string,
  modo: "id" | "token" = "id",
): Promise<LoadResult> {
  let resp: Response;
  const qs = modo === "token" ? "token" : "id";
  try {
    resp = await fetch(`${ENDPOINT}?${qs}=${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Falha de rede/CORS ao carregar base existente:", e);
    return { status: "cors", detail };
  }

  if (resp.status === 404) return { status: "notfound" };
  if (!resp.ok) return { status: "http", code: resp.status };

  try {
    const raw = await resp.text();
    const trimmed = raw.trim();

    if (!trimmed) {
      return { status: "parse", detail: "Resposta vazia do servidor." };
    }

    // Resposta HTML/PHP (ex.: "<br /><b>Warning</b>...") — não é JSON válido
    if (trimmed.startsWith("<")) {
      console.error("Endpoint retornou HTML/PHP em vez de JSON:", trimmed.slice(0, 200));
      return {
        status: "parse",
        detail:
          "O servidor retornou HTML/PHP em vez de JSON (provável warning/notice do PHP). Verifique o endpoint consultor.php e garanta Content-Type: application/json sem outputs extras.",
      };
    }

    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error("Falha ao parsear JSON da base:", detail, trimmed.slice(0, 200));
      return { status: "parse", detail: `Resposta não é JSON válido: ${detail}` };
    }

    // JSON duplamente codificado: veio como string contendo JSON
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        // segue como string mesmo
      }
    }

    if (typeof data !== "object" || data === null) {
      return {
        status: "parse",
        detail: "Resposta JSON não é um objeto válido.",
      };
    }

    const obj = data as Record<string, unknown>;
    const base =
      (obj.base as Record<string, string[]>) ??
      (obj.knowledge_base as Record<string, string[]>) ??
      (obj as Record<string, string[]>);
    const lacunas: string[] = Array.isArray(obj.lacunas) ? (obj.lacunas as string[]) : [];
    const normalized: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(base ?? {})) {
      if (Array.isArray(v)) normalized[k] = v.map(String);
      else if (typeof v === "string") normalized[k] = [v];
    }
    return { status: "ok", base: normalized, lacunas, raw: data };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Falha ao interpretar resposta da base:", e);
    return { status: "parse", detail };
  }
}

async function enviarBaseAtualizada(
  promptId: string,
  base: Record<string, string[]>,
  lacunas: string[],
  notasAjuste: string[],
  promptPersona: string,
): Promise<SendResult> {
  const payload = {
    origem: "pagina_implantacao_atendenteai",
    arquiteto: "Arquiteto de Conhecimento IA",
    agente: getAgenteExterno(),
    modo: "atualizacao_finalizada",
    prompt_id: promptId,
    base,
    lacunas,
    notas_de_ajuste: notasAjuste,
    prompt_persona: promptPersona,
    timestamp: new Date().toISOString(),
  };
  const v = validarPayload(payload);
  if (!v.ok) return { ok: false, motivo: v.motivo ?? "Payload inválido.", etapa: "validacao" };

  let resp: Response;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Erro ao enviar base atualizada:", e);
    return {
      ok: false,
      etapa: "rede",
      motivo:
        "Não foi possível contatar o servidor para enviar a atualização (falha de rede ou CORS). Verifique sua conexão e tente novamente.",
    };
  }
  const interpretada = await interpretarResposta(resp);
  if (!interpretada.ok) {
    return { ok: false, etapa: "resposta", motivo: interpretada.motivo ?? "Resposta inválida do servidor." };
  }
  return { ok: true, resposta: interpretada };
}

async function enviarBaseFinalCriacao(
  conversationId: string,
  base: Record<string, string[]>,
  lacunas: string[],
  notasAjuste: string[],
  origemPrefill: { url?: string; sources: string[]; summary: string },
  promptPersona: string,
): Promise<SendResult> {
  const payload = {
    origem: "pagina_implantacao_atendenteai",
    arquiteto: "Arquiteto de Conhecimento IA",
    agente: getAgenteExterno(),
    modo: "criacao_finalizada",
    conversation_id: conversationId,
    base,
    lacunas,
    notas_de_ajuste: notasAjuste,
    prefill: origemPrefill,
    prompt_persona: promptPersona,
    timestamp: new Date().toISOString(),
  };
  const v = validarPayload(payload);
  if (!v.ok) return { ok: false, motivo: v.motivo ?? "Payload inválido.", etapa: "validacao" };

  let resp: Response;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Erro ao enviar base final (criação):", e);
    return {
      ok: false,
      etapa: "rede",
      motivo:
        "Não foi possível contatar o servidor para finalizar a criação (falha de rede ou CORS). Verifique sua conexão e tente novamente.",
    };
  }
  const interpretada = await interpretarResposta(resp);
  if (!interpretada.ok) {
    return { ok: false, etapa: "resposta", motivo: interpretada.motivo ?? "Resposta inválida do servidor." };
  }
  return { ok: true, resposta: interpretada };
}

// ---------- Persistência local (sobrevive a fechar a página) ----------
// Sem persistência local: o backend é a ÚNICA fonte de verdade.
// Mantemos a interface PersistedState apenas como contrato em memória
// (snapshot usado nas chamadas POST). Nenhum dado é gravado no navegador.

interface PersistedState {
  conversationId: string;
  messages: Message[];
  base: Record<string, string[]>;
  lacunas: string[];
  step: number;
  finalizado: boolean;
  notasAjuste: string[];
  forcarCriacao: boolean;
  prefillStage: "form" | "processing" | "review" | "done";
  prefillUrl: string;
  prefillSummary: string;
  prefillSources: string[];
  showBase: boolean;
  history: ImplantadorChatHistoryItem[];
  enviadoFinal?: boolean;
  updatedAt: number;
}

// Geração/importação de .txt removida — progresso é enviado apenas via POST
// (auto-save e botão "Salvar") para o endpoint do consultor.

async function enviarParcialCriacao(
  conversationId: string,
  state: PersistedState,
  signal?: AbortSignal,
): Promise<SendResult> {
  // Regenera o prompt_persona a partir do snapshot mais recente (race-safe:
  // a base passada aqui já é a "tirada" no momento do envio).
  const promptPersonaAtual = gerarPromptPersona(state.base, state.notasAjuste);
  const payload = {
    origem: "pagina_implantacao_atendenteai",
    arquiteto: "Arquiteto de Conhecimento IA",
    agente: getAgenteExterno(),
    modo: "criacao_parcial",
    conversation_id: conversationId,
    base: state.base,
    lacunas: state.lacunas,
    notas_de_ajuste: state.notasAjuste,
    etapa_atual_idx: state.step,
    finalizado: state.finalizado,
    prefill: {
      url: state.prefillUrl,
      sources: state.prefillSources,
      summary: state.prefillSummary,
    },
    prompt_persona: promptPersonaAtual,
    timestamp: new Date(state.updatedAt).toISOString(),
  };
  const v = validarPayload(payload);
  if (!v.ok) {
    return { ok: false, motivo: v.motivo ?? "Payload inválido.", etapa: "validacao" };
  }
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    return { ok: true };
  } catch (e) {
    if ((e as { name?: string } | null)?.name === "AbortError") {
      return { ok: false, motivo: "aborted", etapa: "rede" };
    }
    console.error("Erro ao enviar progresso parcial:", e);
    return { ok: false, motivo: "Falha de rede ao salvar o progresso no servidor.", etapa: "rede" };
  }
}




const CAMPOS_BASE = [
  "Nome do Agente",
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
];

// Aliases textuais para cada seção canônica. Permite que o usuário use
// nomes alternativos (ex.: "vocabulário do segmento" → "Termos do Segmento")
// ao pedir alteração/remoção, e ainda assim acertarmos a seção correta.
const ALIASES_SECAO: Record<string, string[]> = {
  "Nome do Agente": ["nome do agente", "nome da ia", "nome do bot", "nome do assistente"],
  Empresa: ["empresa", "sobre a empresa", "sobre nos", "negocio"],
  Produtos: ["produtos", "produto"],
  Serviços: ["servicos", "servico"],
  "Público-Alvo": ["publico alvo", "publico-alvo", "publico", "persona", "personas", "clientes ideais"],
  "Processo Comercial": ["processo comercial", "funil", "funil de vendas", "jornada de compra", "etapas comerciais"],
  FAQ: ["faq", "perguntas frequentes", "duvidas frequentes"],
  Objeções: ["objecoes", "objecao", "respostas a objecoes"],
  Diferenciais: ["diferenciais", "diferenciais competitivos", "vantagens"],
  Políticas: ["politicas", "politicas e regras", "regras da empresa"],
  "Casos de Sucesso": ["casos de sucesso", "cases", "depoimentos"],
  "Termos do Segmento": [
    "termos do segmento",
    "termos do seguimento",
    "vocabulario do segmento",
    "vocabulario do seguimento",
    "vocabulario",
    "glossario",
    "jargao",
    "girias",
  ],
  "Fluxo de Atendimento": ["fluxo de atendimento", "fluxo", "atendimento"],
  "Regras do Agente": ["regras do agente", "regras de conduta", "regras de conduta do agente", "conduta do agente"],
};

const normalizarTextoBusca = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const detectarSecaoPorTexto = (texto: string): string | null => {
  const t = normalizarTextoBusca(texto);
  let melhor: { secao: string; len: number } | null = null;
  for (const [canon, aliases] of Object.entries(ALIASES_SECAO)) {
    for (const a of aliases) {
      const an = normalizarTextoBusca(a);
      if (an && t.includes(an) && (!melhor || an.length > melhor.len)) {
        melhor = { secao: canon, len: an.length };
      }
    }
  }
  return melhor?.secao ?? null;
};

// ---------- Validação obrigatória de respostas do usuário ----------
const RESPOSTAS_GENERICAS = new Set([
  "geral","gerais","todos","todas","qualquer","qualquer pessoa","qualquer um","qualquer uma",
  "público alvo","publico alvo","público-alvo","publico-alvo",
  "produto principal","produto","serviço","servico","serviços","servicos","produtos",
  "não sei","nao sei","sei lá","sei la","sla","normal","comum","empresa",
  "vendas","venda","atendimento","cliente","clientes",
  "n/a","na","nada","nenhum","nenhuma","-","--","tudo","de tudo","tipo","tipos",
  "ok","sim","não","nao","talvez",
]);

const EXEMPLOS_POR_CAMPO: Record<string, string[]> = {
  Empresa: [
    "Loja Bella — perfumaria nacional em São Paulo, atua há 6 anos",
    "Clínica OdontoVida — odontologia familiar em Curitiba/PR",
    "InterNet Rural — provedor de internet via rádio no interior de MG",
  ],
  "Público-Alvo": [
    "Mulheres de 25 a 45 anos, classe B/C, que buscam perfumes acessíveis",
    "Famílias com filhos pequenos procurando convênio odontológico",
    "Produtores rurais sem acesso a fibra óptica",
  ],
  Produtos: [
    "Venda de perfumes nacionais inspirados em fragrâncias famosas",
    "Planos odontológicos para famílias e empresas",
    "Planos de internet via rádio de 50 a 300 Mbps",
  ],
  Serviços: [
    "Manutenção preventiva mensal de ar-condicionado residencial",
    "Consultoria tributária para micro e pequenas empresas",
  ],
  "Processo Comercial": [
    "Cliente chega pelo Instagram → atendente envia catálogo no WhatsApp → fecha por Pix → envio em 2 dias úteis",
    "Lead pelo site → SDR qualifica → consultor agenda visita → proposta → contrato",
  ],
  FAQ: [
    "'Vocês entregam em todo o Brasil?' / 'Aceitam parcelamento?'",
    "'Atendem convênio X?' / 'Qual o valor da consulta?'",
  ],
  Objeções: [
    "'Está caro' → mostrar parcelamento e comparar com concorrentes",
    "'Tenho receio da qualidade' → apresentar garantia e depoimentos",
  ],
  Diferenciais: [
    "Atendimento humano 24h via WhatsApp + entrega no mesmo dia em SP capital",
    "Único provedor da região com SLA de 99,5% e técnico em até 4h",
  ],
  Políticas: [
    "Troca em até 7 dias com nota fiscal; reembolso via Pix em até 3 dias úteis",
    "Cancelamento gratuito em 7 dias; após isso, multa de 30% do plano",
  ],
  "Casos de Sucesso": [
    "Cliente X aumentou vendas em 40% após 3 meses com nosso plano",
    "Família Y eliminou cáries recorrentes após tratamento completo",
  ],
  "Termos do Segmento": [
    "'fixação', 'sillage', 'notas de saída/coração/fundo' (perfumaria)",
    "'profilaxia', 'restauração', 'canal' (odontologia)",
  ],
  "Fluxo de Atendimento": [
    "WhatsApp → atendente humano → orçamento → fechamento → entrega",
    "Site → formulário → ligação do consultor → visita → proposta",
  ],
  "Regras do Agente": [
    "Nunca prometer prazo sem confirmar estoque; sempre confirmar CPF antes de gerar boleto",
    "Nunca dar diagnóstico clínico; sempre encaminhar para profissional",
  ],
};

const OPCOES_GENERICAS_NEGOCIO = [
  "Venda de produtos físicos",
  "Prestação de serviços",
  "Consultoria",
  "Software / SaaS",
  "Outro (descreva em uma frase)",
];

export type ValidacaoResposta =
  | { ok: true; motivo?: undefined; exemplos?: undefined }
  | { ok: false; motivo: string; exemplos: string[] };

function validarRespostaUsuario(
  texto: string,
  pergunta: Pergunta,
): ValidacaoResposta {
  const t = texto.trim();
  const exemplos = EXEMPLOS_POR_CAMPO[pergunta.campo] ?? [];
  if (!t) return { ok: false, motivo: "A resposta está vazia.", exemplos };

  const norm = t.toLowerCase().replace(/[.!?;:,]/g, "").trim();

  if (RESPOSTAS_GENERICAS.has(norm)) {
    return {
      ok: false,
      motivo: `"${t}" é uma resposta muito genérica e não traz informação útil para configurar o agente.`,
      exemplos,
    };
  }

  const palavras = norm.split(/\s+/).filter(Boolean);
  if (palavras.length <= 2 && norm.length < 15) {
    return {
      ok: false,
      motivo: `A resposta "${t}" tem poucas palavras e não descreve a sua realidade com a clareza necessária.`,
      exemplos,
    };
  }

  const stop = new Set([
    "a","o","as","os","de","do","da","dos","das","e","ou","que","qual","quais",
    "como","para","por","em","no","na","nos","nas","um","uma","seu","sua","seus","suas",
    "sao","são","é","voce","você","com","sem","mais","menos","tem","ter","ja","já",
  ]);
  const palPerg = pergunta.texto
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  const palResp = norm
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  if (palResp.length > 0 && palPerg.length > 0) {
    const sobreposicao =
      palResp.filter((w) => palPerg.includes(w)).length / palResp.length;
    if (sobreposicao >= 0.7 && palResp.length <= 5) {
      return {
        ok: false,
        motivo:
          "Sua resposta praticamente repete a pergunta. Preciso da informação concreta do seu negócio, não da pergunta de volta.",
        exemplos,
      };
    }
  }

  return { ok: true };
}

// Validação para mensagens de ajuste no modo atualização (sem pergunta fixa).
// Rejeita ajustes vagos como "mudar tudo", "atualizar", "trocar nome", etc.
const EXEMPLOS_AJUSTE_ATUALIZACAO = [
  "Atualizar política de reembolso de 5 para 7 dias úteis",
  "Adicionar diferencial: atendimento humano 24h via WhatsApp",
  "Mudar tom de voz para mais informal, tratando o cliente por 'você'",
  "Trocar horário comercial para 9h às 19h, segunda a sábado",
  "Incluir nova FAQ: 'Vocês emitem nota fiscal?' — Sim, em até 24h após o pagamento.",
];

function validarAjusteUsuario(texto: string): ValidacaoResposta {
  const t = texto.trim();
  const exemplos = EXEMPLOS_AJUSTE_ATUALIZACAO;
  if (!t) return { ok: false, motivo: "A mensagem está vazia.", exemplos };

  const norm = t.toLowerCase().replace(/[.!?;:,]/g, "").trim();

  // Genéricas absolutas
  const genericasAjuste = new Set([
    ...RESPOSTAS_GENERICAS,
    "atualizar","atualiza","mudar","muda","trocar","troca","alterar","altera",
    "corrigir","ajustar","editar","modificar","melhorar","arrumar","revisar",
    "mudar tudo","atualizar tudo","trocar tudo","mudar isso","atualizar isso",
    "mudar prompt","atualizar prompt","editar prompt","reescrever",
  ]);
  if (genericasAjuste.has(norm)) {
    return {
      ok: false,
      motivo: `Diga qual campo alterar e qual o novo conteúdo. "${t}" não informa a seção nem o valor a ser aplicado.`,
      exemplos,
    };
  }

  // Muito curto sem contexto (≤3 palavras e <20 chars)
  const palavras = norm.split(/\s+/).filter(Boolean);
  if (palavras.length <= 3 && norm.length < 20) {
    return {
      ok: false,
      motivo: `A descrição da alteração está incompleta. Informe a seção e o novo texto para aplicar.`,
      exemplos,
    };
  }

  // Verbo de ajuste sem objeto claro (ex.: "mudar política", "trocar nome")
  const verbosAjuste = /^(atualizar|mudar|trocar|alterar|corrigir|ajustar|editar|modificar|melhorar|revisar|reescrever)\b/i;
  if (verbosAjuste.test(norm) && palavras.length <= 4) {
    return {
      ok: false,
      motivo:
        "Falta o novo valor. Complete informando: qual seção e qual conteúdo deve passar a constar no prompt.",
      exemplos,
    };
  }

  return { ok: true };
}



// ---------- Geração do PROMPT organizado da persona ----------
// Defaults genéricos e neutros para seções estilísticas/operacionais quando
// o usuário não definiu nada. NÃO se aplica a seções factuais (Empresa,
// Produtos, Serviços, FAQ etc.), que continuam sendo omitidas se vazias.
const DEFAULTS_GENERICOS: Record<string, string[]> = {
  "Termos do Segmento": [
    "Tom de voz formal, amigável e cordial, adaptado ao contexto do cliente.",
  ],
  "Regras do Agente": [
    "Ser cordial, objetivo e transparente em todas as interações.",
    "Não prometer prazos, valores ou condições que não estejam confirmados na base.",
    "Encaminhar para atendimento humano sempre que a solicitação fugir do escopo.",
  ],
  "Fluxo de Atendimento": [
    "Saudar o cliente, identificar a necessidade, oferecer a melhor solução disponível e confirmar próximos passos.",
  ],
  "Políticas": [
    "Respeitar a privacidade do cliente e nunca compartilhar dados sensíveis sem autorização.",
  ],
};

// Chaves internas que NUNCA podem aparecer no prompt_persona,
// independentemente de virem da base local ou de bases antigas no servidor.
// A comparação é feita de forma normalizada (sem acento, minúsculas, sem
// espaços/pontuação extras) para cobrir variações como "Revisao", "revisão",
// "Revisão Final", "## Revisão", etc.
const CHAVES_INTERNAS_BLOQUEADAS = [
  "Revisão",
  "Revisao",
  "Revisão Final",
  "Revisão final da Base de Conhecimento",
  "Nome do Agente",
  "Confirmação",
  "Confirmacao",
  "Observações Internas",
  "Observacoes Internas",
  "Notas Internas",
  "Ajustes Recentes",
  "Ajuste",
  "Ajustes",
  "Meta",
  "Metadados",
  "Debug",
  "Interno",
];

function normalizarChave(k: string): string {
  return (k ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^[#\s\-_:]+/, "")
    .replace(/[\s\-_:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CHAVES_INTERNAS_NORMALIZADAS = new Set(
  CHAVES_INTERNAS_BLOQUEADAS.map(normalizarChave),
);

function ehChaveInterna(k: string): boolean {
  const n = normalizarChave(k);
  if (!n) return true; // chave vazia também é descartada
  if (CHAVES_INTERNAS_NORMALIZADAS.has(n)) return true;
  // Bloqueia qualquer chave que comece por "revisao" (ex: "Revisão da base")
  if (/^revisao\b/.test(n)) return true;
  // Bloqueia chaves que sejam respostas curtas (sim/nao/ok) salvas indevidamente
  if (/^(sim|nao|ok|confirmo|confirmar)$/.test(n)) return true;
  return false;
}

// Frase padrão obrigatória para responder a qualquer informação ausente.
const RESPOSTA_AUSENCIA =
  '"Não encontrei essa informação na minha base de conhecimento atual. Posso encaminhar sua dúvida para nossa equipe."';

// Detecta itens vagos/internos que NÃO podem entrar na base estruturada.
function ehItemVago(s: string): boolean {
  const t = (s ?? "").trim().toLowerCase();
  if (!t) return true;
  if (t.length < 3) return true;
  const padroes = [
    /^talvez/, /^quero (alterar|atualizar|mudar)/, /^acho que/,
    /^n[ãa]o sei/, /^a definir/, /^pendente/, /^revis[ãa]o/,
    /^observa[çc][ãa]o interna/, /^nota interna/,
  ];
  return padroes.some((r) => r.test(t));
}

function limpar(itens: string[]): string[] {
  return itens.map((s) => (s ?? "").trim()).filter((s) => s && !ehItemVago(s));
}

function gerarPromptPersona(
  base: Record<string, string[]>,
  // notasAjuste mantido por compatibilidade de assinatura.
  _notasAjuste: string[] = [],
): string {
  const nome = derivarNomeAgente(base);
  const get = (k: string) => limpar(base[k] ?? []);
  const lista = (itens: string[]) =>
    itens.length ? itens.map((i) => `- ${i}`).join("\n") : `- ${RESPOSTA_AUSENCIA}`;
  const listaOuAusencia = (itens: string[], msg: string) =>
    itens.length ? itens.map((i) => `- ${i}`).join("\n") : `- (sem informação cadastrada — usar resposta padrão: ${msg})`;

  const tom =
    get("Termos do Segmento")[0] ??
    "Formal, cordial e objetivo. Português do Brasil.";

  const empresaItens = get("Empresa");
  const publico = get("Público-Alvo");
  const produtos = get("Produtos");
  const servicos = get("Serviços");
  const diferenciais = get("Diferenciais");
  const processo = get("Processo Comercial");
  const fluxo = get("Fluxo de Atendimento");
  const politicas = get("Políticas");
  const faq = get("FAQ");
  const regras = get("Regras do Agente");

  const partes: string[] = [];

  // H1
  partes.push(`# Base de Conhecimento — Agente ${nome}`);

  // PERSONA
  partes.push(
    `## 1. PERSONA
- Nome do agente: ${nome}
- Objetivo: atender clientes e prospects da empresa com clareza, precisão e dentro do escopo desta base.
- Tom de voz: ${tom}`,
  );

  // REGRA ABSOLUTA (ANTI-ALUCINAÇÃO)
  partes.push(
    `## 2. REGRA ABSOLUTA (ANTI-ALUCINAÇÃO)
- Não inventar informações.
- Não estimar valores, prazos ou números.
- Não completar listas com itens não cadastrados.
- Não assumir integrações (CRM, ERP, APIs, apps, etc.).
- Não criar preços.
- Não criar funcionalidades.
- Não criar políticas.
- Se a informação não estiver nesta base, responder exatamente:
  ${RESPOSTA_AUSENCIA}`,
  );

  // SOBRE A EMPRESA
  const nomeEmpresa = empresaItens[0] ?? "";
  const descricaoEmpresa = empresaItens[1] ?? "";
  const segmentoEmpresa = empresaItens[2] ?? "";
  partes.push(
    `## 3. SOBRE A EMPRESA
- Nome: ${nomeEmpresa || `(não cadastrado — usar: ${RESPOSTA_AUSENCIA})`}
- Descrição curta: ${descricaoEmpresa || `(não cadastrada — usar: ${RESPOSTA_AUSENCIA})`}
- Segmento: ${segmentoEmpresa || `(não cadastrado — usar: ${RESPOSTA_AUSENCIA})`}`,
  );

  // PÚBLICO-ALVO (separado por categorias)
  const cat = (rotulo: string) =>
    publico.filter((p) => p.toLowerCase().startsWith(rotulo.toLowerCase()));
  const empresas = cat("Empresa");
  const parceiros = cat("Parceiro");
  const multiplicadores = cat("Multiplicador");
  const restantes = publico.filter(
    (p) => ![...empresas, ...parceiros, ...multiplicadores].includes(p),
  );
  partes.push(
    `## 4. PÚBLICO-ALVO
### 4.1 Empresas
${listaOuAusencia(empresas.length ? empresas : restantes, RESPOSTA_AUSENCIA)}
### 4.2 Parceiros
${listaOuAusencia(parceiros, RESPOSTA_AUSENCIA)}
### 4.3 Multiplicadores
${listaOuAusencia(multiplicadores, RESPOSTA_AUSENCIA)}`,
  );

  // PRODUTOS
  partes.push(`## 5. PRODUTOS
${lista(produtos)}`);

  // FUNCIONALIDADES — uma seção por item de "Serviços"
  const funcBlocos = servicos.length
    ? servicos
        .map((s, i) => {
          const [titulo, ...resto] = s.split(/[:\-—]/);
          const bullets = resto.join(":").trim();
          const linhas = bullets
            ? bullets.split(/[;,]/).map((x) => x.trim()).filter(Boolean)
            : [];
          return `### 6.${i + 1} ${titulo.trim()}
${linhas.length ? linhas.map((l) => `- ${l}`).join("\n") : `- ${RESPOSTA_AUSENCIA}`}`;
        })
        .join("\n")
    : `- ${RESPOSTA_AUSENCIA}`;
  partes.push(`## 6. FUNCIONALIDADES
${funcBlocos}`);

  // DIFERENCIAIS
  partes.push(`## 7. DIFERENCIAIS
${lista(diferenciais)}`);

  // PROCESSO COMERCIAL
  partes.push(
    `## 8. PROCESSO COMERCIAL
Fluxo: Problema → Impacto → Benefício → Solução → Plano
${lista(processo.length ? processo : fluxo)}`,
  );

  // POLÍTICAS
  const polCat = (rotulo: string) =>
    politicas.find((p) => p.toLowerCase().includes(rotulo.toLowerCase())) ?? "";
  partes.push(
    `## 9. POLÍTICAS
- Cancelar: ${polCat("cancel") || RESPOSTA_AUSENCIA}
- Teste grátis: ${polCat("teste") || RESPOSTA_AUSENCIA}
- Upgrade: ${polCat("upgrade") || RESPOSTA_AUSENCIA}
- Downgrade: ${polCat("downgrade") || RESPOSTA_AUSENCIA}`,
  );

  // O QUE NÃO DEVE SER ASSUMIDO
  partes.push(
    `## 10. O QUE NÃO DEVE SER ASSUMIDO
- Não assumir integração com CRM.
- Não assumir integração com ERP.
- Não assumir APIs disponíveis.
- Não assumir aplicativos móveis ou desktop.
- Não assumir integrações com terceiros.
- Não assumir recursos futuros ou roadmap.
- Não assumir funcionalidades que não estejam descritas na seção 6.
- Não assumir preços, descontos ou condições não cadastrados.`,
  );

  // PROCEDIMENTO PARA INFORMAÇÕES AUSENTES
  partes.push(
    `## 11. PROCEDIMENTO PARA INFORMAÇÕES AUSENTES
Sempre que a informação solicitada não estiver nesta base, responder exatamente:
${RESPOSTA_AUSENCIA}`,
  );

  // EXEMPLOS DE COMPORTAMENTO
  const faqExemplos = faq.slice(0, 2).map((f, i) => {
    const [pergunta, ...resp] = f.split("?");
    const p = (pergunta || f).trim() + (f.includes("?") ? "?" : "");
    const r = resp.join("?").trim() || RESPOSTA_AUSENCIA;
    return `### 12.${i + 1} Exemplo
- Pergunta: "${p}"
- Resposta: "${r}"`;
  });
  partes.push(
    `## 12. EXEMPLOS DE COMPORTAMENTO
### 12.0 Informação ausente (obrigatório)
- Pergunta: "Vocês possuem ERP?"
- Resposta: ${RESPOSTA_AUSENCIA}
${faqExemplos.join("\n")}`.trim(),
  );

  // REGRAS DE CONDUTA (do agente)
  if (regras.length) {
    partes.push(`## 13. REGRAS DE CONDUTA DO AGENTE
${lista(regras)}`);
  }

  return partes.filter(Boolean).join("\n\n");
}

export const DiagnosticoChat = ({ open, onClose, promptId, tokenMode = false }: Props) => {
  // Validação defensiva: mesmo padrão da landing — 6 a 64 chars [A-Za-z0-9_-].
  const PROMPT_ID_REGEX_INNER = /^[A-Za-z0-9_-]{6,64}$/;
  const idValido = !!promptId && PROMPT_ID_REGEX_INNER.test(promptId.trim());

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(false);
  const [base, setBase] = useState<Record<string, string[]>>({});
  const [lacunas, setLacunas] = useState<string[]>([]);
  const [finalizado, setFinalizado] = useState(false);
  const [showBase, setShowBase] = useState(false);
  const [notasAjuste, setNotasAjuste] = useState<string[]>([]);
  const [carregandoBase, setCarregandoBase] = useState(false);
  const [enviandoUpdate, setEnviandoUpdate] = useState(false);
  const [forcarCriacao, setForcarCriacao] = useState(false);

  // Pré-preenchimento (site + arquivos) — só no modo criação
  type PrefillStage = "form" | "processing" | "review" | "done";
  const [prefillStage, setPrefillStage] = useState<PrefillStage>("form");
  const [prefillUrl, setPrefillUrl] = useState("");
  const [prefillFiles, setPrefillFiles] = useState<File[]>([]);
  const [prefillSummary, setPrefillSummary] = useState("");
  const [prefillSources, setPrefillSources] = useState<string[]>([]);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [enviandoArquivosAvulsos, setEnviandoArquivosAvulsos] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const conversationIdRef = useRef<string>(gerarConversationId());
  const historyRef = useRef<ImplantadorChatHistoryItem[]>([]);
  const enviadoFinalRef = useRef<boolean>(false);
  // Tentativas inválidas por pergunta (step) — após 2, oferecemos opções comuns
  // e na próxima a resposta é aceita para não travar o usuário.
  const tentativasInvRef = useRef<Record<number, number>>({});
  // Tentativas inválidas no modo atualização (chave única "upd").
  const tentativasUpdRef = useRef<number>(0);


  // Reinicia a conversa a cada abertura do chat
  useEffect(() => {
    if (open) {
      conversationIdRef.current = gerarConversationId();
      historyRef.current = [];
    }
  }, [open]);

  const pedirComentarioIA = async (
    userMessage: string,
    extraContext: Record<string, unknown> = {},
  ) => {
    // Mantém histórico curto (últimos turnos) para reduzir tokens
    historyRef.current = [
      ...historyRef.current.slice(-8),
      { role: "user", content: userMessage },
    ];
    try {
      const { response } = await chamarImplantadorAi({
        agent_id: AGENT_ID,
        conversation_id: conversationIdRef.current,
        message: userMessage,
        history: historyRef.current.slice(0, -1),
        context: {
          modo: modoAtualizacao ? "atualizacao" : "criacao",
          prompt_id: promptId ?? null,
          etapa_atual: etapaAtual,
          progresso_percentual: progresso,
          base_atual: base,
          lacunas_atuais: lacunas,
          ...extraContext,
        },
      });
      if (response) {
        historyRef.current = [
          ...historyRef.current,
          { role: "assistant", content: response },
        ];
        setMessages((m) => [...m, { role: "agent", text: response }]);
      }
    } catch (e) {
      console.error("Falha ao consultar IA:", e);
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "error",
          title: "Consultor de IA indisponível",
          text: "Não consegui me conectar ao serviço de IA agora. Sua resposta foi salva normalmente e podemos continuar.",
        },
      ]);
    }
  };

  const modoAtualizacao = idValido && !forcarCriacao;
  const agenteExterno = getAgenteExterno();

  const etapaIdxAtual = Math.min(step, TOTAL - 1);
  const etapaAtual = modoAtualizacao
    ? "Atualização da Base de Conhecimento"
    : ETAPAS[PERGUNTAS[etapaIdxAtual]?.etapaIdx ?? 0];
  const numeroEtapa = modoAtualizacao ? ETAPAS.length : (PERGUNTAS[etapaIdxAtual]?.etapaIdx ?? 0) + 1;
  const progresso = modoAtualizacao ? 100 : Math.round((step / TOTAL) * 100);

  // Completude: considera tanto os campos canônicos (CAMPOS_BASE) quanto
  // quaisquer chaves extras que vierem do servidor — assim uma base carregada
  // com nomes ligeiramente diferentes ainda reflete progresso real.
  const camposParaCompletude = Array.from(new Set([...CAMPOS_BASE, ...Object.keys(base)]));
  const completude = camposParaCompletude.length === 0
    ? 0
    : Math.round(
        (camposParaCompletude.filter((c) => (base[c]?.length ?? 0) > 0).length /
          camposParaCompletude.length) *
          100,
      );

  const proximaPerguntaPendente = (fromIdx: number, currentBase: Record<string, string[]>): number => {
    for (let i = fromIdx; i < TOTAL; i++) {
      const campo = PERGUNTAS[i].campo;
      if (!(currentBase[campo]?.length)) return i;
    }
    return TOTAL;
  };

  const fazerPergunta = (idx: number) => {
    const p = PERGUNTAS[idx];
    if (!p) return;
    const etapaNome = ETAPAS[p.etapaIdx];
    const num = p.etapaIdx + 1;
    const prog = Math.round((idx / TOTAL) * 100);
    setTyping(true);
    setTimeout(() => {
      setMessages((m) => [...m, { role: "agent", text: p.texto }]);
      setTyping(false);
      enviarPerguntaParaServidor(p.texto, etapaNome, num, ETAPAS.length, prog, promptId);
      inputRef.current?.focus();
    }, 900);
  };

  const finalizarCriacaoCompleta = async (
    baseEntrada: Record<string, string[]>,
    lacunasFinal: string[],
  ) => {
    if (enviadoFinalRef.current) return;
    enviadoFinalRef.current = true;

    // Garante que o "Nome do Agente" esteja preenchido (deriva default se necessário).
    const nomeAgente = derivarNomeAgente(baseEntrada);
    const baseFinal: Record<string, string[]> = { ...baseEntrada, "Nome do Agente": [nomeAgente] };
    setBase(baseFinal);

    // 1) Compliance check obrigatório antes do envio
    setMessages((m) => [
      ...m,
      { role: "system", tone: "info", text: `Nome do agente definido: ${nomeAgente}. Verificando políticas de uso (compliance)…` },
    ]);

    let compliance: ComplianceCheckResult | null = null;
    try {
      compliance = await runComplianceCheck({
        tenant_id: getAgenteExterno(),
        agent_id: getAgenteExterno(),
        user_id: null,
        conversation_id: conversationIdRef.current,
        trigger_event: "criacao_finalizada",
        payload: {
          nome_agente: nomeAgente,
          nome_negocio: (baseFinal["Empresa"] ?? []).join(" | "),
          descricao_empresa: (baseFinal["Empresa"] ?? []).join("\n"),
          base: baseFinal,
          produtos_servicos: (baseFinal["Produtos e serviços"] ?? []).join("\n"),
          mensagens_automaticas: (baseFinal["Processo comercial"] ?? []).join("\n"),
          urls: prefillUrl ? [prefillUrl] : [],
          termos_comerciais: (baseFinal["Políticas e regras"] ?? []).join("\n"),
        },
      });
    } catch (e) {
      console.error("Falha compliance:", e);
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "error",
          title: "Não foi possível verificar compliance",
          text: "A verificação obrigatória falhou. Tente novamente em instantes — o envio só ocorre após a aprovação.",
        },
      ]);
      enviadoFinalRef.current = false;
      return;
    }

    if (compliance.decision === "bloqueado") {
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "error",
          title: `Implantação bloqueada (risco ${compliance.risk_level.toUpperCase()})`,
          text: MSG_BLOQUEIO_CRITICO,
        },
      ]);
      return;
    }
    if (compliance.decision === "revisao_humana") {
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "gap",
          title: `Aguardando revisão humana (risco ${compliance.risk_level.toUpperCase()})`,
          text: MSG_REVISAO_HUMANA,
        },
      ]);
      return;
    }

    // 2) Liberado — gera o PROMPT da persona e envia ao servidor
    const promptPersona = gerarPromptPersona(baseFinal, notasAjuste);
    const resultado = await enviarBaseFinalCriacao(
      conversationIdRef.current,
      baseFinal,
      lacunasFinal,
      notasAjuste,
      {
        url: prefillUrl || undefined,
        sources: prefillSources,
        summary: prefillSummary,
      },
      promptPersona,
    );
    if (!resultado.ok) {
      // Libera retentativa
      enviadoFinalRef.current = false;
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "error",
          title:
            resultado.etapa === "validacao"
              ? "Envio bloqueado — dados inválidos"
              : resultado.etapa === "rede"
                ? "Falha de comunicação com o servidor"
                : "Resposta inválida do servidor",
          text: resultado.motivo,
          actions: [{ label: "Tentar novamente", kind: "retry" }],
        },
      ]);
      return;
    }
    setMessages((m) => [
      ...m,
      {
        role: "system",
        tone: "save",
        text: "Base de Conhecimento aprovada em compliance e enviada ao servidor com sucesso.",
      },
      {
        role: "agent",
        text:
          "✅ Implantação concluída a 100%. A persona do agente foi organizada internamente e enviada para o servidor. Se precisar ajustar alguma informação, é só me dizer.",
      },
    ]);

  };

  const recomecarConversa = () => {
    // Sem persistência local: backend é a única fonte de verdade.
    enviadoFinalRef.current = false;
    conversationIdRef.current = gerarConversationId();
    historyRef.current = [];
    iniciarModoCriacao(true);
  };

  const snapshotAtual = (): PersistedState => ({
    conversationId: conversationIdRef.current,
    messages,
    base,
    lacunas,
    step,
    finalizado,
    notasAjuste,
    forcarCriacao,
    prefillStage,
    prefillUrl,
    prefillSummary,
    prefillSources,
    showBase,
    history: historyRef.current,
    enviadoFinal: enviadoFinalRef.current,
    updatedAt: Date.now(),
  });

  const [salvandoParcial, setSalvandoParcial] = useState(false);
  const [ultimoSalvamento, setUltimoSalvamento] = useState<Date | null>(null);

  // Proteção contra condições de corrida em salvamentos paralelos.
  // saveSeqRef: número monotônico — só o último envio iniciado é considerado vencedor.
  // saveAbortRef: AbortController do envio em andamento, abortado quando um novo começa.
  // debounceTimerRef: timer da auto-save (cancelado quando há salvamento explícito).
  const saveSeqRef = useRef(0);
  const saveAbortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Snapshot sempre atualizado para os listeners de unload/visibility.
  const snapshotRef = useRef<PersistedState | null>(null);
  useEffect(() => {
    snapshotRef.current = snapshotAtual();
  });

  // Auto-save ao fechar a aba, recarregar ou trocar de aba/app.
  useEffect(() => {
    if (!open) return;
    if (idValido && !forcarCriacao) return; // só no modo criação

    const temConteudo = () => {
      const s = snapshotRef.current;
      return !!s && (s.messages.length > 0 || Object.keys(s.base).length > 0);
    };

    const enviarBeacon = () => {
      const s = snapshotRef.current;
      if (!s || !temConteudo()) return;
      // Sem persistência local: enviamos somente via beacon ao backend.
      try {
        const payload = JSON.stringify({
          origem: "pagina_implantacao_atendenteai",
          arquiteto: "Arquiteto de Conhecimento IA",
          agente: getAgenteExterno(),
          modo: "criacao_autosave",
          conversation_id: s.conversationId,
          base: s.base,
          lacunas: s.lacunas,
          notas_de_ajuste: s.notasAjuste,
          etapa_atual_idx: s.step,
          finalizado: s.finalizado,
          prefill: {
            url: s.prefillUrl,
            sources: s.prefillSources,
            summary: s.prefillSummary,
          },
          motivo: "unload",
          timestamp: new Date(s.updatedAt).toISOString(),
        });
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon(ENDPOINT, blob);
        } else {
          fetch(ENDPOINT, {
            method: "POST",
            mode: "no-cors",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: payload,
          }).catch(() => { /* noop */ });
        }
        setUltimoSalvamento(new Date());
      } catch (e) {
        console.error("Falha no auto-save:", e);
      }
    };

    const onBeforeUnload = () => enviarBeacon();
    const onPageHide = () => enviarBeacon();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") enviarBeacon();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [open, idValido, forcarCriacao]);



  // Dispara um POST de salvamento parcial cancelando o anterior em voo.
  // Garante que apenas o resultado do envio mais recente seja considerado
  // (race-safe): cada chamada incrementa saveSeqRef; respostas tardias de
  // envios antigos são descartadas pelo check `mySeq === saveSeqRef.current`.
  const dispararSave = async (
    snap: PersistedState,
  ): Promise<{ ok: boolean; ignored: boolean; motivo?: string }> => {
    // Cancela debounce pendente — vamos disparar agora.
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    // Aborta envio anterior em andamento — seu resultado seria obsoleto.
    if (saveAbortRef.current) {
      try { saveAbortRef.current.abort(); } catch { /* noop */ }
    }
    const controller = new AbortController();
    saveAbortRef.current = controller;
    const mySeq = ++saveSeqRef.current;
    const r = await enviarParcialCriacao(conversationIdRef.current, snap, controller.signal);
    // Se um envio mais novo já começou enquanto este estava em voo, ignora.
    if (mySeq !== saveSeqRef.current) {
      return { ok: false, ignored: true };
    }
    if (saveAbortRef.current === controller) saveAbortRef.current = null;
    if (r.ok) setUltimoSalvamento(new Date());
    return { ok: r.ok, ignored: false, motivo: r.motivo };
  };

  const handleSalvarProgresso = async () => {
    if (salvandoParcial) return;
    setSalvandoParcial(true);
    try {
      // snapshotAtual() é tirado AGORA — captura a base mais recente, e o
      // prompt_persona será regenerado dentro de enviarParcialCriacao a partir
      // deste mesmo snapshot, eliminando qualquer "stale prompt".
      const snap = snapshotAtual();
      const r = await dispararSave(snap);
      if (r.ignored) return; // resultado descartado por envio mais novo
      if (!r.ok) {
        setMessages((m) => [
          ...m,
          {
            role: "system",
            tone: "error",
            title: "Progresso não enviado ao servidor",
            text:
              (r.motivo ?? "Falha desconhecida.") +
              " Tente novamente em instantes — o progresso só é salvo quando o servidor confirmar.",
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "system",
            tone: "save",
            text:
              "Progresso salvo no servidor. Ao reabrir esta página, suas respostas serão recuperadas diretamente do backend.",
          },
        ]);
      }
    } finally {
      setSalvandoParcial(false);
    }
  };

  // Conclui o preenchimento no modo CRIAÇÃO: marca a sessão como 100%
  // completa e dispara um último POST que reescreve o prompt_persona de
  // forma definitiva a partir da base atual (gerarPromptPersona é chamado
  // dentro de enviarParcialCriacao, garantindo prompt fresh).
  const [concluindoPreenchimento, setConcluindoPreenchimento] = useState(false);
  const handleConcluirPreenchimento = async () => {
    if (concluindoPreenchimento || finalizado) return;
    setConcluindoPreenchimento(true);
    try {
      setFinalizado(true);
      // Monta snapshot já com finalizado=true para o POST definitivo.
      const snap: PersistedState = { ...snapshotAtual(), finalizado: true };
      const r = await dispararSave(snap);
      if (r.ignored) return;
      if (!r.ok) {
        // Reverte o finalizado para permitir nova tentativa
        setFinalizado(false);
        setMessages((m) => [
          ...m,
          {
            role: "system",
            tone: "error",
            title: "Não foi possível concluir o preenchimento",
            text:
              (r.motivo ?? "Falha desconhecida.") +
              " Tente novamente — a sessão só é marcada como 100% quando o servidor confirmar.",
          },
        ]);
        return;
      }
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "save",
          text: "Preenchimento concluído. Prompt definitivo reescrito e enviado ao servidor.",
        },
        {
          role: "agent",
          text:
            "✅ Sessão marcada como 100% completa. O prompt da persona foi reescrito de forma definitiva a partir da base atual.",
        },
      ]);
    } finally {
      setConcluindoPreenchimento(false);
    }
  };


  // Importação de progresso via .txt foi removida — o progresso é mantido
  // automaticamente neste navegador e enviado via POST a cada auto-save/salvar.


  const iniciarPerguntasAposPrefill = (baseAtual: Record<string, string[]>) => {
    const proxIdx = proximaPerguntaPendente(0, baseAtual);
    setStep(proxIdx);
    if (proxIdx >= TOTAL) {
      setMessages((m) => [
        ...m,
        {
          role: "agent",
          text:
            "Excelente! Com o material que você enviou já consegui cobrir todas as seções principais. Revise abaixo a Base de Conhecimento e me diga se deseja ajustar algo.",
        },
      ]);
      setFinalizado(true);
      setShowBase(true);
      void finalizarCriacaoCompleta(baseAtual, lacunas);
      return;
    }
    setMessages((m) => [
      ...m,
      {
        role: "agent",
        text:
          "Agora vou perguntar apenas o que ficou faltando para completar a Base. Pode responder com calma.",
      },
    ]);
    setTimeout(() => fazerPergunta(proxIdx), 700);
  };

  const togglePrefillFile = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    const allowed = arr.filter((f) => {
      const n = f.name.toLowerCase();
      return (
        n.endsWith(".pdf") ||
        n.endsWith(".docx") ||
        n.endsWith(".md") ||
        n.endsWith(".txt")
      );
    });
    setPrefillFiles((prev) => {
      const map = new Map(prev.map((f) => [f.name, f]));
      for (const f of allowed) map.set(f.name, f);
      return Array.from(map.values()).slice(0, 8);
    });
  };

  const removerPrefillFile = (name: string) => {
    setPrefillFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const submeterPrefill = async () => {
    setPrefillError(null);
    const url = prefillUrl.trim();
    if (!url && prefillFiles.length === 0) {
      setPrefillError("Informe um site ou anexe ao menos um arquivo.");
      return;
    }
    setPrefillStage("processing");
    try {
      // Extrai texto dos arquivos no navegador
      const documents: PrefillDoc[] = [];
      for (const f of prefillFiles) {
        try {
          const text = await extractTextFromFile(f);
          if (text.trim()) documents.push({ name: f.name, text });
        } catch (e) {
          console.error("Falha ao extrair", f.name, e);
        }
      }
      const result = await chamarPrefill({
        url: url || undefined,
        documents: documents.length > 0 ? documents : undefined,
      });
      setBase(result.base);
      setPrefillSummary(result.summary);
      setPrefillSources(result.sources);
      setPrefillStage("review");
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "save",
          text: `Material processado: ${result.sources.length} fonte(s).`,
        },
        {
          role: "agent",
          text:
            "Li o material que você enviou e organizei as informações relevantes abaixo. Confira o que foi lido. Se algo estiver errado ou faltando, descreva no chat o ajuste; quando estiver tudo certo, clique em 'Prosseguir para as lacunas'.",
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao processar material.";
      setPrefillError(msg);
      setPrefillStage("form");
    }
  };

  const pularPrefill = () => {
    setPrefillStage("done");
    setTimeout(() => fazerPergunta(0), 400);
  };

  // Envio avulso de arquivos a qualquer momento da conversa.
  // Extrai texto, chama o prefill e mescla os achados na Base atual.
  const enviarArquivosAvulsos = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList).filter((f) => {
      const n = f.name.toLowerCase();
      return n.endsWith(".pdf") || n.endsWith(".docx") || n.endsWith(".md") || n.endsWith(".txt");
    });
    if (attachInputRef.current) attachInputRef.current.value = "";
    if (arr.length === 0) {
      setMessages((m) => [
        ...m,
        { role: "system", tone: "error", title: "Formato não suportado", text: "Envie arquivos nos formatos PDF, DOCX, MD ou TXT." },
      ]);
      return;
    }
    setEnviandoArquivosAvulsos(true);
    setMessages((m) => [
      ...m,
      { role: "system", tone: "info", text: `Processando ${arr.length} arquivo(s): ${arr.map((f) => f.name).join(", ")}...` },
    ]);
    try {
      const documents: PrefillDoc[] = [];
      for (const f of arr) {
        try {
          const text = await extractTextFromFile(f);
          if (text.trim()) documents.push({ name: f.name, text });
        } catch (e) {
          console.error("Falha ao extrair", f.name, e);
        }
      }
      if (documents.length === 0) {
        throw new Error("Não consegui extrair texto dos arquivos enviados.");
      }
      const result = await chamarPrefill({ documents });
      // Mescla com a base atual sem duplicar entradas
      setBase((prev) => {
        const merged: Record<string, string[]> = { ...prev };
        for (const [campo, itens] of Object.entries(result.base)) {
          const existentes = new Set((merged[campo] ?? []).map((s) => s.trim().toLowerCase()));
          const novos = (itens ?? []).filter((s) => s && !existentes.has(s.trim().toLowerCase()));
          if (novos.length > 0) {
            merged[campo] = [...(merged[campo] ?? []), ...novos];
          }
        }
        return merged;
      });
      setPrefillSources((prev) => Array.from(new Set([...(prev ?? []), ...result.sources])));
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "save",
          text: `Material incorporado à Base: ${result.sources.length} fonte(s) processada(s).`,
        },
        {
          role: "agent",
          text:
            "Recebi e li o material que você enviou. Já incorporei o que era relevante à Base de Conhecimento. Podemos seguir de onde paramos — me conte o que mais deseja ajustar ou complementar.",
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao processar os arquivos.";
      setMessages((m) => [
        ...m,
        { role: "system", tone: "error", title: "Não consegui processar os arquivos", text: msg },
      ]);
    } finally {
      setEnviandoArquivosAvulsos(false);
    }
  };


  const confirmarPrefill = () => {
    setPrefillStage("done");
    iniciarPerguntasAposPrefill(base);
  };

  const iniciarModoCriacao = (resetMensagens = true) => {
    setCarregandoBase(false);
    setForcarCriacao(true);
    setStep(0);
    setBase({});
    setLacunas([]);
    setShowBase(false);
    setNotasAjuste([]);
    setFinalizado(false);
    setPrefillStage("form");
    setPrefillUrl("");
    setPrefillFiles([]);
    setPrefillSummary("");
    setPrefillSources([]);
    setPrefillError(null);
    if (resetMensagens) setMessages([]);
    setTyping(true);
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "info",
          text: "Modo criação ativado. Vamos construir uma nova Base de Conhecimento do zero.",
        },
        { role: "agent", text: OPENING },
        {
          role: "agent",
          text:
            "Antes de começar as perguntas, você pode acelerar o processo: informe o site da empresa e/ou envie materiais (PDF, DOCX, MD, TXT) como manual, apresentação ou catálogo. Vou ler tudo e pré-preencher o que conseguir, depois perguntamos apenas o que faltar.",
        },
      ]);
      setTyping(false);
    }, 400);
  };

  const iniciarModoAtualizacao = async (mostrarSaudacao = true) => {
    if (!promptId) return;
    setCarregandoBase(true);
    setTyping(true);
    if (mostrarSaudacao) {
      setMessages([
        {
          role: "agent",
          text: tokenMode
            ? `Olá! Identifiquei seu agente pelo link do AtendenteAI. Estou carregando o que já foi cadastrado para continuarmos de onde você parou.`
            : `Olá novamente! Localizei o identificador da sua Base de Conhecimento (ID: ${promptId}). Vou carregar as informações já cadastradas para revisarmos juntos.`,
        },
      ]);
    } else {
      setMessages((m) => [
        ...m,
        { role: "system", tone: "info", text: "Tentando carregar novamente a base existente..." },
      ]);
    }

    const resultado = await carregarBaseExistente(promptId, tokenMode ? "token" : "id");
    setCarregandoBase(false);
    setTyping(false);

    if (resultado.status === "ok") {
      setBase(resultado.base);
      setLacunas(resultado.lacunas);
      setShowBase(false);

      // Mede o quanto da base já está preenchido. Se 0% (nenhum campo com conteúdo),
      // alterna para o fluxo de criação para perguntar nome do agente, site e materiais
      // em vez de perguntar "o que deseja atualizar".
      const totalItens = Object.values(resultado.base).reduce(
        (acc, arr) => acc + (Array.isArray(arr) ? arr.filter((v) => (v ?? "").toString().trim().length > 0).length : 0),
        0,
      );
      if (totalItens === 0) {
        setMessages((m) => [
          ...m,
          {
            role: "system",
            tone: "info",
            text: "Nenhuma informação cadastrada ainda nesta base (0% preenchida). Vamos começar do início.",
          },
        ]);
        iniciarModoCriacao(false);
        return;
      }

      setMessages((m) => [
        ...m,
        { role: "system", tone: "save", text: "Base de Conhecimento carregada com sucesso." },
        {
          role: "agent",
          text:
            'Qual informação você gostaria de atualizar? Descreva em uma mensagem indicando a seção e o novo conteúdo (ex.: "Mudar o tom de voz para mais informal", "Atualizar política de reembolso para 7 dias", "Adicionar novo diferencial: atendimento 24h"). A cada mensagem eu registro a alteração. Quando estiver pronto, clique em "Concluir atualização" para enviar.',
        },
      ]);
      inputRef.current?.focus();
      return;
    }


    if (resultado.status === "notfound") {
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "error",
          title: "ID não encontrado",
          text: `O servidor não localizou nenhuma base com o ID "${promptId}". Verifique se digitou corretamente, tente novamente ou inicie uma nova base no modo criação.`,
          actions: [
            { label: "Tentar novamente", kind: "retry" },
            { label: "Iniciar nova base (modo criação)", kind: "create" },
          ],
        },
      ]);
      return;
    }

    if (resultado.status === "http") {
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "error",
          title: `Erro do servidor (HTTP ${resultado.code})`,
          text: "O servidor respondeu com erro ao tentar carregar a base. Você pode tentar novamente em alguns instantes ou seguir em modo criação.",
          actions: [
            { label: "Tentar novamente", kind: "retry" },
            { label: "Continuar em modo criação", kind: "create" },
          ],
        },
      ]);
      return;
    }

    if (resultado.status === "parse") {
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "error",
          title: "Resposta inválida do servidor",
          text: `Não consegui interpretar os dados recebidos (${resultado.detail}). Tente novamente ou siga em modo criação.`,
          actions: [
            { label: "Tentar novamente", kind: "retry" },
            { label: "Continuar em modo criação", kind: "create" },
          ],
        },
      ]);
      return;
    }

    // status === "cors" (ou falha de rede equivalente)
    setMessages((m) => [
      ...m,
      {
        role: "system",
        tone: "error",
        title: "Não foi possível carregar sua base (bloqueio de CORS ou falha de rede)",
        text:
          "O navegador impediu a leitura da resposta do servidor admin.atendenteai.com.br. Isso normalmente acontece quando o servidor não envia o cabeçalho Access-Control-Allow-Origin para esta página. " +
          "Verifique sua conexão e tente novamente. Se o problema persistir, é necessário liberar CORS no servidor (ou usar um proxy/backend intermediário). Enquanto isso, você pode continuar em modo criação e construir uma nova base do zero.",
        actions: [
          { label: "Tentar novamente", kind: "retry" },
          { label: "Continuar em modo criação", kind: "create" },
        ],
      },
    ]);
  };

  useEffect(() => {
    if (!open) return;

    // MODO ATUALIZAÇÃO: carrega do servidor (não usa cache local).
    if (idValido && promptId) {
      setMessages([]);
      setStep(0);
      setBase({});
      setLacunas([]);
      setFinalizado(false);
      setShowBase(false);
      setNotasAjuste([]);
      setForcarCriacao(false);
      setPrefillStage("form");
      setPrefillUrl("");
      setPrefillFiles([]);
      setPrefillSummary("");
      setPrefillSources([]);
      setPrefillError(null);
      iniciarModoAtualizacao(true);
      return;
    }

    // MODO CRIAÇÃO: NÃO restauramos nada do navegador.
    // O backend é a única fonte de verdade. A sessão começa limpa em cada
    // abertura/recarga; se houver implantação prévia, ela deve vir via
    // promptId/tokenMode (modo atualização → GET no servidor).
    setMessages([]);
    setStep(0);
    setBase({});
    setLacunas([]);
    setFinalizado(false);
    setShowBase(false);
    setNotasAjuste([]);
    setForcarCriacao(false);
    setPrefillStage("form");
    setPrefillUrl("");
    setPrefillFiles([]);
    setPrefillSummary("");
    setPrefillSources([]);
    setPrefillError(null);
    enviadoFinalRef.current = false;

    setTyping(true);
    const t = setTimeout(() => {
      setMessages([
        { role: "agent", text: OPENING },
        {
          role: "agent",
          text:
            "Antes de começar as perguntas, você pode acelerar o processo: informe o site da empresa e/ou envie materiais (PDF, DOCX, MD, TXT) como manual, apresentação ou catálogo. Vou ler tudo e pré-preencher o que conseguir, depois perguntamos apenas o que faltar.",
        },
      ]);
      setTyping(false);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, promptId]);

  // Sincroniza estado com o backend (modo criação) a cada mudança relevante.
  // Substitui a antiga persistência em localStorage: agora cada alteração
  // do usuário dispara um POST (debounced) para o servidor, que é a única
  // fonte de verdade da implantação.
  useEffect(() => {
    if (!open) return;
    if (idValido && !forcarCriacao) return; // modo atualização tem fluxo próprio
    if (messages.length === 0 && Object.keys(base).length === 0) return;
    // Debounce: ao chegar uma nova alteração, cancela o timer anterior.
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      // Snapshot construído DENTRO do timeout — captura o estado mais recente
      // (último valor das closures), e o prompt_persona será regenerado a
      // partir dele em enviarParcialCriacao.
      const snap: PersistedState = {
        conversationId: conversationIdRef.current,
        messages,
        base,
        lacunas,
        step,
        finalizado,
        notasAjuste,
        forcarCriacao,
        prefillStage,
        prefillUrl,
        prefillSummary,
        prefillSources,
        showBase,
        history: historyRef.current,
        enviadoFinal: enviadoFinalRef.current,
        updatedAt: Date.now(),
      };
      // Aborta envio em voo (resultado obsoleto) e marca sequência.
      if (saveAbortRef.current) {
        try { saveAbortRef.current.abort(); } catch { /* noop */ }
      }
      const controller = new AbortController();
      saveAbortRef.current = controller;
      const mySeq = ++saveSeqRef.current;
      void enviarParcialCriacao(conversationIdRef.current, snap, controller.signal)
        .then((r) => {
          if (mySeq !== saveSeqRef.current) return; // descartado por envio mais novo
          if (saveAbortRef.current === controller) saveAbortRef.current = null;
          if (r.ok) setUltimoSalvamento(new Date());
        })
        .catch(() => { /* erro é tratado nos pontos de envio explícito */ });
    }, 600);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [
    open,
    idValido,
    forcarCriacao,
    messages,
    base,
    lacunas,
    step,
    finalizado,
    notasAjuste,
    prefillStage,
    prefillUrl,
    prefillSummary,
    prefillSources,
    showBase,
  ]);


  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const handleSendUpdate = () => {
    const text = input.trim();
    if (!text || finalizado) return;

    // ---------- VALIDAÇÃO OBRIGATÓRIA NO MODO ATUALIZAÇÃO ----------
    // Rejeita ajustes vagos como "mudar tudo", "atualizar", "trocar nome",
    // até 2 vezes. Na 3ª, aceita para não travar o usuário.
    if (tentativasUpdRef.current < 2) {
      const v = validarAjusteUsuario(text);
      if (!v.ok) {
        const motivoInv = v.motivo;
        const exemplosInv = v.exemplos;
        tentativasUpdRef.current += 1;
        setMessages((m) => [...m, { role: "user", text }]);
        setInput("");
        const ofereceOpcoes = tentativasUpdRef.current >= 2;
        const exemplosTxt = exemplosInv.length
          ? "\n\nExemplos de ajustes válidos:\n" +
            exemplosInv.map((e) => `• ${e}`).join("\n")
          : "";
        const opcoesTxt = ofereceOpcoes
          ? "\n\nSe preferir, escolha uma área para alterar e descreva o **novo valor**:\n" +
            CAMPOS_BASE.map((c, i) => `${i + 1}. ${c}`).join("\n")
          : "";
        setTimeout(() => {
          setMessages((m) => [
            ...m,
            {
              role: "system",
              tone: "gap",
              title: "Ajuste incompleto — especifique campo e novo conteúdo",
              text:
                `${motivoInv}\n\nPara aplicar, envie: (1) a seção que deseja alterar e (2) o novo texto completo.` +
                exemplosTxt +
                opcoesTxt,
            },
          ]);
        }, 300);
        return;
      }
    }
    // Aceita — zera contador para próximo ajuste
    tentativasUpdRef.current = 0;

    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    const novasNotas = [...notasAjuste, text];
    setNotasAjuste(novasNotas);

    // ---------- DETECÇÃO DE INTENÇÃO DE REMOÇÃO ----------
    // Se o usuário pedir para retirar/remover/excluir/apagar/eliminar/deletar
    // um trecho (idealmente entre aspas ou após ":"), removemos esse trecho
    // dos itens da base, em vez de apenas anexar como nova entrada.
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .replace(/^[\s\-•"'`«»“”‘’.,;:!?()[\]]+|[\s\-•"'`«»“”‘’.,;:!?()[\]]+$/g, "")
        .trim();

    const intentRemocao =
      /\b(retir(e|ar|a|o)|remov(er|a|e|i)|exclu(ir|a|i)|apag(ar|ue|a)|delet(ar|e|a)|elimin(ar|e|a)|tir(ar|e|a))\b/i.test(
        text,
      ) || /\bsem\s+(essa|esta|esse|este|o\s+trecho|a\s+parte)\b/i.test(text);

    let alvo = "";
    if (intentRemocao) {
      // 1) tenta extrair conteúdo entre aspas / crases / chevrons
      const mQuote = text.match(/["“”'`«»]([^"“”'`«»]{2,})["“”'`«»]/);
      if (mQuote) {
        alvo = mQuote[1].trim();
      } else {
        // 2) depois de ":" ou após o verbo de remoção
        const mColon = text.split(/:\s+/);
        if (mColon.length > 1) {
          alvo = mColon.slice(1).join(": ").trim();
        } else {
          const mVerb = text.match(
            /\b(?:retir(?:e|ar|a|o)|remov(?:er|a|e|i)|exclu(?:ir|a|i)|apag(?:ar|ue|a)|delet(?:ar|e|a)|elimin(?:ar|e|a)|tir(?:ar|e|a))\s+(?:o|a|os|as|esse|essa|este|esta|o\s+trecho|a\s+parte|a\s+frase|a\s+linha|isso)?\s*[:\-—]?\s*(.{3,})/i,
          );
          if (mVerb) alvo = mVerb[1].trim();
        }
      }
      alvo = alvo.replace(/^["“”'`«»\s\-–—]+|["“”'`«»\s\-–—.,;:!?]+$/g, "").trim();
    }

    let baseAtualizada: Record<string, string[]> = base;
    let secaoDetectada: string | null = detectarSecaoPorTexto(text);
    const removidos: { secao: string; trecho: string }[] = [];
    let substituido = false;

    // ---------- INTENÇÃO DE SUBSTITUIÇÃO ----------
    // Padrões: "altere/substitua/troque/mude ... para/por/com: <novo>"
    // Quando há seção detectada, substitui o conteúdo daquela seção pelo novo.
    const intentSubstituicao =
      /\b(substitu(ir|a|i)|altere|alterar|alterando|troc(ar|a|ue|o)|mud(ar|e|a|o)|atualiz(ar|e|a|o)|corrij(a|ir)|corrige|reescrev(er|a|e))\b/i.test(
        text,
      );
    if (intentSubstituicao && !intentRemocao && secaoDetectada) {
      // Captura o "novo conteúdo" após para/por/com/:
      let novo = "";
      const mPara = text.match(/\b(?:para|por|com)\s*:?\s*(.{2,})$/i);
      const mDoisP = text.match(/:\s*(.{2,})$/);
      if (mPara) novo = mPara[1].trim();
      else if (mDoisP) novo = mDoisP[1].trim();
      novo = novo.replace(/^["“”'`«»\s\-–—]+|["“”'`«»\s\-–—.,;!?]+$/g, "").trim();
      if (novo && novo.length >= 2) {
        // Quebra por vírgulas/;/quebras de linha em itens (mantém aspas internas).
        const itensNovos = novo
          .split(/\s*(?:;|\n|·)\s*|\s*,\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 2);
        baseAtualizada = {
          ...base,
          [secaoDetectada]: itensNovos.length > 0 ? itensNovos : [novo],
        };
        setBase(baseAtualizada);
        substituido = true;
      }
    }

    if (!substituido && intentRemocao && alvo && alvo.length >= 3) {
      const alvoNorm = norm(alvo);
      const reAlvo = new RegExp(
        alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      const novaBase: Record<string, string[]> = {};
      for (const [k, itens] of Object.entries(base)) {
        const arr = Array.isArray(itens) ? itens : [];
        // Se o usuário indicou uma seção, restringimos a remoção a ela.
        if (secaoDetectada && k !== secaoDetectada) {
          novaBase[k] = arr.slice();
          continue;
        }
        const out: string[] = [];
        for (const it of arr) {
          const itStr = typeof it === "string" ? it : String(it ?? "");
          if (norm(itStr) === alvoNorm) {
            removidos.push({ secao: k, trecho: itStr });
            continue;
          }
          if (reAlvo.test(itStr)) {
            const novo = itStr.replace(reAlvo, "").replace(/\s{2,}/g, " ").trim();
            removidos.push({ secao: k, trecho: alvo });
            if (novo) out.push(novo);
            continue;
          }
          out.push(itStr);
        }
        novaBase[k] = out;
      }
      if (removidos.length > 0) {
        baseAtualizada = novaBase;
        setBase(novaBase);
      } else if (secaoDetectada) {
        // Usuário pediu remoção genérica numa seção sem indicar trecho:
        // limpamos a seção inteira.
        const limpa = { ...base, [secaoDetectada]: [] };
        baseAtualizada = limpa;
        setBase(limpa);
        removidos.push({ secao: secaoDetectada, trecho: "(seção limpa)" });
      }
    }

    // Se NÃO foi remoção/substituição (ou não encontramos o alvo), mantém o
    // comportamento anterior: heurística de seção e anexar como novo conteúdo.
    if (!substituido && removidos.length === 0) {
      const secao =
        secaoDetectada ??
        CAMPOS_BASE.find((c) => text.toLowerCase().includes(c.toLowerCase())) ??
        null;
      if (secao && !intentRemocao) {
        baseAtualizada = { ...base, [secao]: [...(base[secao] ?? []), text] };
        secaoDetectada = secao;
        setBase(baseAtualizada);
      } else {
        secaoDetectada = secao;
      }
    }


    const promptRevisado = gerarPromptPersona(baseAtualizada, novasNotas);
    void promptRevisado; // gerado para uso interno/compliance; não exibido ao usuário
    setTimeout(() => {
      let msgTxt: string;
      if (substituido && secaoDetectada) {
        msgTxt = `Conteúdo de "${secaoDetectada}" substituído pelo novo texto.`;
      } else if (removidos.length > 0) {
        const secs = Array.from(new Set(removidos.map((r) => r.secao))).join(", ");
        msgTxt = `Trecho removido de: ${secs}.`;
      } else if (secaoDetectada) {
        msgTxt = `Ajuste registrado em: ${secaoDetectada}.`;
      } else {
        msgTxt = "Ajuste registrado nas notas de atualização.";
      }
      setMessages((m) => [
        ...m,
        { role: "system", tone: "save", text: msgTxt },
        {
          role: "agent",
          text:
            "Alteração registrada. Se quiser fazer mais ajustes, é só me dizer qual seção e o novo conteúdo (ou peça para retirar um trecho específico, de preferência entre aspas). Quando estiver pronto, clique em **Concluir atualização**.",
        },
      ]);
    }, 350);

    void pedirComentarioIA(text, {
      tipo: removidos.length > 0 ? "remocao_em_atualizacao" : "ajuste_em_atualizacao",
      secao_detectada: secaoDetectada,
      removidos: removidos.length > 0 ? removidos : undefined,
    });
  };

  const handleConcluirUpdate = async () => {
    if (!promptId) return;
    setEnviandoUpdate(true);

    // Compliance check obrigatório também na atualização
    setMessages((m) => [
      ...m,
      { role: "system", tone: "info", text: "Verificando políticas de uso (compliance)…" },
    ]);
    let compliance: ComplianceCheckResult | null = null;
    try {
      compliance = await runComplianceCheck({
        tenant_id: getAgenteExterno(),
        agent_id: promptId,
        conversation_id: conversationIdRef.current,
        trigger_event: "atualizacao_finalizada",
        payload: {
          base,
          mensagens_automaticas: notasAjuste.join("\n"),
          produtos_servicos: (base["Produtos e serviços"] ?? []).join("\n"),
        },
      });
    } catch (e) {
      console.error("Falha compliance update:", e);
      setEnviandoUpdate(false);
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "error",
          title: "Não foi possível verificar compliance",
          text: "A verificação obrigatória falhou. Tente novamente — o envio só ocorre após a aprovação.",
        },
      ]);
      return;
    }

    if (compliance.decision !== "liberado") {
      setEnviandoUpdate(false);
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: compliance.decision === "bloqueado" ? "error" : "gap",
          title:
            compliance.decision === "bloqueado"
              ? `Atualização bloqueada (risco ${compliance.risk_level.toUpperCase()})`
              : `Aguardando revisão humana (risco ${compliance.risk_level.toUpperCase()})`,
          text:
            compliance.decision === "bloqueado"
              ? MSG_BLOQUEIO_CRITICO
              : MSG_REVISAO_HUMANA,
        },
      ]);
      return;
    }

    const promptPersonaAtualizado = gerarPromptPersona(base, notasAjuste);
    const resultadoUpd = await enviarBaseAtualizada(
      promptId,
      base,
      lacunas,
      notasAjuste,
      promptPersonaAtualizado,
    );
    setEnviandoUpdate(false);
    if (!resultadoUpd.ok) {
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "error",
          title:
            resultadoUpd.etapa === "validacao"
              ? "Atualização bloqueada — dados inválidos"
              : resultadoUpd.etapa === "rede"
                ? "Falha de comunicação com o servidor"
                : "Resposta inválida do servidor",
          text: resultadoUpd.motivo ?? "Não foi possível atualizar a Base de Conhecimento.",
          actions: [{ label: "Tentar novamente", kind: "retry" }],
        },
      ]);
      return;
    }
    setFinalizado(true);
    setMessages((m) => [
      ...m,
      {
        role: "agent",
        text:
          "Pronto! As alterações foram aprovadas em compliance e enviadas para o servidor. Sua Base de Conhecimento foi atualizada com sucesso.",
      },
    ]);
  };

  const handleSend = () => {
    if (modoAtualizacao) return handleSendUpdate();
    const text = input.trim();
    if (!text || finalizado) return;

    // Se estamos na revisão do pré-preenchimento, tratamos a mensagem como
    // um ajuste/comentário antes de prosseguir para as lacunas.
    if (prefillStage === "review") {
      setMessages((m) => [...m, { role: "user", text }]);
      setInput("");
      setNotasAjuste((n) => [...n, text]);
      const lower = text.toLowerCase();
      const secao = CAMPOS_BASE.find((c) => lower.includes(c.toLowerCase()));
      if (secao) {
        setBase((b) => ({ ...b, [secao]: [...(b[secao] ?? []), text] }));
      }
      setTimeout(() => {
        setMessages((m) => [
          ...m,
          {
            role: "system",
            tone: "save",
            text: secao ? `Ajuste registrado em: ${secao}.` : "Ajuste registrado para esta sessão.",
          },
        ]);
      }, 300);
      void pedirComentarioIA(text, {
        tipo: "ajuste_em_prefill",
        secao_detectada: secao ?? null,
      });
      return;
    }

    const pAtual = PERGUNTAS[step];
    if (!pAtual) return;

    // Perguntas opcionais aceitam termos de "pular" — salvamos string vazia
    // e o nome final é derivado depois (ex.: "Agente <Empresa>").
    const ehPular = pAtual.opcional && SKIP_REGEX.test(text);
    const valorSalvo = ehPular ? "" : text;

    // ---------- VALIDAÇÃO OBRIGATÓRIA DE RESPOSTA ----------
    // Não avança se a resposta for genérica/vaga. Após 2 tentativas inválidas,
    // oferecemos opções comuns; na 3ª, aceitamos para não travar o usuário.
    const ehRevisao = pAtual.campo === "Revisão";
    if (!ehPular && !ehRevisao) {
      const tentativasPrevias = tentativasInvRef.current[step] ?? 0;
      if (tentativasPrevias < 2) {
        const v = validarRespostaUsuario(text, pAtual);
        if (!v.ok) {
          const motivoInv = v.motivo;
          const exemplosInv = v.exemplos;
          tentativasInvRef.current[step] = tentativasPrevias + 1;
          setMessages((m) => [...m, { role: "user", text }]);
          setInput("");
          const proximaTentativa = tentativasPrevias + 1;
          const ofereceOpcoes = proximaTentativa >= 2;
          const exemplosTxt = exemplosInv.length
            ? "\n\nExemplos válidos para esta pergunta:\n" +
              exemplosInv.map((e) => `• ${e}`).join("\n")
            : "";
          const opcoesTxt = ofereceOpcoes
            ? "\n\nNão consegui identificar claramente. Selecione a opção mais próxima do seu negócio (ou descreva em uma frase completa):\n" +
              OPCOES_GENERICAS_NEGOCIO.map((o, i) => `${i + 1}. ${o}`).join("\n")
            : "";
          setTimeout(() => {
            setMessages((m) => [
              ...m,
              {
                role: "system",
                tone: "gap",
                title: "Preciso de mais detalhes",
                text:
                  `${motivoInv} Para configurar corretamente o seu agente, preciso de uma resposta específica e suficiente.` +
                  exemplosTxt +
                  opcoesTxt +
                  `\n\n**Pergunta:** ${pAtual.texto}`,
              },
            ]);
          }, 300);
          return;
        }

      }
      // Aceita após 2 tentativas inválidas — zera o contador para próxima pergunta
      tentativasInvRef.current[step] = 0;
    }

    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    if (!ehRevisao) {
      setBase((b) => ({ ...b, [pAtual.campo]: [...(b[pAtual.campo] ?? []), valorSalvo] }));
    }

    const temLacuna = pAtual.lacunaSe?.(text);
    if (temLacuna && pAtual.lacunaMsg) {
      setLacunas((l) => (l.includes(pAtual.lacunaMsg!) ? l : [...l, pAtual.lacunaMsg!]));
    }

    setTimeout(() => {
      if (!ehRevisao) {
        setMessages((m) => [
          ...m,
          { role: "system", tone: "save", text: `Resposta salva em: ${pAtual.campo}.` },
        ]);
      }

      void pedirComentarioIA(text, {
        pergunta_atual: pAtual.texto,
        campo: pAtual.campo,
        tem_lacuna: !!temLacuna,
      });


      if (temLacuna) {
        setTimeout(() => {
          setMessages((m) => [
            ...m,
            {
              role: "system",
              tone: "gap",
              text: "Percebi que ainda não definimos esse ponto com clareza. Poderia me explicar como funciona atualmente, com mais detalhes?",
            },
          ]);
        }, 500);
      }

      // Próxima pergunta — pula campos já preenchidos pelo prefill.
      const baseAposResposta = {
        ...base,
        [pAtual.campo]: [...(base[pAtual.campo] ?? []), text],
      };
      const proxIdx = proximaPerguntaPendente(step + 1, baseAposResposta);
      setStep(proxIdx);

      if (proxIdx >= TOTAL) {
        setTimeout(() => {
          setMessages((m) => [
            ...m,
            {
              role: "agent",
              text:
                "Perfeito. Estruturei uma primeira versão da Base de Conhecimento da sua empresa com todas as informações que você compartilhou. Abaixo você pode revisar as seções e os pontos que ainda precisam ser completados.",
            },
          ]);
          setFinalizado(true);
          setShowBase(true);
          void finalizarCriacaoCompleta(baseAposResposta, lacunas);
        }, 900);
      } else {
        setTimeout(() => fazerPergunta(proxIdx), temLacuna ? 1400 : 700);
      }
    }, 500);
  };

  if (!open) return null;

  if (!agenteExterno && !modoAtualizacao) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm p-0 sm:p-4 animate-fade-up">
        <div className="w-full sm:max-w-lg bg-card rounded-t-3xl sm:rounded-3xl shadow-elegant border border-border overflow-hidden">
          <div className="p-6 sm:p-8 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-destructive" />
            </div>
            <h2 className="font-display font-semibold text-lg">
              Acesso sem agente vinculado
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Esta página só pode ser utilizada quando aberta a partir do sistema{" "}
              <strong>AtendenteAI</strong>. Para iniciar um diagnóstico, volte ao sistema e clique em{" "}
              <strong>"NOVO AGENTE"</strong> — isso gerará o link correto com o identificador do agente.
            </p>
            <p className="text-xs text-muted-foreground">
              Nenhuma informação será coletada, enviada ou processada sem essa vinculação.
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 transition text-sm font-medium"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm p-0 sm:p-4 animate-fade-up">
      <div className="w-full sm:max-w-5xl bg-card rounded-t-3xl sm:rounded-3xl shadow-elegant border border-border flex flex-col lg:flex-row h-[92vh] sm:h-[680px] overflow-hidden">
        {/* Chat principal */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-3 p-4 border-b border-border bg-gradient-to-r from-primary/5 to-accent/5">
            <div className="w-10 h-10 rounded-2xl gradient-hero flex items-center justify-center shadow-glow">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-sm flex items-center gap-2">
                Arquiteto de Conhecimento IA
                {modoAtualizacao && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent/15 text-accent border border-accent/30 inline-flex items-center gap-1">
                    <RefreshCw className="w-2.5 h-2.5" /> Atualização
                  </span>
                )}
                {!modoAtualizacao && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1"
                    title={
                      ultimoSalvamento
                        ? `Último salvamento: ${ultimoSalvamento.toLocaleString("pt-BR")}`
                        : "Auto-save ativo — seu progresso será salvo automaticamente"
                    }
                  >
                    <Save className="w-2.5 h-2.5" />
                    {ultimoSalvamento
                      ? `Salvo ${ultimoSalvamento.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                      : "Auto-save ativo"}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
                {modoAtualizacao ? `ID: ${promptId}` : "Consultor de Implantação · online"}
              </div>
              {agenteExterno ? (
                <div className="text-[11px] font-medium text-accent flex items-center gap-1.5 mt-0.5">
                  <Globe className="w-3 h-3" />
                  Agente vinculado: #{agenteExterno}
                </div>
              ) : (
                !modoAtualizacao && (
                  <div className="text-[11px] font-semibold text-destructive flex items-center gap-1.5 mt-0.5 animate-pulse">
                    <AlertCircle className="w-3 h-3" />
                    Atenção: clique em "NOVO AGENTE" no sistema AtendenteAI para vincular este diagnóstico.
                  </div>
                )
              )}
            </div>
            <div className="flex items-center gap-1">
              {!modoAtualizacao && (
                <>
                  {(messages.length > 0 || Object.keys(base).length > 0) && (
                    <button
                      onClick={handleSalvarProgresso}
                      disabled={salvandoParcial}
                      className="px-2.5 py-1.5 rounded-xl hover:bg-secondary transition text-xs flex items-center gap-1 text-muted-foreground disabled:opacity-50"
                      aria-label="Salvar progresso"
                      title="Salvar progresso (envia ao servidor)"
                    >
                      {salvandoParcial ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">Salvar</span>
                    </button>
                  )}
                  {(messages.length > 0 || Object.keys(base).length > 0) && (
                    <button
                      onClick={() => {
                        if (confirm("Recomeçar a conversa? A sessão atual será descartada.")) {
                          recomecarConversa();
                        }
                      }}
                      className="p-2 rounded-xl hover:bg-secondary transition text-muted-foreground"
                      aria-label="Recomeçar"
                      title="Recomeçar conversa"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition" aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-4 pt-3 pb-2 border-b border-border bg-card">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-foreground">
                {modoAtualizacao
                  ? etapaAtual
                  : `Etapa ${numeroEtapa} de ${ETAPAS.length} — ${etapaAtual}`}
              </span>
              <span className="text-muted-foreground font-medium">{progresso}%</span>
            </div>
            <Progress value={progresso} className="h-2" />
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-background to-secondary/30">
            {messages.map((m, i) => {
              if (m.role === "system") {
                if (m.tone === "error") {
                  return (
                    <div key={i} className="flex justify-center animate-fade-up">
                      <div className="w-full max-w-[95%] rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-left">
                        <div className="flex items-start gap-2 mb-1.5">
                          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                          <div className="text-sm font-semibold text-destructive">
                            {m.title ?? "Não foi possível carregar a base"}
                          </div>
                        </div>
                        <div className="text-xs text-destructive/90 leading-relaxed pl-6 whitespace-pre-line">
                          {m.text}
                        </div>
                        {m.actions && m.actions.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3 pl-6">
                            {m.actions.map((a, j) => (
                              <Button
                                key={j}
                                size="sm"
                                variant={a.kind === "retry" ? "default" : "outline"}
                                onClick={() =>
                                  a.kind === "retry" ? iniciarModoAtualizacao(false) : iniciarModoCriacao(false)
                                }
                                disabled={carregandoBase}
                                className="rounded-xl h-8 text-xs"
                              >
                                {a.kind === "retry" ? <RefreshCw className="w-3 h-3 mr-1.5" /> : null}
                                {a.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                const isGap = m.tone === "gap";
                return (
                  <div key={i} className="flex justify-center animate-fade-up">
                    <div
                      className={`text-xs px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
                        isGap
                          ? "bg-destructive/5 border-destructive/20 text-destructive"
                          : "bg-accent/5 border-accent/20 text-accent"
                      }`}
                    >
                      {isGap ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                      {m.text}
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-up`}>
                  <div
                    className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed rounded-2xl ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-card border border-border text-foreground rounded-bl-md shadow-card"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })}
            {(typing || carregandoBase) && (
              <div className="flex justify-start">
                <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 shadow-card">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-pulse-dot" />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-pulse-dot" style={{ animationDelay: "0.2s" }} />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-pulse-dot" style={{ animationDelay: "0.4s" }} />
                  </div>
                </div>
              </div>
            )}

            {!modoAtualizacao && (prefillStage === "form" || prefillStage === "processing") && (
              <PrefillPanel
                url={prefillUrl}
                onUrlChange={setPrefillUrl}
                files={prefillFiles}
                onFiles={togglePrefillFile}
                onRemoveFile={removerPrefillFile}
                onSubmit={submeterPrefill}
                onSkip={pularPrefill}
                processing={prefillStage === "processing"}
                error={prefillError}
              />
            )}

            {!modoAtualizacao && prefillStage === "review" && (
              <PrefillReview
                summary={prefillSummary}
                sources={prefillSources}
                base={base}
                onConfirm={confirmarPrefill}
              />
            )}

            {/* Prévia da Base de Conhecimento removida: o prompt e a estrutura interna não são mais exibidos ao usuário para manter o foco no diálogo com o consultor. */}
          </div>

          <div className="p-3 border-t border-border bg-card space-y-2">
            <div className="flex items-end gap-2">
              <input
                ref={attachInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
                onChange={(e) => enviarArquivosAvulsos(e.target.files)}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Anexar arquivos (PDF, DOCX, MD, TXT)"
                onClick={() => attachInputRef.current?.click()}
                disabled={finalizado || carregandoBase || enviandoArquivosAvulsos || (!modoAtualizacao && (prefillStage === "processing" || prefillStage === "form"))}
                className="rounded-2xl h-12 w-12 shrink-0"
              >
                {enviandoArquivosAvulsos ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              </Button>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={
                  finalizado
                    ? modoAtualizacao
                      ? "Atualização concluída"
                      : "Diagnóstico concluído"
                    : modoAtualizacao
                      ? "Descreva o que deseja atualizar..."
                      : prefillStage === "review"
                        ? "Descreva ajustes antes de prosseguir (opcional)..."
                        : prefillStage === "form" || prefillStage === "processing"
                          ? "Envie o material acima ou pule para começar..."
                          : "Escreva sua resposta..."
                }
                disabled={finalizado || carregandoBase || (!modoAtualizacao && (prefillStage === "processing" || prefillStage === "form"))}
                className="flex-1 px-4 py-3 bg-secondary rounded-2xl text-sm outline-none focus:ring-2 focus:ring-primary/30 transition disabled:opacity-60"
              />
              <Button onClick={handleSend} disabled={finalizado || carregandoBase || (!modoAtualizacao && (prefillStage === "processing" || prefillStage === "form"))} size="icon" className="rounded-2xl h-12 w-12 shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
            {modoAtualizacao && !finalizado && (
              <Button
                onClick={handleConcluirUpdate}
                disabled={enviandoUpdate || carregandoBase}
                variant="outline"
                className="w-full rounded-2xl h-11"
              >
                <Save className="w-4 h-4 mr-2" />
                {enviandoUpdate ? "Enviando alterações..." : "Concluir atualização e enviar"}
              </Button>
            )}
            {!modoAtualizacao && !finalizado && (
              <Button
                onClick={handleConcluirPreenchimento}
                disabled={concluindoPreenchimento || carregandoBase || prefillStage === "processing" || prefillStage === "form"}
                variant="outline"
                className="w-full rounded-2xl h-11"
              >
                <Save className="w-4 h-4 mr-2" />
                {concluindoPreenchimento ? "Concluindo preenchimento..." : "Concluir preenchimento"}
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground px-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {modoAtualizacao
                ? "Suas alterações serão enviadas ao servidor com o ID desta base."
                : "Cada pergunta é registrada para construir sua Base de Conhecimento"}
            </p>
          </div>
        </div>

        {/* Painel lateral */}
        <aside className="hidden lg:flex w-80 border-l border-border bg-gradient-to-b from-secondary/40 to-background flex-col">
          <div className="p-5 border-b border-border">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Qualidade da Base de Conhecimento
            </div>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-3xl font-display font-bold gradient-text">{completude}%</span>
              <span className="text-xs text-muted-foreground mb-1.5">
                {completude < 30 ? "Base inicial" : completude < 75 ? "Em construção" : "Pronta para revisão"}
              </span>
            </div>
            <Progress value={completude} className="h-2" />
            {modoAtualizacao && promptId && (
              <div className="mt-3 text-[11px] text-muted-foreground break-all">
                <span className="font-semibold text-foreground">ID:</span> {promptId}
              </div>
            )}
          </div>

          {!modoAtualizacao && (
            <div className="p-5 border-b border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
                Etapas da Implantação
              </div>
              <ol className="space-y-1.5">
                {ETAPAS.map((e, i) => {
                  const done = i < numeroEtapa - 1 || (i === numeroEtapa - 1 && finalizado);
                  const current = i === numeroEtapa - 1 && !finalizado;
                  return (
                    <li key={e} className="flex items-center gap-2 text-xs">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${
                          done
                            ? "bg-accent text-white"
                            : current
                              ? "bg-primary text-white"
                              : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {done ? "✓" : i + 1}
                      </span>
                      <span className={current ? "font-medium text-foreground" : "text-muted-foreground"}>{e}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {modoAtualizacao && notasAjuste.length > 0 && (
            <div className="p-5 border-b border-border">
              <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-2 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Ajustes nesta sessão
              </div>
              <ul className="space-y-1.5">
                {notasAjuste.map((n, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-snug">• {n}</li>
                ))}
              </ul>
            </div>
          )}

          {lacunas.length > 0 && (
            <div className="p-5 border-b border-border">
              <div className="text-xs uppercase tracking-wider text-destructive font-semibold mb-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Informações pendentes
              </div>
              <ul className="space-y-1.5">
                {lacunas.map((l) => (
                  <li key={l} className="text-xs text-muted-foreground leading-snug">• {l}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-5 mt-auto">
            <div className="text-[11px] text-muted-foreground flex items-start gap-2">
              <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {modoAtualizacao
                  ? "Ao concluir, todas as alterações serão enviadas com o ID desta base para sincronização."
                  : "Suas respostas são organizadas em tempo real em uma Base de Conhecimento estruturada."}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

const SECOES_FINAIS = [
  "Nome do Agente",
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
];

const BasePreview = ({ base, lacunas }: { base: Record<string, string[]>; lacunas: string[] }) => (
  <div className="mt-4 bg-card border border-border rounded-2xl p-5 shadow-card animate-fade-up">
    <div className="flex items-center gap-2 mb-4">
      <div className="w-8 h-8 rounded-xl gradient-hero flex items-center justify-center">
        <FileText className="w-4 h-4 text-white" />
      </div>
      <div>
        <div className="font-display font-semibold text-sm">Prévia da Base de Conhecimento</div>
        <div className="text-xs text-muted-foreground">Estrutura atual da Base — pronta para ajustes</div>
      </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {SECOES_FINAIS.map((s) => {
        const conteudo = base[s] ?? [];
        const preenchida = conteudo.length > 0;
        return (
          <div
            key={s}
            className={`rounded-xl border p-3 text-xs ${
              preenchida ? "border-accent/30 bg-accent/5" : "border-dashed border-border bg-secondary/30"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-foreground">{s}</span>
              {preenchida ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </div>
            <p className="text-muted-foreground leading-snug line-clamp-3">
              {preenchida ? conteudo.join(" · ") : "Pendente — pode ser complementado em uma próxima sessão."}
            </p>
          </div>
        );
      })}
    </div>
    <div className="mt-4 pt-4 border-t border-border">
      <div className="text-xs uppercase tracking-wider text-destructive font-semibold mb-2 flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5" /> Informações Pendentes
      </div>
      {lacunas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma lacuna crítica identificada.</p>
      ) : (
        <ul className="space-y-1">
          {lacunas.map((l) => (
            <li key={l} className="text-xs text-muted-foreground">• {l}</li>
          ))}
        </ul>
      )}
    </div>
  </div>
);

interface PrefillPanelProps {
  url: string;
  onUrlChange: (v: string) => void;
  files: File[];
  onFiles: (files: FileList | null) => void;
  onRemoveFile: (name: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  processing: boolean;
  error: string | null;
}

const PrefillPanel = ({
  url,
  onUrlChange,
  files,
  onFiles,
  onRemoveFile,
  onSubmit,
  onSkip,
  processing,
  error,
}: PrefillPanelProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="bg-card border border-primary/20 rounded-2xl p-4 shadow-card animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl gradient-hero flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="font-display font-semibold text-sm">Acelerar com material existente</div>
          <div className="text-xs text-muted-foreground">Site e/ou arquivos (PDF, DOCX, MD, TXT)</div>
        </div>
      </div>

      <label className="text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
        <Globe className="w-3.5 h-3.5" /> Site da empresa (opcional)
      </label>
      <input
        type="url"
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://suaempresa.com.br"
        disabled={processing}
        className="w-full px-3 py-2 bg-secondary rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30 transition disabled:opacity-60 mb-3"
      />

      <div className="text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
        <Upload className="w-3.5 h-3.5" /> Anexar arquivos (opcional)
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
        onChange={(e) => onFiles(e.target.files)}
        disabled={processing}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={processing}
        onClick={() => fileInputRef.current?.click()}
        className="rounded-xl h-9 text-xs w-full"
      >
        <Upload className="w-3.5 h-3.5 mr-1.5" /> Selecionar arquivos
      </Button>

      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f) => (
            <li
              key={f.name}
              className="flex items-center justify-between text-xs bg-secondary/60 rounded-lg px-2.5 py-1.5"
            >
              <span className="truncate flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                {f.name}
              </span>
              <button
                type="button"
                onClick={() => onRemoveFile(f.name)}
                disabled={processing}
                className="text-muted-foreground hover:text-destructive transition"
                aria-label={`Remover ${f.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-3 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-2.5 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <Button onClick={onSubmit} disabled={processing} className="flex-1 rounded-xl h-10 text-xs">
          {processing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Lendo material...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Pré-preencher
            </>
          )}
        </Button>
        <Button
          onClick={onSkip}
          disabled={processing}
          variant="outline"
          className="rounded-xl h-10 text-xs"
        >
          <SkipForward className="w-3.5 h-3.5 mr-1.5" /> Pular
        </Button>
      </div>
    </div>
  );
};

interface PrefillReviewProps {
  summary: string;
  sources: string[];
  base: Record<string, string[]>;
  onConfirm: () => void;
}

const PrefillReview = ({ summary, sources, base, onConfirm }: PrefillReviewProps) => {
  const preenchidos = SECOES_FINAIS.filter((s) => (base[s]?.length ?? 0) > 0);
  return (
    <div className="bg-card border border-accent/30 rounded-2xl p-4 shadow-card animate-fade-up space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center">
          <CheckCircle2 className="w-4 h-4 text-accent" />
        </div>
        <div>
          <div className="font-display font-semibold text-sm">O que foi lido e considerado relevante</div>
          <div className="text-xs text-muted-foreground">
            {sources.length} fonte(s) · {preenchidos.length} seção(ões) pré-preenchida(s)
          </div>
        </div>
      </div>

      {sources.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Fontes</div>
          <ul className="space-y-0.5">
            {sources.map((s) => (
              <li key={s} className="text-xs text-muted-foreground truncate">• {s}</li>
            ))}
          </ul>
        </div>
      )}

      {summary && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Resumo do material
          </div>
          <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed bg-secondary/40 rounded-lg p-2.5">
            {summary}
          </pre>
        </div>
      )}

      {preenchidos.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Seções pré-preenchidas
          </div>
          <div className="flex flex-wrap gap-1.5">
            {preenchidos.map((s) => (
              <span
                key={s}
                className="text-[11px] px-2 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="pt-1 flex flex-col sm:flex-row gap-2">
        <Button onClick={onConfirm} className="flex-1 rounded-xl h-10 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Está certo, prosseguir para as lacunas
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Quer ajustar algo antes? Descreva no campo de mensagem abaixo (ex.: "remover serviço X", "público-alvo correto é Y"). Suas notas serão registradas.
      </p>
    </div>
  );
};
