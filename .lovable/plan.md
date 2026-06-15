## Pesquisa Inteligente de Satisfação Pós-Atendimento

Feature completa no app Consultor, com banco, painel admin e análise por IA.

---

### 1. Banco de dados (migration)

**Tabela `pesquisa_satisfacao`**
- `id` (uuid, pk)
- `empresa_id` (text)
- `cliente_id` (text)
- `tipo_atendimento` (enum: `IA`, `HUMANO`, `HIBRIDO`)
- `agente_utilizado` (text)
- `nome_atendente` (text)
- `nota` (int 1–5)
- `comentario` (text)
- `tempo_atendimento` (interval/segundos)
- `data_inicio`, `data_fim` (timestamptz)
- `resumo_atendimento` (text)
- `categoria` (text)
- `motivo_contato` (text)
- `status_envio` (enum: `pendente`, `enviada`, `respondida`, `expirada`) — controla o "momento do envio"
- `created_at`, `updated_at`

**Tabela `diagnostico_atendimento`** (relatórios gerados)
- `id`, `empresa_id`, `periodo_inicio`, `periodo_fim`
- `csat_ia`, `csat_humano`, `csat_geral` (numeric)
- `nps` (numeric), `promotores`, `neutros`, `detratores` (int)
- `pontos_fortes` (jsonb), `pontos_fracos` (jsonb), `sugestoes` (jsonb)
- `gerado_em` (timestamptz)

**Tabela `sugestoes_base_conhecimento`**
- `id`, `empresa_id`, `tipo` (FAQ/prompt/tom/fluxo), `conteudo` (text)
- `status` (`pendente`, `aprovada`, `rejeitada`)
- `aprovado_por`, `aprovado_em`
- `created_at`

RLS: leitura/escrita ampla agora (sem auth no projeto), com GRANT a `anon`+`authenticated`. Pode ser endurecido depois.

---

### 2. Edge functions

- **`pesquisa-enviar`**: recebe atendimento encerrado e cria registro `pendente`/`enviada`. Aplica as regras de envio (resolvido, encerrado, ou inatividade > X min).
- **`pesquisa-responder`**: recebe nota + comentário do cliente, dispara pergunta de follow-up conforme nota (1–3 vs 4–5), grava resposta integral.
- **`diagnostico-gerar`**: lê avaliações do período, calcula CSAT/NPS, chama Lovable AI (Gemini) para agrupar reclamações, gerar Pontos Fortes / Fracos / Sugestões, grava em `diagnostico_atendimento`. Acionável manualmente e por cron (diário/semanal via pg_cron).
- **`sugestoes-base-gerar`**: botão "Gerar sugestões para melhorar a Base de Conhecimento". A IA analisa conversas/resumos/avaliações e cria registros em `sugestoes_base_conhecimento` com `status=pendente`. NUNCA aplica automaticamente.

---

### 3. Painel administrativo

Nova rota `/satisfacao` (link no header).

**Cards de topo**
- CSAT Geral, CSAT IA, CSAT Humano, NPS, total de respostas.

**Gráficos** (recharts)
- Linha: média por dia.
- Barras: por empresa, por atendente, por agente.
- Donut: Promotores / Neutros / Detratores.

**Listas**
- Comentários recentes (com nota, tipo de atendimento, data).
- Reclamações mais frequentes (agrupadas pela IA).
- Sugestões automáticas da IA (com botões **Aprovar** / **Rejeitar** que mudam status em `sugestoes_base_conhecimento`).

**Ações**
- Botão "Gerar diagnóstico agora" → chama `diagnostico-gerar`.
- Botão "Gerar sugestões para Base de Conhecimento" → chama `sugestoes-base-gerar`.
- Filtros por período, empresa, agente, tipo de atendimento.

---

### 4. Simulação / Form de teste

Como o app é um Consultor (não atende clientes finais), incluo na mesma página um bloco **"Simular pesquisa"**:
- Form para registrar manualmente uma avaliação (tipo, nota, comentário, atendente, etc.) → grava em `pesquisa_satisfacao`. Útil para popular dados e validar painel.

---

### 5. Cron (pg_cron + pg_net)

Job semanal que chama `diagnostico-gerar` automaticamente. Configurado via SQL `INSERT` no `cron.schedule` (não migration).

---

### Detalhes técnicos

- Stack: React + shadcn + recharts + Supabase (Lovable Cloud) + Lovable AI Gateway (`google/gemini-3-flash-preview` para análises, `google/gemini-2.5-flash-lite` para classificação rápida).
- Tudo client-side consome via `@/integrations/supabase/client` + `supabase.functions.invoke`.
- Markdown em respostas da IA renderizado com `react-markdown` (onde aplicável).
- Componentes novos: `src/pages/Satisfacao.tsx`, `src/components/satisfacao/*` (KpiCards, ChartsPanel, ComentariosList, SugestoesList, SimularPesquisaForm).
- Edge functions em `supabase/functions/{pesquisa-enviar,pesquisa-responder,diagnostico-gerar,sugestoes-base-gerar}/index.ts` com `verify_jwt = false`.

---

### O que NÃO entra agora

- Integração real com WhatsApp/canal de atendimento (este app é o Consultor; envio real fica para o produto de atendimento). A função `pesquisa-enviar` apenas registra/marca como enviada — pronta para ser plugada depois.
- Autenticação/multi-tenant — usamos `empresa_id` como texto livre por enquanto.

Confirma para eu implementar?