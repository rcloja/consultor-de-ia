import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

type Risk = "baixo" | "medio" | "alto" | "critico";
type Decision = "liberado" | "revisao_humana" | "bloqueado";
type ReviewStatus = "pendente" | "aprovado" | "reprovado" | "ajustes_solicitados";

interface Review {
  id: string;
  tenant_id: string | null;
  agent_id: string | null;
  user_id: string | null;
  conversation_id: string | null;
  risk_level: Risk;
  detected_categories: string[];
  suspicious_excerpt: string | null;
  decision: Decision;
  review_status: ReviewStatus;
  human_reviewer_id: string | null;
  human_notes: string | null;
  justification: string | null;
  trigger_event: string | null;
  payload: unknown;
  created_at: string;
  updated_at: string;
}

const riskColor: Record<Risk, string> = {
  baixo: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  medio: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  alto: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  critico: "bg-destructive/15 text-destructive border-destructive/40",
};

const statusColor: Record<ReviewStatus, string> = {
  pendente: "bg-muted text-foreground",
  aprovado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  reprovado: "bg-destructive/15 text-destructive",
  ajustes_solicitados: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

export default function ComplianceReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [selected, setSelected] = useState<Review | null>(null);
  const [notes, setNotes] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("agent_compliance_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
      return;
    }
    setReviews((data ?? []) as Review[]);
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      if (riskFilter !== "all" && r.risk_level !== riskFilter) return false;
      if (statusFilter !== "all" && r.review_status !== statusFilter) return false;
      if (
        categoryFilter.trim() &&
        !r.detected_categories.some((c) =>
          c.toLowerCase().includes(categoryFilter.trim().toLowerCase()),
        )
      )
        return false;
      return true;
    });
  }, [reviews, riskFilter, statusFilter, categoryFilter]);

  const openReview = (r: Review) => {
    setSelected(r);
    setNotes(r.human_notes ?? "");
    setReviewer(r.human_reviewer_id ?? "");
  };

  const updateDecision = async (status: ReviewStatus) => {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase
      .from("agent_compliance_reviews")
      .update({
        review_status: status,
        human_notes: notes || null,
        human_reviewer_id: reviewer || null,
      })
      .eq("id", selected.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Revisão atualizada", description: `Status: ${status}` });
    setSelected(null);
    void load();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-primary" />
            Revisões de Compliance
          </h1>
          <p className="text-sm text-muted-foreground">
            Auditoria de implantações analisadas pela camada de detecção de temas proibidos.
          </p>
        </div>
        <Button onClick={() => void load()} variant="outline" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Atualizar"}
        </Button>
      </header>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Risco</label>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="baixo">Baixo</SelectItem>
              <SelectItem value="medio">Médio</SelectItem>
              <SelectItem value="alto">Alto</SelectItem>
              <SelectItem value="critico">Crítico</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="reprovado">Reprovado</SelectItem>
              <SelectItem value="ajustes_solicitados">Ajustes solicitados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground">Categoria contém</label>
          <input
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            placeholder="ex: piramide_mlm"
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Agente</TableHead>
              <TableHead>Risco</TableHead>
              <TableHead>Decisão</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Categorias</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhuma revisão encontrada.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-xs font-mono">
                  {r.agent_id ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={riskColor[r.risk_level]}>
                    {r.risk_level.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{r.decision}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded text-xs ${statusColor[r.review_status]}`}>
                    {r.review_status}
                  </span>
                </TableCell>
                <TableCell className="text-xs">
                  {r.detected_categories.join(", ") || "—"}
                </TableCell>
                <TableCell className="text-xs">{r.trigger_event ?? "—"}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => openReview(r)}>
                    Abrir
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldQuestion className="w-5 h-5" />
              Revisão de Compliance
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><strong>Agent ID:</strong> {selected.agent_id ?? "—"}</div>
                <div><strong>Tenant:</strong> {selected.tenant_id ?? "—"}</div>
                <div><strong>Conversa:</strong> {selected.conversation_id ?? "—"}</div>
                <div><strong>Evento:</strong> {selected.trigger_event ?? "—"}</div>
                <div>
                  <strong>Risco:</strong>{" "}
                  <Badge variant="outline" className={riskColor[selected.risk_level]}>
                    {selected.risk_level.toUpperCase()}
                  </Badge>
                </div>
                <div><strong>Decisão automática:</strong> {selected.decision}</div>
              </div>

              <div>
                <strong>Categorias detectadas:</strong>{" "}
                {selected.detected_categories.length === 0
                  ? "—"
                  : selected.detected_categories.join(", ")}
              </div>

              <div>
                <strong>Justificativa:</strong>
                <p className="mt-1 p-2 bg-muted rounded">{selected.justification || "—"}</p>
              </div>

              {selected.suspicious_excerpt && (
                <div>
                  <strong>Trecho suspeito:</strong>
                  <pre className="mt-1 p-2 bg-muted rounded whitespace-pre-wrap text-xs">
                    {selected.suspicious_excerpt}
                  </pre>
                </div>
              )}

              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Ver payload analisado
                </summary>
                <pre className="mt-1 p-2 bg-muted rounded whitespace-pre-wrap text-xs max-h-64 overflow-auto">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </details>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Revisor (identificação)</label>
                <input
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                  placeholder="seu nome ou e-mail"
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                />
                <label className="text-xs text-muted-foreground">Notas da revisão</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Justifique a decisão..."
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => void updateDecision("reprovado")}
            >
              Reprovar
            </Button>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => void updateDecision("ajustes_solicitados")}
            >
              Solicitar ajustes
            </Button>
            <Button
              disabled={saving}
              onClick={() => void updateDecision("aprovado")}
              className="gap-1"
            >
              <ShieldCheck className="w-4 h-4" /> Aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
