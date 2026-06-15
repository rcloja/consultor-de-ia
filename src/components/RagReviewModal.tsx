import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, X, Sparkles, Trash2, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type RagCategoria =
  | "empresa" | "produtos" | "servicos" | "faq" | "objecoes" | "vendas"
  | "politicas" | "atendimento" | "casos_de_uso" | "tom_de_voz"
  | "restricoes" | "exemplos";

export interface RagChunk {
  categoria: RagCategoria;
  titulo: string;
  conteudo: string;
  origem?: "base" | "ia";
}

interface Props {
  empresaId: string;
  promptPrincipal: string;
  base: Record<string, string[]>;
  open: boolean;
  onClose: () => void;
  onSaved?: (n: number) => void;
}

const ROTULOS: Record<RagCategoria, string> = {
  empresa: "Empresa",
  produtos: "Produtos",
  servicos: "Serviços",
  faq: "FAQ",
  objecoes: "Objeções",
  vendas: "Comercial",
  politicas: "Políticas",
  atendimento: "Atendimento",
  casos_de_uso: "Casos de uso",
  tom_de_voz: "Tom de voz",
  restricoes: "Restrições",
  exemplos: "Exemplos",
};

const ORDEM: RagCategoria[] = [
  "empresa", "produtos", "servicos", "tom_de_voz",
  "politicas", "restricoes", "atendimento",
  "faq", "objecoes", "casos_de_uso", "vendas", "exemplos",
];

export function RagReviewModal({ empresaId, promptPrincipal, base, open, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [chunks, setChunks] = useState<RagChunk[]>([]);
  const [promptId, setPromptId] = useState<string | null>(null);
  const [iaErro, setIaErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErro(null); setOkMsg(null); setChunks([]); setIaErro(null);
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("rag-generate", {
          body: {
            empresa_id: empresaId,
            titulo_prompt: `Prompt principal - ${empresaId.slice(0, 8)}`,
            prompt_principal: promptPrincipal,
            base,
          },
        });
        if (error) throw error;
        setPromptId(data?.prompt_id ?? null);
        setChunks((data?.chunks_propostos ?? []) as RagChunk[]);
        setIaErro(data?.geracao_ia_erro ?? null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao gerar RAGs");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, empresaId, promptPrincipal, base]);

  const grupos = useMemo(() => {
    const g: Record<RagCategoria, RagChunk[]> = {} as Record<RagCategoria, RagChunk[]>;
    for (const cat of ORDEM) g[cat] = [];
    for (const c of chunks) {
      if (!g[c.categoria]) g[c.categoria] = [];
      g[c.categoria].push(c);
    }
    return g;
  }, [chunks]);

  const atualizar = (idx: number, patch: Partial<RagChunk>) =>
    setChunks((arr) => arr.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const remover = (idx: number) =>
    setChunks((arr) => arr.filter((_, i) => i !== idx));
  const adicionar = (categoria: RagCategoria) =>
    setChunks((arr) => [...arr, { categoria, titulo: "Novo item", conteudo: "", origem: "base" }]);

  const salvar = async () => {
    setSaving(true); setErro(null); setOkMsg(null);
    try {
      const validos = chunks.filter((c) => c.conteudo.trim().length >= 40);
      if (validos.length === 0) throw new Error("Nenhum chunk com conteúdo suficiente (mínimo 40 caracteres).");
      const { data, error } = await supabase.functions.invoke("rag-save", {
        body: { empresa_id: empresaId, chunks: validos, substituir: true },
      });
      if (error) throw error;
      const n = data?.salvos ?? validos.length;
      setOkMsg(`Memória vetorial salva com sucesso (${n} blocos).`);
      onSaved?.(n);
      setTimeout(() => onClose(), 1200);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card text-card-foreground border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Revisar Memória do Agente</h2>
              <p className="text-xs text-muted-foreground">
                Cada bloco vira memória vetorial pesquisável. Edite, remova ou aprove.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={saving}><X className="w-4 h-4" /></Button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p>Gerando blocos de conhecimento e RAGs com IA…</p>
            </div>
          )}

          {erro && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/30">
              <AlertCircle className="w-4 h-4 mt-0.5" /><span className="text-sm">{erro}</span>
            </div>
          )}
          {okMsg && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
              <CheckCircle2 className="w-4 h-4 mt-0.5" /><span className="text-sm">{okMsg}</span>
            </div>
          )}
          {iaErro && !loading && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-700 border border-amber-500/30 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <span>As RAGs geradas por IA falharam ({iaErro}). Você ainda pode revisar e salvar os blocos extraídos da base.</span>
            </div>
          )}

          {!loading && ORDEM.map((cat) => {
            const itens = grupos[cat] ?? [];
            return (
              <section key={cat} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{ROTULOS[cat]}</h3>
                    <Badge variant="secondary" className="text-xs">{itens.length}</Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => adicionar(cat)} disabled={saving}>
                    <Plus className="w-3 h-3 mr-1" /> Adicionar
                  </Button>
                </div>
                {itens.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Nenhum bloco nesta categoria.</p>
                )}
                {itens.map((c) => {
                  const idx = chunks.indexOf(c);
                  return (
                    <div key={idx} className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
                      <div className="flex items-center gap-2">
                        <input
                          className="flex-1 bg-transparent text-sm font-medium border-b border-border/50 focus:border-primary outline-none px-1 py-0.5"
                          value={c.titulo}
                          onChange={(e) => atualizar(idx, { titulo: e.target.value })}
                          disabled={saving}
                        />
                        {c.origem === "ia" && <Badge variant="outline" className="text-[10px]">IA</Badge>}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remover(idx)} disabled={saving}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <Textarea
                        rows={3}
                        value={c.conteudo}
                        onChange={(e) => atualizar(idx, { conteudo: e.target.value })}
                        disabled={saving}
                        className="text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground">{c.conteudo.length} caracteres</p>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>

        <footer className="px-6 py-4 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {chunks.length} blocos • Prompt principal {promptId ? "salvo ✓" : "pendente"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving || loading || chunks.length === 0}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar na memória
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
