import { useEffect, useRef, useState } from "react";
import { Bot, Send, X, Sparkles, CheckCircle2, AlertCircle, FileText, RefreshCw, Save, Globe, Upload, Loader2, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { chamarImplantadorAi, type ImplantadorChatHistoryItem } from "@/lib/implantadorAi";
import { chamarPrefill, extractTextFromFile, type PrefillDoc } from "@/lib/prefill";

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
  { texto: "Para começarmos, qual é o nome da sua empresa e em qual segmento ela atua?", etapaIdx: 0, campo: "Empresa" },
  { texto: "Há quanto tempo sua empresa está no mercado e qual região você atende?", etapaIdx: 0, campo: "Empresa" },
  { texto: "Quem é o principal público que sua empresa atende hoje?", etapaIdx: 0, campo: "Público-Alvo", lacunaSe: curta, lacunaMsg: "Não definiu público-alvo com clareza" },
  { texto: "Quais são os principais produtos ou serviços que sua empresa oferece?", etapaIdx: 1, campo: "Produtos" },
  { texto: "Existe algum produto ou serviço que você considera o mais importante ou mais vendido?", etapaIdx: 1, campo: "Produtos" },
  { texto: "Qual é o ticket médio aproximado dos seus clientes?", etapaIdx: 1, campo: "Serviços" },
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

const ENDPOINT = "https://admin.atendenteai.com.br/receberpromptia.html";

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
) {
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origem: "pagina_implantacao_atendenteai",
        agente: "Arquiteto de Conhecimento IA",
        funcao: "Consultor de Implantação de IA",
        modo: promptId ? "atualizacao" : "criacao",
        prompt_id: promptId ?? null,
        etapa_atual: etapaAtual,
        numero_etapa: numeroEtapa,
        total_etapas: totalEtapas,
        progresso_percentual: progressoPercentual,
        pergunta,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error("Erro ao enviar pergunta para o servidor:", error);
  }
}

type LoadResult =
  | { status: "ok"; base: Record<string, string[]>; lacunas: string[]; raw?: unknown }
  | { status: "cors"; detail: string }
  | { status: "notfound" }
  | { status: "http"; code: number }
  | { status: "parse"; detail: string };

async function carregarBaseExistente(id: string): Promise<LoadResult> {
  let resp: Response;
  try {
    resp = await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    // fetch() lançando TypeError geralmente indica bloqueio de CORS,
    // falha de rede, DNS, ou o servidor não respondeu com cabeçalho
    // Access-Control-Allow-Origin para a origem atual.
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Falha de rede/CORS ao carregar base existente:", e);
    return { status: "cors", detail };
  }

  if (resp.status === 404) return { status: "notfound" };
  if (!resp.ok) return { status: "http", code: resp.status };

  try {
    const ct = resp.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const data = await resp.json();
      const base =
        (data?.base as Record<string, string[]>) ??
        (data?.knowledge_base as Record<string, string[]>) ??
        (typeof data === "object" && data !== null ? (data as Record<string, string[]>) : {});
      const lacunas: string[] = Array.isArray(data?.lacunas) ? data.lacunas : [];
      const normalized: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(base)) {
        if (Array.isArray(v)) normalized[k] = v.map(String);
        else if (typeof v === "string") normalized[k] = [v];
      }
      return { status: "ok", base: normalized, lacunas, raw: data };
    }
    const txt = await resp.text();
    return { status: "ok", base: { Empresa: [txt] }, lacunas: [] };
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
) {
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origem: "pagina_implantacao_atendenteai",
        agente: "Arquiteto de Conhecimento IA",
        modo: "atualizacao_finalizada",
        prompt_id: promptId,
        base,
        lacunas,
        notas_de_ajuste: notasAjuste,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error("Erro ao enviar base atualizada:", e);
  }
}

async function enviarBaseFinalCriacao(
  conversationId: string,
  base: Record<string, string[]>,
  lacunas: string[],
  notasAjuste: string[],
  origemPrefill: { url?: string; sources: string[]; summary: string },
) {
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origem: "pagina_implantacao_atendenteai",
        agente: "Arquiteto de Conhecimento IA",
        modo: "criacao_finalizada",
        conversation_id: conversationId,
        base,
        lacunas,
        notas_de_ajuste: notasAjuste,
        prefill: origemPrefill,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error("Erro ao enviar base final (criação):", e);
  }
}

// ---------- Persistência local (sobrevive a fechar a página) ----------
const STORAGE_KEY = "diagnostico_chat_state_v1";

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

function carregarEstadoSalvo(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function salvarEstado(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / privacidade */
  }
}

function limparEstadoSalvo() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

const CAMPOS_BASE = [
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

export const DiagnosticoChat = ({ open, onClose, promptId }: Props) => {
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const conversationIdRef = useRef<string>(gerarConversationId());
  const historyRef = useRef<ImplantadorChatHistoryItem[]>([]);
  const enviadoFinalRef = useRef<boolean>(false);


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

  const etapaIdxAtual = Math.min(step, TOTAL - 1);
  const etapaAtual = modoAtualizacao
    ? "Atualização da Base de Conhecimento"
    : ETAPAS[PERGUNTAS[etapaIdxAtual]?.etapaIdx ?? 0];
  const numeroEtapa = modoAtualizacao ? ETAPAS.length : (PERGUNTAS[etapaIdxAtual]?.etapaIdx ?? 0) + 1;
  const progresso = modoAtualizacao ? 100 : Math.round((step / TOTAL) * 100);

  const completude = Math.round(
    (CAMPOS_BASE.filter((c) => (base[c]?.length ?? 0) > 0).length / CAMPOS_BASE.length) * 100,
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
          text: `Olá novamente! Localizei o identificador da sua Base de Conhecimento (ID: ${promptId}). Vou carregar as informações já cadastradas para revisarmos juntos.`,
        },
      ]);
    } else {
      setMessages((m) => [
        ...m,
        { role: "system", tone: "info", text: "Tentando carregar novamente a base existente..." },
      ]);
    }

    const resultado = await carregarBaseExistente(promptId);
    setCarregandoBase(false);
    setTyping(false);

    if (resultado.status === "ok") {
      setBase(resultado.base);
      setLacunas(resultado.lacunas);
      setShowBase(true);
      setMessages((m) => [
        ...m,
        { role: "system", tone: "save", text: "Base de Conhecimento carregada com sucesso." },
        {
          role: "agent",
          text:
            'Revise abaixo o que já está cadastrado. Me diga, em mensagens, o que deseja atualizar (ex.: "Atualizar política de reembolso para 7 dias" ou "Adicionar novo diferencial: atendimento 24h"). Quando terminar, clique em "Concluir atualização" e eu envio tudo de volta.',
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

    // MODO CRIAÇÃO: tenta restaurar progresso salvo no navegador.
    const salvo = carregarEstadoSalvo();
    if (salvo && (salvo.messages.length > 0 || Object.keys(salvo.base ?? {}).length > 0)) {
      conversationIdRef.current = salvo.conversationId || conversationIdRef.current;
      historyRef.current = Array.isArray(salvo.history) ? salvo.history : [];
      enviadoFinalRef.current = !!salvo.enviadoFinal;
      setMessages(salvo.messages);
      setBase(salvo.base ?? {});
      setLacunas(salvo.lacunas ?? []);
      setStep(salvo.step ?? 0);
      setFinalizado(!!salvo.finalizado);
      setShowBase(!!salvo.showBase);
      setNotasAjuste(salvo.notasAjuste ?? []);
      setForcarCriacao(!!salvo.forcarCriacao);
      setPrefillStage(salvo.prefillStage ?? "done");
      setPrefillUrl(salvo.prefillUrl ?? "");
      setPrefillSummary(salvo.prefillSummary ?? "");
      setPrefillSources(salvo.prefillSources ?? []);
      setPrefillFiles([]);
      setPrefillError(null);
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "info",
          text: "Recuperei sua conversa de onde você parou. Continue de onde estava ou clique em 'Recomeçar' no topo.",
        },
      ]);
      return;
    }

    // Sem progresso salvo — abre limpo.
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

  // Persiste estado da conversa (modo criação) a cada mudança relevante.
  useEffect(() => {
    if (!open) return;
    if (idValido && !forcarCriacao) return; // modo atualização não persiste localmente
    if (messages.length === 0 && Object.keys(base).length === 0) return;
    salvarEstado({
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
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setNotasAjuste((n) => [...n, text]);
    // Heurística simples: se mencionar nome de uma seção conhecida, anexa lá também.
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
          text: secao ? `Ajuste registrado em: ${secao}.` : "Ajuste registrado nas notas de atualização.",
        },
      ]);
    }, 350);
    void pedirComentarioIA(text, {
      tipo: "ajuste_em_atualizacao",
      secao_detectada: secao ?? null,
    });
  };

  const handleConcluirUpdate = async () => {
    if (!promptId) return;
    setEnviandoUpdate(true);
    await enviarBaseAtualizada(promptId, base, lacunas, notasAjuste);
    setEnviandoUpdate(false);
    setFinalizado(true);
    setMessages((m) => [
      ...m,
      {
        role: "agent",
        text:
          "Pronto! As alterações foram enviadas para o servidor com o seu identificador. Sua Base de Conhecimento foi atualizada com sucesso.",
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

    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setBase((b) => ({ ...b, [pAtual.campo]: [...(b[pAtual.campo] ?? []), text] }));

    const temLacuna = pAtual.lacunaSe?.(text);
    if (temLacuna && pAtual.lacunaMsg) {
      setLacunas((l) => (l.includes(pAtual.lacunaMsg!) ? l : [...l, pAtual.lacunaMsg!]));
    }

    setTimeout(() => {
      setMessages((m) => [
        ...m,
        { role: "system", tone: "save", text: `Resposta salva em: ${pAtual.campo}.` },
      ]);

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
        }, 900);
      } else {
        setTimeout(() => fazerPergunta(proxIdx), temLacuna ? 1400 : 700);
      }
    }, 500);
  };

  if (!open) return null;

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
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
                {modoAtualizacao ? `ID: ${promptId}` : "Consultor de Implantação · online"}
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition" aria-label="Fechar">
              <X className="w-4 h-4" />
            </button>
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

            {showBase && <BasePreview base={base} lacunas={lacunas} />}
          </div>

          <div className="p-3 border-t border-border bg-card space-y-2">
            <div className="flex items-end gap-2">
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
                disabled={finalizado || carregandoBase || prefillStage === "processing" || prefillStage === "form"}
                className="flex-1 px-4 py-3 bg-secondary rounded-2xl text-sm outline-none focus:ring-2 focus:ring-primary/30 transition disabled:opacity-60"
              />
              <Button onClick={handleSend} disabled={finalizado || carregandoBase || prefillStage === "processing" || prefillStage === "form"} size="icon" className="rounded-2xl h-12 w-12 shrink-0">
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
