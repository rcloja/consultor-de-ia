import { useEffect, useRef, useState } from "react";
import { Bot, Send, X, Sparkles, CheckCircle2, AlertCircle, FileText } from "lucide-react";
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
  campo: string; // chave para a base
  lacunaSe?: (resp: string) => boolean; // detecta lacuna
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
  // Etapa 1
  { texto: "Para começarmos, qual é o nome da sua empresa e em qual segmento ela atua?", etapaIdx: 0, campo: "Empresa" },
  { texto: "Há quanto tempo sua empresa está no mercado e qual região você atende?", etapaIdx: 0, campo: "Empresa" },
  { texto: "Quem é o principal público que sua empresa atende hoje?", etapaIdx: 0, campo: "Público-Alvo", lacunaSe: curta, lacunaMsg: "Não definiu público-alvo com clareza" },
  // Etapa 2
  { texto: "Quais são os principais produtos ou serviços que sua empresa oferece?", etapaIdx: 1, campo: "Produtos" },
  { texto: "Existe algum produto ou serviço que você considera o mais importante ou mais vendido?", etapaIdx: 1, campo: "Produtos" },
  { texto: "Qual é o ticket médio aproximado dos seus clientes?", etapaIdx: 1, campo: "Serviços" },
  // Etapa 3
  { texto: "Como os clientes normalmente chegam até sua empresa?", etapaIdx: 2, campo: "Processo Comercial" },
  { texto: "Como acontece o atendimento desde o primeiro contato até a venda?", etapaIdx: 2, campo: "Processo Comercial" },
  { texto: "Depois que o cliente compra, existe algum processo de acompanhamento ou pós-venda?", etapaIdx: 2, campo: "Processo Comercial", lacunaSe: curta, lacunaMsg: "Processo de pós-venda precisa de mais detalhes" },
  // Etapa 4
  { texto: "Quais são as perguntas que os clientes mais fazem antes de comprar?", etapaIdx: 3, campo: "FAQ" },
  { texto: "Para cada uma dessas perguntas, qual seria a resposta ideal que sua empresa gostaria que a IA desse?", etapaIdx: 3, campo: "FAQ" },
  // Etapa 5
  { texto: "O que normalmente impede um cliente de fechar negócio com sua empresa?", etapaIdx: 4, campo: "Objeções", lacunaSe: curta, lacunaMsg: "Objeções comerciais incompletas" },
  { texto: "Quando o cliente apresenta essa objeção, qual costuma ser a melhor resposta para convencê-lo com segurança?", etapaIdx: 4, campo: "Objeções" },
  // Etapa 6
  { texto: "Por que o cliente deveria escolher sua empresa e não um concorrente?", etapaIdx: 5, campo: "Diferenciais" },
  { texto: "Quais provas, resultados, garantias ou experiências reforçam esses diferenciais?", etapaIdx: 5, campo: "Diferenciais" },
  // Etapa 7
  { texto: "Como funciona seu processo desde o primeiro contato até a entrega do serviço ou produto?", etapaIdx: 6, campo: "Fluxo de Atendimento" },
  { texto: "Existe alguma etapa que sempre precisa de aprovação humana antes da IA responder ou avançar?", etapaIdx: 6, campo: "Regras do Agente" },
  // Etapa 8
  { texto: "Quais são as regras da sua empresa sobre garantia, troca, cancelamento, reembolso e prazos?", etapaIdx: 7, campo: "Políticas", lacunaSe: curta, lacunaMsg: "Política de reembolso/garantia ainda não definida" },
  { texto: "Existe alguma situação em que a IA nunca deve prometer algo ao cliente?", etapaIdx: 7, campo: "Regras do Agente" },
  // Etapa 9
  { texto: "Pode me contar alguns exemplos de clientes que tiveram bons resultados com sua empresa?", etapaIdx: 8, campo: "Casos de Sucesso" },
  { texto: "Quais termos técnicos, expressões, gírias ou palavras do seu segmento a IA precisa conhecer?", etapaIdx: 8, campo: "Termos do Segmento" },
  { texto: "Como você gostaria que a IA falasse com seus clientes: mais formal, mais próxima, mais consultiva ou mais objetiva?", etapaIdx: 8, campo: "Regras do Agente" },
  // Etapa 10
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
}

// NOTA: Caso o servidor bloqueie por CORS, será necessário liberar CORS no
// endpoint ou criar um proxy/backend intermediário. Usamos no-cors como fallback.
async function enviarPerguntaParaServidor(
  pergunta: string,
  etapaAtual: string,
  numeroEtapa: number,
  totalEtapas: number,
  progressoPercentual: number,
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

export const DiagnosticoChat = ({ open, onClose }: Props) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState(0); // próximo índice de pergunta a fazer
  const [typing, setTyping] = useState(false);
  const [base, setBase] = useState<Record<string, string[]>>({});
  const [lacunas, setLacunas] = useState<string[]>([]);
  const [finalizado, setFinalizado] = useState(false);
  const [showBase, setShowBase] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const etapaIdxAtual = Math.min(step, TOTAL - 1);
  const etapaAtual = ETAPAS[PERGUNTAS[etapaIdxAtual]?.etapaIdx ?? 0];
  const numeroEtapa = (PERGUNTAS[etapaIdxAtual]?.etapaIdx ?? 0) + 1;
  const progresso = Math.round((step / TOTAL) * 100);

  // completude: campos preenchidos / total campos esperados
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
      enviarPerguntaParaServidor(p.texto, etapaNome, num, ETAPAS.length, prog);
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
    setTyping(true);
    const t = setTimeout(() => {
      setMessages([{ role: "agent", text: OPENING }]);
      setTyping(false);
      setTimeout(() => fazerPergunta(0), 600);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || finalizado) return;
    const pAtual = PERGUNTAS[step];
    if (!pAtual) return;

    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");

    // salva na base
    setBase((b) => ({ ...b, [pAtual.campo]: [...(b[pAtual.campo] ?? []), text] }));

    // detecta lacuna
    const temLacuna = pAtual.lacunaSe?.(text);
    if (temLacuna && pAtual.lacunaMsg) {
      setLacunas((l) => (l.includes(pAtual.lacunaMsg!) ? l : [...l, pAtual.lacunaMsg!]));
    }

    // feedback de salvamento
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "system",
          tone: "save",
          text: `Resposta salva em: ${pAtual.campo}.`,
        },
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
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-border bg-gradient-to-r from-primary/5 to-accent/5">
            <div className="w-10 h-10 rounded-2xl gradient-hero flex items-center justify-center shadow-glow">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-sm">Arquiteto de Conhecimento IA</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
                Consultor de Implantação · online
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary transition" aria-label="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="px-4 pt-3 pb-2 border-b border-border bg-card">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-foreground">
                Etapa {numeroEtapa} de {ETAPAS.length} — {etapaAtual}
              </span>
              <span className="text-muted-foreground font-medium">{progresso}%</span>
            </div>
            <Progress value={progresso} className="h-2" />
          </div>

          {/* Messages */}
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
            {typing && (
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

          {/* Input */}
          <div className="p-3 border-t border-border bg-card">
            <div className="flex items-end gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={finalizado ? "Diagnóstico concluído" : "Escreva sua resposta..."}
                disabled={finalizado}
                className="flex-1 px-4 py-3 bg-secondary rounded-2xl text-sm outline-none focus:ring-2 focus:ring-primary/30 transition disabled:opacity-60"
              />
              <Button onClick={handleSend} disabled={finalizado} size="icon" className="rounded-2xl h-12 w-12 shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 px-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Cada pergunta é registrada para construir sua Base de Conhecimento
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
          </div>

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

          {lacunas.length > 0 && (
            <div className="p-5 border-b border-border">
              <div className="text-xs uppercase tracking-wider text-destructive font-semibold mb-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Informações pendentes
              </div>
              <ul className="space-y-1.5">
                {lacunas.map((l) => (
                  <li key={l} className="text-xs text-muted-foreground leading-snug">
                    • {l}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-5 mt-auto">
            <div className="text-[11px] text-muted-foreground flex items-start gap-2">
              <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Suas respostas são organizadas em tempo real em uma Base de Conhecimento estruturada.</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

// ===== Preview da Base ao final =====
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
        <div className="text-xs text-muted-foreground">Estrutura inicial gerada a partir do diagnóstico</div>
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
        <p className="text-xs text-muted-foreground">Nenhuma lacuna crítica identificada nesta primeira rodada.</p>
      ) : (
        <ul className="space-y-1">
          {lacunas.map((l) => (
            <li key={l} className="text-xs text-muted-foreground">
              • {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);
