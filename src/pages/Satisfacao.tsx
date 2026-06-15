import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { ArrowLeft, Sparkles, RefreshCw, Check, X } from "lucide-react";

type Pesquisa = {
  id: string;
  empresa_id: string | null;
  cliente_id: string | null;
  tipo_atendimento: "IA" | "HUMANO" | "HIBRIDO" | null;
  agente_utilizado: string | null;
  nome_atendente: string | null;
  nota: number | null;
  comentario: string | null;
  categoria: string | null;
  motivo_contato: string | null;
  created_at: string;
};

type Diagnostico = {
  id: string;
  csat_ia: number | null;
  csat_humano: number | null;
  csat_geral: number | null;
  nps: number | null;
  promotores: number;
  neutros: number;
  detratores: number;
  total_avaliacoes: number;
  pontos_fortes: Array<{ titulo: string; descricao: string }>;
  pontos_fracos: Array<{ titulo: string; descricao: string; frequencia?: number }>;
  sugestoes: Array<{ titulo: string; acao: string; tipo: string }>;
  gerado_em: string;
  periodo_inicio: string;
  periodo_fim: string;
};

type Sugestao = {
  id: string;
  tipo: "FAQ" | "PROMPT" | "TOM" | "FLUXO" | "OUTRO";
  titulo: string | null;
  conteudo: string;
  status: "pendente" | "aprovada" | "rejeitada";
  created_at: string;
};

const COLORS = ["hsl(var(--primary))", "hsl(var(--muted-foreground))", "hsl(var(--destructive))"];

function mediaArr(arr: number[]) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function formatNum(n: number | null | undefined, dec = 2) {
  if (n === null || n === undefined) return "—";
  return Number(n).toFixed(dec);
}

export default function Satisfacao() {
  const [pesquisas, setPesquisas] = useState<Pesquisa[]>([]);
  const [diagnosticos, setDiagnosticos] = useState<Diagnostico[]>([]);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [loading, setLoading] = useState(false);
  const [gerandoDiag, setGerandoDiag] = useState(false);
  const [gerandoSug, setGerandoSug] = useState(false);

  // form simular
  const [form, setForm] = useState({
    empresa_id: "",
    cliente_id: "",
    tipo_atendimento: "IA" as "IA" | "HUMANO" | "HIBRIDO",
    agente_utilizado: "",
    nome_atendente: "",
    nota: "5",
    comentario: "",
    categoria: "",
    motivo_contato: "",
  });

  async function carregar() {
    setLoading(true);
    const [p, d, s] = await Promise.all([
      supabase.from("pesquisa_satisfacao").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("diagnostico_atendimento").select("*").order("gerado_em", { ascending: false }).limit(20),
      supabase.from("sugestoes_base_conhecimento").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (p.data) setPesquisas(p.data as Pesquisa[]);
    if (d.data) setDiagnosticos(d.data as unknown as Diagnostico[]);
    if (s.data) setSugestoes(s.data as Sugestao[]);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  const respondidas = useMemo(() => pesquisas.filter((p) => p.nota !== null), [pesquisas]);

  const kpis = useMemo(() => {
    const notas = respondidas.map((r) => r.nota as number);
    const ia = respondidas.filter((r) => r.tipo_atendimento === "IA").map((r) => r.nota as number);
    const hum = respondidas.filter((r) => r.tipo_atendimento === "HUMANO").map((r) => r.nota as number);
    const prom = notas.filter((n) => n >= 4).length;
    const neu = notas.filter((n) => n === 3).length;
    const det = notas.filter((n) => n <= 2).length;
    const nps = notas.length ? ((prom - det) / notas.length) * 100 : 0;
    return {
      csat_geral: mediaArr(notas), csat_ia: mediaArr(ia), csat_humano: mediaArr(hum),
      nps, prom, neu, det, total: notas.length,
    };
  }, [respondidas]);

  const porDia = useMemo(() => {
    const map = new Map<string, number[]>();
    respondidas.forEach((r) => {
      const d = new Date(r.created_at).toISOString().slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(r.nota as number);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, notas]) => ({ data, media: Number((notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2)) }));
  }, [respondidas]);

  const porAgente = useMemo(() => {
    const map = new Map<string, number[]>();
    respondidas.forEach((r) => {
      const k = r.agente_utilizado || r.nome_atendente || "Sem identificação";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r.nota as number);
    });
    return Array.from(map.entries())
      .map(([nome, notas]) => ({ nome, media: Number((notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2)), total: notas.length }))
      .sort((a, b) => b.media - a.media)
      .slice(0, 10);
  }, [respondidas]);

  const distribuicao = [
    { name: "Promotores", value: kpis.prom },
    { name: "Neutros", value: kpis.neu },
    { name: "Detratores", value: kpis.det },
  ];

  async function simular() {
    const nota = parseInt(form.nota, 10);
    if (!nota || nota < 1 || nota > 5) {
      toast.error("Nota deve estar entre 1 e 5");
      return;
    }
    const agora = new Date();
    const { error } = await supabase.from("pesquisa_satisfacao").insert({
      empresa_id: form.empresa_id || null,
      cliente_id: form.cliente_id || null,
      tipo_atendimento: form.tipo_atendimento,
      agente_utilizado: form.agente_utilizado || null,
      nome_atendente: form.nome_atendente || null,
      nota,
      comentario: form.comentario || null,
      categoria: form.categoria || null,
      motivo_contato: form.motivo_contato || null,
      data_inicio: agora.toISOString(),
      data_fim: agora.toISOString(),
      status_envio: "respondida",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Avaliação registrada");
    setForm((f) => ({ ...f, comentario: "" }));
    carregar();
  }

  async function gerarDiagnostico() {
    setGerandoDiag(true);
    const { data, error } = await supabase.functions.invoke("diagnostico-gerar", {
      body: { periodo_dias: 30 },
    });
    setGerandoDiag(false);
    if (error) { toast.error(error.message); return; }
    if ((data as { error?: string })?.error) { toast.error((data as { error: string }).error); return; }
    toast.success("Diagnóstico gerado");
    carregar();
  }

  async function gerarSugestoes() {
    setGerandoSug(true);
    const { data, error } = await supabase.functions.invoke("sugestoes-base-gerar", {
      body: { periodo_dias: 30 },
    });
    setGerandoSug(false);
    if (error) { toast.error(error.message); return; }
    const payload = data as { error?: string; criadas?: number };
    if (payload?.error) { toast.error(payload.error); return; }
    toast.success(`${payload?.criadas ?? 0} sugestões criadas`);
    carregar();
  }

  async function alterarStatusSugestao(id: string, status: "aprovada" | "rejeitada") {
    const { error } = await supabase
      .from("sugestoes_base_conhecimento")
      .update({ status, aprovado_em: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "aprovada" ? "Sugestão aprovada" : "Sugestão rejeitada");
    carregar();
  }

  const ultimoDiag = diagnosticos[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border/60">
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 text-sm hover:text-foreground transition text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <h1 className="font-display font-bold text-lg">Satisfação dos Clientes</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        {/* KPIs */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardHeader className="pb-2"><CardDescription>CSAT Geral</CardDescription>
            <CardTitle className="text-3xl">{formatNum(kpis.csat_geral)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>CSAT IA</CardDescription>
            <CardTitle className="text-3xl">{formatNum(kpis.csat_ia)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>CSAT Humano</CardDescription>
            <CardTitle className="text-3xl">{formatNum(kpis.csat_humano)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>NPS</CardDescription>
            <CardTitle className="text-3xl">{kpis.total ? kpis.nps.toFixed(0) : "—"}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Respostas</CardDescription>
            <CardTitle className="text-3xl">{kpis.total}</CardTitle></CardHeader></Card>
        </section>

        {/* Ações IA */}
        <section className="flex flex-wrap gap-3">
          <Button onClick={gerarDiagnostico} disabled={gerandoDiag}>
            <Sparkles className="w-4 h-4 mr-2" />
            {gerandoDiag ? "Gerando…" : "Gerar diagnóstico agora"}
          </Button>
          <Button variant="secondary" onClick={gerarSugestoes} disabled={gerandoSug}>
            <Sparkles className="w-4 h-4 mr-2" />
            {gerandoSug ? "Gerando…" : "Gerar sugestões para a Base"}
          </Button>
        </section>

        <Tabs defaultValue="graficos">
          <TabsList>
            <TabsTrigger value="graficos">Gráficos</TabsTrigger>
            <TabsTrigger value="comentarios">Comentários</TabsTrigger>
            <TabsTrigger value="diagnostico">Diagnóstico IA</TabsTrigger>
            <TabsTrigger value="sugestoes">Sugestões ({sugestoes.filter((s) => s.status === "pendente").length})</TabsTrigger>
            <TabsTrigger value="simular">Simular pesquisa</TabsTrigger>
          </TabsList>

          <TabsContent value="graficos" className="space-y-6 mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Média por dia</CardTitle></CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer>
                    <LineChart data={porDia}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="data" fontSize={11} />
                      <YAxis domain={[0, 5]} fontSize={11} />
                      <Tooltip />
                      <Line type="monotone" dataKey="media" stroke="hsl(var(--primary))" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Distribuição NPS</CardTitle></CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={distribuicao} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
                        {distribuicao.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader><CardTitle className="text-base">Top atendentes / agentes</CardTitle></CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer>
                    <BarChart data={porAgente}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="nome" fontSize={11} angle={-15} textAnchor="end" height={60} />
                      <YAxis domain={[0, 5]} fontSize={11} />
                      <Tooltip />
                      <Bar dataKey="media" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="comentarios" className="mt-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Comentários recentes</CardTitle></CardHeader>
              <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
                {respondidas.filter((r) => r.comentario).slice(0, 50).map((r) => (
                  <div key={r.id} className="border rounded-lg p-3 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{"⭐".repeat(r.nota ?? 0)}</Badge>
                      {r.tipo_atendimento && <Badge variant="secondary">{r.tipo_atendimento}</Badge>}
                      {r.agente_utilizado && <span className="text-xs text-muted-foreground">{r.agente_utilizado}</span>}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-foreground">{r.comentario}</p>
                  </div>
                ))}
                {respondidas.filter((r) => r.comentario).length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="diagnostico" className="mt-6 space-y-4">
            {!ultimoDiag && (
              <Card><CardContent className="py-10 text-center text-muted-foreground">
                Nenhum diagnóstico gerado ainda. Clique em "Gerar diagnóstico agora".
              </CardContent></Card>
            )}
            {ultimoDiag && (
              <>
                <p className="text-sm text-muted-foreground">
                  Gerado em {new Date(ultimoDiag.gerado_em).toLocaleString("pt-BR")} · {ultimoDiag.total_avaliacoes} avaliações analisadas
                </p>
                <div className="grid md:grid-cols-3 gap-4">
                  <Card><CardHeader><CardTitle className="text-base text-green-600">Pontos Fortes</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {(ultimoDiag.pontos_fortes || []).map((p, i) => (
                        <div key={i} className="border rounded p-2">
                          <p className="font-medium">{p.titulo}</p>
                          <p className="text-muted-foreground">{p.descricao}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card><CardHeader><CardTitle className="text-base text-destructive">Pontos Fracos</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {(ultimoDiag.pontos_fracos || []).map((p, i) => (
                        <div key={i} className="border rounded p-2">
                          <p className="font-medium">{p.titulo}</p>
                          <p className="text-muted-foreground">{p.descricao}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card><CardHeader><CardTitle className="text-base">Sugestões</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {(ultimoDiag.sugestoes || []).map((p, i) => (
                        <div key={i} className="border rounded p-2">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">{p.tipo}</Badge>
                            <p className="font-medium">{p.titulo}</p>
                          </div>
                          <p className="text-muted-foreground">{p.acao}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="sugestoes" className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              A IA nunca altera a base automaticamente. Aprove ou rejeite cada sugestão.
            </p>
            {sugestoes.length === 0 && (
              <Card><CardContent className="py-10 text-center text-muted-foreground">
                Nenhuma sugestão. Clique em "Gerar sugestões para a Base".
              </CardContent></Card>
            )}
            {sugestoes.map((s) => (
              <Card key={s.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{s.tipo}</Badge>
                    {s.titulo && <span className="font-medium">{s.titulo}</span>}
                    <Badge
                      variant={s.status === "aprovada" ? "default" : s.status === "rejeitada" ? "destructive" : "secondary"}
                      className="ml-auto"
                    >
                      {s.status}
                    </Badge>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{s.conteudo}</p>
                  {s.status === "pendente" && (
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={() => alterarStatusSugestao(s.id, "aprovada")}>
                        <Check className="w-4 h-4 mr-1" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => alterarStatusSugestao(s.id, "rejeitada")}>
                        <X className="w-4 h-4 mr-1" /> Rejeitar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="simular" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Registrar avaliação manualmente</CardTitle>
                <CardDescription>Útil para popular o painel com dados de teste.</CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <div><Label>Empresa ID</Label><Input value={form.empresa_id} onChange={(e) => setForm({ ...form, empresa_id: e.target.value })} /></div>
                <div><Label>Cliente ID</Label><Input value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })} /></div>
                <div>
                  <Label>Tipo de atendimento</Label>
                  <Select value={form.tipo_atendimento} onValueChange={(v) => setForm({ ...form, tipo_atendimento: v as "IA" | "HUMANO" | "HIBRIDO" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IA">IA</SelectItem>
                      <SelectItem value="HUMANO">HUMANO</SelectItem>
                      <SelectItem value="HIBRIDO">HÍBRIDO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nota (1-5)</Label>
                  <Select value={form.nota} onValueChange={(v) => setForm({ ...form, nota: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{"⭐".repeat(n)} {n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Agente utilizado</Label><Input value={form.agente_utilizado} onChange={(e) => setForm({ ...form, agente_utilizado: e.target.value })} /></div>
                <div><Label>Nome do atendente</Label><Input value={form.nome_atendente} onChange={(e) => setForm({ ...form, nome_atendente: e.target.value })} /></div>
                <div><Label>Categoria</Label><Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} /></div>
                <div><Label>Motivo do contato</Label><Input value={form.motivo_contato} onChange={(e) => setForm({ ...form, motivo_contato: e.target.value })} /></div>
                <div className="md:col-span-2">
                  <Label>Comentário</Label>
                  <Textarea value={form.comentario} onChange={(e) => setForm({ ...form, comentario: e.target.value })} rows={4} />
                </div>
                <div className="md:col-span-2">
                  <Button onClick={simular}>Registrar avaliação</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
