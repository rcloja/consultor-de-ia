import { useState } from "react";
import {
  ArrowRight,
  Bot,
  Building2,
  Package,
  ShoppingCart,
  HelpCircle,
  ShieldAlert,
  Sparkles,
  Workflow,
  FileText,
  Trophy,
  UserCheck,
  Languages,
  AlertCircle,
  Check,
  MessageSquare,
  ListChecks,
  Database,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiagnosticoChat } from "@/components/DiagnosticoChat";

const Index = () => {
  const [chatOpen, setChatOpen] = useState(false);
  const openChat = () => setChatOpen(true);

  return (
    <div className="min-h-screen bg-background">
      {/* NAV */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border/60">
        <div className="container flex items-center justify-between h-16">
          <a href="#inicio" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center shadow-glow">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-bold text-lg">AtendenteAI</span>
          </a>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#inicio" className="hover:text-foreground transition">Início</a>
            <a href="#mapear" className="hover:text-foreground transition">O que mapeia</a>
            <a href="#como-funciona" className="hover:text-foreground transition">Como funciona</a>
            <a href="#base" className="hover:text-foreground transition">Base gerada</a>
          </nav>
          <Button onClick={openChat} className="rounded-xl hidden sm:inline-flex">
            Começar
          </Button>
        </div>
      </header>

      {/* HERO */}
      <section id="inicio" className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 gradient-soft" />
        <div className="absolute top-20 -right-32 w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl -z-10" />
        <div className="absolute top-40 -left-32 w-[400px] h-[400px] rounded-full bg-accent/10 blur-3xl -z-10" />

        <div className="container pt-16 pb-24 lg:pt-24 lg:pb-32">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="animate-fade-up">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-muted-foreground mb-6 shadow-card">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
                Implantação guiada por IA · Consultoria estratégica
              </div>
              <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl leading-[1.05] mb-6">
                Antes de colocar uma IA para atender seus clientes,{" "}
                <span className="gradient-text">ela precisa entender sua empresa.</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-xl">
                Conduzimos você por uma implantação guiada para transformar processos, produtos,
                dúvidas, objeções e diferenciais em uma <strong className="text-foreground">Base de
                Conhecimento</strong> pronta para treinar seu agente de atendimento.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={openChat} size="lg" className="rounded-2xl h-14 px-8 text-base shadow-elegant group">
                  Iniciar diagnóstico de implantação
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition" />
                </Button>
                <Button asChild variant="outline" size="lg" className="rounded-2xl h-14 px-8 text-base">
                  <a href="#mapear">Ver o que será mapeado</a>
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-4 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5" />
                Não é uma venda. É uma conversa consultiva para organizar o conhecimento do seu negócio.
              </p>
            </div>

            {/* Visual: Chat + Base */}
            <div className="relative animate-fade-up" style={{ animationDelay: "0.15s" }}>
              <div className="grid grid-cols-5 gap-4">
                {/* Chat card */}
                <div className="col-span-3 bg-card rounded-3xl border border-border shadow-elegant p-5">
                  <div className="flex items-center gap-2.5 pb-4 border-b border-border">
                    <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center">
                      <Bot className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold font-display">Arquiteto de Conhecimento IA</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        Consultor · online
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2.5 pt-4">
                    <div className="bg-secondary rounded-2xl rounded-bl-md px-3.5 py-2.5 text-xs leading-relaxed max-w-[92%]">
                      Qual é o nome da empresa, segmento e principal produto ou serviço oferecido?
                    </div>
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3.5 py-2.5 text-xs leading-relaxed ml-auto max-w-[80%]">
                      Clínica Bella Forma — estética facial e corporal.
                    </div>
                    <div className="bg-secondary rounded-2xl rounded-bl-md px-3.5 py-2.5 text-xs leading-relaxed max-w-[92%]">
                      Entendi. Quais serviços geram mais procura hoje?
                    </div>
                    <div className="flex gap-1 pt-1 px-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse-dot" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse-dot" style={{ animationDelay: "0.2s" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse-dot" style={{ animationDelay: "0.4s" }} />
                    </div>
                  </div>
                </div>

                {/* Knowledge base card */}
                <div className="col-span-2 bg-card rounded-3xl border border-border shadow-card p-5 flex flex-col">
                  <div className="flex items-center gap-2 pb-3 border-b border-border">
                    <Database className="w-4 h-4 text-primary" />
                    <div className="text-xs font-semibold font-display">Base de Conhecimento</div>
                  </div>
                  <ul className="pt-3 space-y-2 text-[11px]">
                    {[
                      { label: "Empresa", done: true },
                      { label: "Segmento", done: true },
                      { label: "Serviços", done: true },
                      { label: "Diferenciais", done: false },
                      { label: "FAQ", done: false },
                      { label: "Objeções", done: false },
                    ].map((it) => (
                      <li key={it.label} className="flex items-center gap-2">
                        <span
                          className={`w-4 h-4 rounded-md flex items-center justify-center ${
                            it.done ? "bg-accent text-accent-foreground" : "bg-secondary border border-border"
                          }`}
                        >
                          {it.done && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                        </span>
                        <span className={it.done ? "text-foreground font-medium" : "text-muted-foreground"}>
                          {it.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-4">
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full w-1/2 gradient-hero rounded-full" />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1.5">50% mapeado</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIFERENCIAÇÃO */}
      <section className="container py-20 lg:py-28">
        <div className="max-w-3xl mb-14">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Diferença</p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl leading-tight mb-5">
            Não é um formulário. Não é um entrevistador.{" "}
            <span className="gradient-text">É um consultor de implantação de IA.</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            O agente conduz uma conversa inteligente, identifica lacunas, organiza respostas e transforma o
            conhecimento do empresário em documentação útil para o futuro atendimento automatizado.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: Building2, title: "Descobre como sua empresa funciona", desc: "Mergulha no contexto real do negócio antes de qualquer automação." },
            { icon: Workflow, title: "Mapeia processos comerciais e operacionais", desc: "Do primeiro contato até a entrega: tudo estruturado." },
            { icon: HelpCircle, title: "Identifica dúvidas e objeções dos clientes", desc: "Constrói FAQs e respostas a objeções com base na realidade." },
            { icon: Sparkles, title: "Captura diferenciais e linguagem do negócio", desc: "Sua marca soa como sua marca — sem improvisos." },
            { icon: Database, title: "Organiza tudo em uma Base de Conhecimento", desc: "Documentação estruturada e pronta para treinamento da IA." },
            { icon: Bot, title: "Prepara o futuro agente de atendimento", desc: "Sua IA começa a operar com contexto, regras e limites claros." },
          ].map((c, i) => (
            <div
              key={i}
              className="group relative bg-card border border-border rounded-3xl p-6 shadow-card hover:shadow-elegant hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mb-4 group-hover:scale-110 transition">
                <c.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">{c.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* O QUE SERÁ MAPEADO */}
      <section id="mapear" className="bg-secondary/40 border-y border-border py-20 lg:py-28">
        <div className="container">
          <div className="max-w-3xl mb-14">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Mapeamento</p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl leading-tight mb-5">
              O que será mapeado na sua empresa
            </h2>
            <p className="text-lg text-muted-foreground">
              Uma visão completa de tudo que o agente vai descobrir, organizar e transformar em conhecimento útil.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Building2, title: "Empresa", desc: "Nome, segmento, tempo de atuação, região atendida, público-alvo." },
              { icon: Package, title: "Produtos e serviços", desc: "O que vende, como vende, ticket médio, principais ofertas e diferenciais." },
              { icon: ShoppingCart, title: "Processo comercial", desc: "Origem dos clientes, atendimento, venda e pós-venda." },
              { icon: HelpCircle, title: "FAQ", desc: "Perguntas frequentes antes da compra e respostas ideais." },
              { icon: ShieldAlert, title: "Objeções", desc: "Motivos que impedem o fechamento e melhores respostas." },
              { icon: Sparkles, title: "Diferenciais", desc: "Motivos para escolher a empresa e não os concorrentes." },
              { icon: Workflow, title: "Processos internos", desc: "Fluxo do primeiro contato até a entrega." },
              { icon: FileText, title: "Políticas", desc: "Garantias, trocas, cancelamentos, reembolsos e prazos." },
              { icon: Trophy, title: "Casos reais", desc: "Exemplos de clientes com bons resultados." },
              { icon: UserCheck, title: "Cliente ideal", desc: "Quem compra, quem não compra, perfil ideal e perfil problemático." },
              { icon: Languages, title: "Linguagem do negócio", desc: "Termos técnicos, gírias do segmento e expressões internas." },
              { icon: AlertCircle, title: "Lacunas", desc: "Processos indefinidos, respostas incompletas e contradições." },
            ].map((c, i) => (
              <div key={i} className="bg-card rounded-2xl p-5 border border-border hover:border-primary/40 transition">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <c.icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold mb-1">{c.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="container py-20 lg:py-28">
        <div className="max-w-3xl mb-14">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Como funciona</p>
          <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl leading-tight mb-5">
            Uma conversa estruturada, sem fricção
          </h2>
          <p className="text-lg text-muted-foreground">
            Cinco passos simples que transformam o conhecimento da sua empresa em uma base pronta para treinar IA.
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-4 relative">
          {[
            { n: "01", title: "Perguntas consultivas", desc: "O agente faz perguntas simples, uma de cada vez." },
            { n: "02", title: "Você responde", desc: "Com a realidade do seu negócio, no seu ritmo." },
            { n: "03", title: "Resumo e confirmação", desc: "O agente resume e valida o que entendeu." },
            { n: "04", title: "Organização por tema", desc: "Tudo categorizado em estrutura limpa." },
            { n: "05", title: "Base estruturada", desc: "Pronta para treinar seu agente de IA." },
          ].map((s) => (
            <div key={s.n} className="bg-card border border-border rounded-2xl p-5 hover:shadow-card transition">
              <div className="text-3xl font-display font-extrabold gradient-text mb-2">{s.n}</div>
              <h3 className="font-display font-semibold mb-1.5">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* EXEMPLO DE CONVERSA */}
      <section className="bg-secondary/40 border-y border-border py-20 lg:py-28">
        <div className="container grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Exemplo real</p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl leading-tight mb-5">
              Veja como o agente conduz a conversa
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              Sem interrogatório. Sem formulário. Uma conversa natural que respeita seu tempo e investiga com
              propósito.
            </p>
            <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground">
              "IA boa começa com conhecimento bem organizado. Antes de automatizar, é preciso entender."
            </blockquote>
          </div>

          <div className="bg-card rounded-3xl border border-border shadow-elegant p-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-border mb-4">
              <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold font-display">Arquiteto de Conhecimento IA</div>
                <div className="text-xs text-muted-foreground">Diagnóstico de implantação</div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed max-w-[90%]">
                Para começarmos, qual é o nome da empresa, segmento e principal produto ou serviço oferecido?
              </div>
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed ml-auto max-w-[85%]">
                Tenho uma clínica estética chamada Bella Forma. Vendemos procedimentos faciais e corporais.
              </div>
              <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed max-w-[90%]">
                Entendi que a Bella Forma atua no segmento de estética, oferecendo procedimentos faciais e
                corporais. Está correto? Agora gostaria de entender quais serviços mais geram procura
                atualmente.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BASE GERADA */}
      <section id="base" className="container py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1">
            <div className="bg-card rounded-3xl border border-border shadow-elegant p-6">
              <div className="flex items-center gap-2 pb-4 border-b border-border mb-4">
                <ListChecks className="w-5 h-5 text-primary" />
                <div className="font-display font-semibold">Base de Conhecimento — Bella Forma</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
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
                  "Informações Pendentes",
                ].map((it, i) => (
                  <div
                    key={it}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/60 text-sm"
                  >
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center ${
                        i < 12 ? "bg-accent text-accent-foreground" : "bg-card border border-border"
                      }`}
                    >
                      {i < 12 ? <Check className="w-3 h-3" strokeWidth={3} /> : <AlertCircle className="w-3 h-3 text-muted-foreground" />}
                    </span>
                    <span className="font-medium">{it}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Entregável</p>
            <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl leading-tight mb-5">
              Ao final da conversa, sua empresa ganha uma <span className="gradient-text">base organizada.</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              Cada bloco de conhecimento é estruturado, validado e pronto para alimentar o treinamento do seu
              agente de atendimento — incluindo as lacunas que ainda precisam ser preenchidas.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                "Documento navegável por tema",
                "Lacunas e contradições identificadas",
                "Regras claras para o agente de IA",
                "Pronto para integração futura",
              ].map((b) => (
                <li key={b} className="flex items-center gap-2 text-muted-foreground">
                  <Check className="w-4 h-4 text-accent" strokeWidth={3} />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CONFIANÇA */}
      <section className="bg-gradient-to-br from-primary/5 via-background to-accent/5 py-20 lg:py-28">
        <div className="container max-w-4xl text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl gradient-hero shadow-glow mb-6">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl leading-tight mb-5">
            Quanto melhor a base, <span className="gradient-text">melhor será o atendimento da IA.</span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Uma inteligência artificial não deve responder com improviso. Ela precisa de contexto, regras,
            limites e conhecimento real da empresa. Essa etapa reduz respostas erradas, melhora a experiência
            do cliente e aumenta a segurança do atendimento.
          </p>
          <p className="mt-6 text-base font-display font-semibold text-foreground">
            Seu atendimento 24h precisa aprender com a realidade da sua empresa.
          </p>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="container py-20 lg:py-28">
        <div className="relative overflow-hidden rounded-[2rem] gradient-hero p-10 lg:p-16 text-center shadow-elegant">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.2),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.15),transparent_50%)]" />
          <div className="relative">
            <MessageSquare className="w-10 h-10 text-white/90 mx-auto mb-5" />
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-white leading-tight mb-4 max-w-3xl mx-auto">
              Pronto para organizar o conhecimento da sua empresa?
            </h2>
            <p className="text-lg text-white/90 mb-8 max-w-2xl mx-auto">
              Comece pelo diagnóstico guiado. O agente vai conduzir a conversa passo a passo.
            </p>
            <Button
              onClick={openChat}
              size="lg"
              variant="secondary"
              className="rounded-2xl h-14 px-8 text-base bg-white text-primary hover:bg-white/90 shadow-elegant group"
            >
              Iniciar diagnóstico de implantação
              <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition" />
            </Button>
            <p className="text-xs text-white/70 mt-4">
              Transforme respostas soltas em uma Base de Conhecimento estruturada.
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border py-10">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg gradient-hero flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-semibold text-foreground">AtendenteAI</span>
          </div>
          <p>© {new Date().getFullYear()} AtendenteAI — Implantação consultiva de IA.</p>
        </div>
      </footer>

      {/* FLOATING CTA */}
      <button
        onClick={openChat}
        className="fixed bottom-5 right-5 z-30 sm:hidden gradient-hero text-white rounded-full p-4 shadow-elegant"
        aria-label="Iniciar diagnóstico"
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      <DiagnosticoChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
};

export default Index;
