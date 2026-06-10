import { useEffect, useRef, useState } from "react";
import { Bot, Send, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Message {
  role: "agent" | "user";
  text: string;
}

const OPENING =
  "Olá! Vou ajudá-lo a transformar o conhecimento do seu negócio em uma base estruturada para que sua Inteligência Artificial consiga atender clientes de forma eficiente e segura. Farei algumas perguntas e, conforme avançarmos, organizarei todas as informações em uma base de conhecimento pronta para treinamento do agente.";

const SCRIPT: string[] = [
  "Para começarmos, qual é o nome da empresa, o segmento de atuação e o principal produto ou serviço oferecido?",
  "Perfeito. Agora me conte: como os clientes geralmente chegam até você hoje? (indicação, redes sociais, anúncios, busca no Google, etc.)",
  "Ótimo. Quais são as 3 dúvidas mais frequentes que os clientes fazem antes de fechar com vocês?",
  "Entendido. E quais costumam ser as principais objeções ou motivos que impedem o fechamento?",
  "Excelente. Por fim, o que diferencia a sua empresa dos concorrentes — algo que só vocês entregam?",
];

const CLOSING =
  "Perfeito. Já consigo estruturar uma primeira versão da Base de Conhecimento da sua empresa. Em uma implantação real, eu continuaria aprofundando processos internos, políticas, casos reais e linguagem do segmento. Deseja receber o resultado completo por e-mail?";

interface Props {
  open: boolean;
  onClose: () => void;
}

const ENDPOINT = "https://admin.atendenteai.com.br/receberpromptia.html";

const buildPrompt = (answers: string[]) => {
  const labels = [
    "Empresa / Segmento / Produto ou Serviço",
    "Como os clientes chegam até a empresa",
    "3 dúvidas mais frequentes antes do fechamento",
    "Principais objeções / motivos de não fechamento",
    "Diferenciais da empresa frente aos concorrentes",
  ];
  const linhas = answers.map((a, i) => `${i + 1}. ${labels[i] ?? `Resposta ${i + 1}`}:\n${a}`);
  return [
    "BASE DE CONHECIMENTO - ATENDENTEAI",
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    "",
    "Respostas coletadas pelo Arquiteto de Conhecimento IA:",
    "",
    ...linhas,
  ].join("\n\n");
};

const enviarPrompt = async (texto: string) => {
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: texto,
    });
  } catch (e) {
    console.error("Falha ao enviar prompt:", e);
  }
};

export const DiagnosticoChat = ({ open, onClose }: Props) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setStep(0);
    setAnswers([]);
    setSent(false);
    setTyping(true);
    const t1 = setTimeout(() => {
      setMessages([{ role: "agent", text: OPENING }]);
      setTyping(false);
      setTimeout(() => {
        setTyping(true);
        setTimeout(() => {
          setMessages((m) => [...m, { role: "agent", text: SCRIPT[0] }]);
          setTyping(false);
          inputRef.current?.focus();
        }, 1200);
      }, 600);
    }, 400);
    return () => clearTimeout(t1);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setTyping(true);

    const novasRespostas = [...answers, text];
    setAnswers(novasRespostas);

    setTimeout(() => {
      const nextStep = step + 1;
      const summary = `Anotado: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}". Registrei essa informação na Base de Conhecimento.`;
      const next = SCRIPT[nextStep];

      if (!next && !sent) {
        const prompt = buildPrompt(novasRespostas);
        enviarPrompt(prompt);
        setSent(true);
      }

      setMessages((m) => [
        ...m,
        { role: "agent", text: next ? `${summary} ${next}` : `${summary} ${CLOSING}` },
      ]);
      setStep(nextStep);
      setTyping(false);
      inputRef.current?.focus();
    }, 900);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm p-0 sm:p-4 animate-fade-up">
      <div className="w-full sm:max-w-lg bg-card rounded-t-3xl sm:rounded-3xl shadow-elegant border border-border flex flex-col h-[90vh] sm:h-[640px] overflow-hidden">
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

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-background to-secondary/30">
          {messages.map((m, i) => (
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
          ))}
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
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border bg-card">
          <div className="flex items-end gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Escreva sua resposta..."
              className="flex-1 px-4 py-3 bg-secondary rounded-2xl text-sm outline-none focus:ring-2 focus:ring-primary/30 transition"
            />
            <Button onClick={handleSend} size="icon" className="rounded-2xl h-12 w-12 shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 px-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Simulação consultiva — pronto para integrar com webhook
          </p>
        </div>
      </div>
    </div>
  );
};
