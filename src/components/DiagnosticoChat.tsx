import { useEffect, useRef, useState } from "react";
import { Bot, Send, X, Sparkles, CheckCircle2, AlertCircle, FileText, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface Message {
  role: "agent" | "user" | "system";
  text: string;
  tone?: "save" | "gap" | "info";
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

async function carregarBaseExistente(id: string): Promise<{
  base: Record<string, string[]>;
  lacunas: string[];
  raw?: unknown;
} | null> {
  try {
    const resp = await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const data = await resp.json();
      // Aceita estruturas variadas: { base: {...}, lacunas: [...] } ou direto um objeto de campos
      const base =
        (data?.base as Record<string, string[]>) ??
        (data?.knowledge_base as Record<string, string[]>) ??
        (typeof data === "object" && data !== null ? (data as Record<string, string[]>) : {});
      const lacunas: string[] = Array.isArray(data?.lacunas) ? data.lacunas : [];
      // garante shape de arrays de string
      const normalized: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(base)) {
        if (Array.isArray(v)) normalized[k] = v.map(String);
        else if (typeof v === "string") normalized[k] = [v];
      }
      return { base: normalized, lacunas, raw: data };
    }
    // fallback texto puro: coloca tudo em "Empresa"
    const txt = await resp.text();
    return { base: { Empresa: [txt] }, lacunas: [] };
  } catch (e) {
    console.error("Falha ao carregar base existente:", e);
    return null;
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
  const modoAtualizacao = idValido;

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const etapaIdxAtual = Math.min(step, TOTAL - 1);
  const etapaAtual = modoAtualizacao
    ? "Atualização da Base de Conhecimento"
    : ETAPAS[PERGUNTAS[etapaIdxAtual]?.etapaIdx ?? 0];
  const numeroEtapa = modoAtualizacao ? ETAPAS.length : (PERGUNTAS[etapaIdxAtual]?.etapaIdx ?? 0) + 1;
  const progresso = modoAtualizacao ? 100 : Math.round((step / TOTAL) * 100);

  const completude = Math.round(
    (CAMPOS_BASE.filter((c) => (base[c]?.length ?? 0) > 0).length / CAMPOS_BASE.length) * 100,
  );

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

  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setStep(0);
    setBase({});
    setLacunas([]);
    setFinalizado(false);
    setShowBase(false);
    setNotasAjuste([]);

    if (modoAtualizacao && promptId) {
      // MODO ATUALIZAÇÃO
      setCarregandoBase(true);
      setTyping(true);
      setMessages([
        {
          role: "agent",
          text: `Olá novamente! Localizei o identificador da sua Base de Conhecimento (ID: ${promptId}). Vou carregar as informações já cadastradas para revisarmos juntos.`,
        },
      ]);
      (async () => {
        const resultado = await carregarBaseExistente(promptId);
        setCarregandoBase(false);
        setTyping(false);
        if (!resultado) {
          setMessages((m) => [
            ...m,
            {
              role: "system",
              tone: "gap",
              text: "Não foi possível carregar a base existente (verifique o ID ou a liberação de CORS no servidor). Você pode digitar abaixo o que deseja ajustar — registrarei como notas de atualização.",
            },
          ]);
          setShowBase(true);
          return;
        }
        setBase(resultado.base);
        setLacunas(resultado.lacunas);
        setShowBase(true);
        setMessages((m) => [
          ...m,
          {
            role: "system",
            tone: "save",
            text: "Base de Conhecimento carregada com sucesso.",
          },
          {
            role: "agent",
            text:
              "Revise abaixo o que já está cadastrado. Me diga, em mensagens, o que deseja atualizar (ex.: \"Atualizar política de reembolso para 7 dias\" ou \"Adicionar novo diferencial: atendimento 24h\"). Quando terminar, clique em \"Concluir atualização\" e eu envio tudo de volta.",
          },
        ]);
        inputRef.current?.focus();
      })();
      return;
    }

    // MODO CRIAÇÃO (padrão)
    setTyping(true);
    const t = setTimeout(() => {
      setMessages([{ role: "agent", text: OPENING }]);
      setTyping(false);
      setTimeout(() => fazerPergunta(0), 600);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, promptId]);

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

      const proxIdx = step + 1;
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
                      : "Escreva sua resposta..."
                }
                disabled={finalizado || carregandoBase}
                className="flex-1 px-4 py-3 bg-secondary rounded-2xl text-sm outline-none focus:ring-2 focus:ring-primary/30 transition disabled:opacity-60"
              />
              <Button onClick={handleSend} disabled={finalizado || carregandoBase} size="icon" className="rounded-2xl h-12 w-12 shrink-0">
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
