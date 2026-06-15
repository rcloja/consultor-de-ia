import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Sparkles, Check, Trash2, AlertCircle, RefreshCw, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Sugestao {
  id: string;
  tipo: "FAQ" | "PROMPT" | "TOM" | "FLUXO" | "OUTRO";
  titulo: string | null;
  conteudo: string;
  status: "pendente" | "aprovada" | "rejeitada";
  origem: string | null;
  created_at: string;
}

interface Props {
  empresaId: string;
  open: boolean;
  onClose: () => void;
}

// Mapeia tipo da sugestão para categoria do RAG ao aprovar
const MAP_CATEGORIA: Record<Sugestao["tipo"], string> = {
  FAQ: "faq",
  PROMPT: "atendimento",
  TOM: "tom_de_voz",
  FLUXO: "atendimento",
  OUTRO: "exemplos",
};

export function DiagnosticoSugestoesModal({ empresaId, open, onClose }: Props) {
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try {
      const { data, error } = await supabase
        .from("sugestoes_base_conhecimento")
        .select("id, tipo, titulo, conteudo, status, origem, created_at")
        .eq("empresa_id", empresaId)
        .eq("status", "pendente")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setSugestoes((data ?? []) as Sugestao[]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { if (open) { setAviso(null); carregar(); } }, [open, empresaId]);

  const gerar = async () => {
    setGerando(true); setErro(null); setAviso(null);
    try {
      const { data, error } = await supabase.functions.invoke("diagnostico-conversas", {
        body: { empresa_id: empresaId, limite: 50 },
      });
      if (error) throw error;
      if (data?.aviso) setAviso(data.aviso);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no diagnóstico");
    } finally {
      setGerando(false);
    }
  };

  const aprovar = async (s: Sugestao) => {
    setBusyId(s.id); setErro(null);
    try {
      const categoria = MAP_CATEGORIA[s.tipo];
      const titulo = s.titulo || s.tipo;
      const { error: rsErr } = await supabase.functions.invoke("rag-save", {
        body: {
          empresa_id: empresaId,
          chunks: [{ categoria, titulo, conteudo: s.conteudo }],
          substituir: false,
        },
      });
      if (rsErr) throw rsErr;
      const { error: upErr } = await supabase
        .from("sugestoes_base_conhecimento")
        .update({ status: "aprovada", aprovado_em: new Date().toISOString() })
        .eq("id", s.id);
      if (upErr) throw upErr;
      setSugestoes((arr) => arr.filter((x) => x.id !== s.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao aprovar");
    } finally {
      setBusyId(null);
    }
  };

  const rejeitar = async (s: Sugestao) => {
    setBusyId(s.id); setErro(null);
    try {
      const { error } = await supabase
        .from("sugestoes_base_conhecimento")
        .update({ status: "rejeitada" })
        .eq("id", s.id);
      if (error) throw error;
      setSugestoes((arr) => arr.filter((x) => x.id !== s.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao rejeitar");
    } finally {
      setBusyId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card text-card-foreground border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Diagnóstico inteligente</h2>
              <p className="text-xs text-muted-foreground">
                Sugestões geradas a partir das conversas reais. Aprovar adiciona à memória vetorial.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </header>

        <div className="px-6 py-3 border-b border-border flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {sugestoes.length} sugestão(ões) pendente(s).
          </p>
          <Button size="sm" onClick={gerar} disabled={gerando}>
            {gerando ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
            Analisar conversas
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {erro && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5" /><span>{erro}</span>
            </div>
          )}
          {aviso && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-700 border border-amber-500/30 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5" /><span>{aviso}</span>
            </div>
          )}

          {carregando && (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}

          {!carregando && sugestoes.length === 0 && !erro && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Nenhuma sugestão pendente.</p>
              <p className="text-xs mt-1">Clique em "Analisar conversas" para gerar.</p>
            </div>
          )}

          {sugestoes.map((s) => (
            <div key={s.id} className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">{s.tipo}</Badge>
                <span className="text-sm font-medium flex-1">{s.titulo || "(sem título)"}</span>
                {s.origem && <Badge variant="secondary" className="text-[10px]">{s.origem}</Badge>}
              </div>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">{s.conteudo}</p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-muted-foreground">
                  vai virar chunk em: <code>{MAP_CATEGORIA[s.tipo]}</code>
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    onClick={() => rejeitar(s)}
                    disabled={busyId === s.id}
                  >
                    {busyId === s.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
                    Ignorar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => aprovar(s)}
                    disabled={busyId === s.id}
                  >
                    {busyId === s.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                    Aprovar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
