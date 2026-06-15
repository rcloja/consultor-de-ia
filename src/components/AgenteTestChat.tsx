import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Loader2, Send, Sparkles, User, X, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Msg {
  role: "user" | "assistant";
  content: string;
  fontes?: Array<{ categoria: string; titulo: string; similarity: number }>;
  auditor?: { ok: boolean; refeita: boolean; problemas: string[] };
}

interface Props {
  empresaId: string;
  open: boolean;
  onClose: () => void;
}

export function AgenteTestChat({ empresaId, open, onClose }: Props) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Olá! Sou o agente treinado com a sua base. Me faça uma pergunta como se fosse um cliente 🙂" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);
  useEffect(() => { if (open) setTimeout(() => taRef.current?.focus(), 50); }, [open]);

  const enviar = async () => {
    const texto = input.trim();
    if (!texto || sending) return;
    setErro(null);
    const novas: Msg[] = [...messages, { role: "user", content: texto }];
    setMessages(novas);
    setInput("");
    setSending(true);
    try {
      const clienteIdKey = `agente_cliente_${empresaId}`;
      let clienteId = localStorage.getItem(clienteIdKey);
      if (!clienteId) {
        clienteId = `c_${crypto.randomUUID().slice(0, 8)}`;
        localStorage.setItem(clienteIdKey, clienteId);
      }
      const { data, error } = await supabase.functions.invoke("agente-chat", {
        body: {
          empresa_id: empresaId,
          cliente_id: clienteId,
          messages: novas.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data?.resposta || "(sem resposta)",
          fontes: data?.fontes ?? [],
          auditor: data?.auditor,
        },
      ]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao consultar o agente");
    } finally {
      setSending(false);
      setTimeout(() => taRef.current?.focus(), 50);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card text-card-foreground border border-border rounded-2xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col">
        <header className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold">Testar agente (RAG)</h2>
              <p className="text-[11px] text-muted-foreground">
                Usa o prompt principal + memória vetorial desta implantação.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
              )}
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap
                ${m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm"}`}>
                {m.content}
                {m.role === "assistant" && (m.fontes?.length || m.auditor) && (
                  <div className="mt-2 flex flex-wrap gap-1 items-center">
                    {m.auditor?.refeita && (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        auditor · refeita
                      </Badge>
                    )}
                    {m.auditor && !m.auditor.ok && (
                      <Badge variant="destructive" className="text-[10px] font-normal" title={m.auditor.problemas.join(" • ")}>
                        auditor · {m.auditor.problemas.length} alerta(s)
                      </Badge>
                    )}
                    {m.fontes?.slice(0, 5).map((f, j) => (
                      <Badge key={j} variant="outline" className="text-[10px] font-normal">
                        {f.categoria} · {f.titulo.slice(0, 28)} · {(f.similarity * 100).toFixed(0)}%
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {m.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex gap-2 justify-start">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-sm flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> pensando…
              </div>
            </div>
          )}
          {erro && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 text-xs">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5" /><span>{erro}</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <footer className="p-3 border-t border-border flex gap-2">
          <Textarea
            ref={taRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
            }}
            placeholder="Pergunte algo como um cliente faria…"
            className="resize-none text-sm"
            disabled={sending}
          />
          <Button onClick={enviar} disabled={sending || !input.trim()} className="self-end">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </footer>
      </div>
    </div>
  );
}
