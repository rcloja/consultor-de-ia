
-- Enums
CREATE TYPE public.tipo_atendimento AS ENUM ('IA', 'HUMANO', 'HIBRIDO');
CREATE TYPE public.status_envio_pesquisa AS ENUM ('pendente', 'enviada', 'respondida', 'expirada');
CREATE TYPE public.sugestao_tipo AS ENUM ('FAQ', 'PROMPT', 'TOM', 'FLUXO', 'OUTRO');
CREATE TYPE public.sugestao_status AS ENUM ('pendente', 'aprovada', 'rejeitada');

-- 1) pesquisa_satisfacao
CREATE TABLE public.pesquisa_satisfacao (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id text,
  cliente_id text,
  tipo_atendimento public.tipo_atendimento,
  agente_utilizado text,
  nome_atendente text,
  nota integer CHECK (nota IS NULL OR (nota BETWEEN 1 AND 5)),
  comentario text,
  tempo_atendimento_segundos integer,
  data_inicio timestamptz,
  data_fim timestamptz,
  resumo_atendimento text,
  categoria text,
  motivo_contato text,
  status_envio public.status_envio_pesquisa NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.pesquisa_satisfacao TO anon, authenticated;
GRANT ALL ON public.pesquisa_satisfacao TO service_role;

ALTER TABLE public.pesquisa_satisfacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read pesquisa_satisfacao"
  ON public.pesquisa_satisfacao FOR SELECT USING (true);
CREATE POLICY "Anyone can insert pesquisa_satisfacao"
  ON public.pesquisa_satisfacao FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update pesquisa_satisfacao"
  ON public.pesquisa_satisfacao FOR UPDATE USING (true) WITH CHECK (true);

CREATE TRIGGER trg_pesquisa_satisfacao_updated_at
  BEFORE UPDATE ON public.pesquisa_satisfacao
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_updated_at();

CREATE INDEX idx_pesquisa_satisfacao_created_at ON public.pesquisa_satisfacao(created_at DESC);
CREATE INDEX idx_pesquisa_satisfacao_empresa ON public.pesquisa_satisfacao(empresa_id);
CREATE INDEX idx_pesquisa_satisfacao_tipo ON public.pesquisa_satisfacao(tipo_atendimento);

-- 2) diagnostico_atendimento
CREATE TABLE public.diagnostico_atendimento (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id text,
  periodo_inicio timestamptz NOT NULL,
  periodo_fim timestamptz NOT NULL,
  csat_ia numeric(3,2),
  csat_humano numeric(3,2),
  csat_geral numeric(3,2),
  nps numeric(5,2),
  promotores integer NOT NULL DEFAULT 0,
  neutros integer NOT NULL DEFAULT 0,
  detratores integer NOT NULL DEFAULT 0,
  total_avaliacoes integer NOT NULL DEFAULT 0,
  pontos_fortes jsonb NOT NULL DEFAULT '[]'::jsonb,
  pontos_fracos jsonb NOT NULL DEFAULT '[]'::jsonb,
  sugestoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.diagnostico_atendimento TO anon, authenticated;
GRANT ALL ON public.diagnostico_atendimento TO service_role;

ALTER TABLE public.diagnostico_atendimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read diagnostico_atendimento"
  ON public.diagnostico_atendimento FOR SELECT USING (true);
CREATE POLICY "Anyone can insert diagnostico_atendimento"
  ON public.diagnostico_atendimento FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update diagnostico_atendimento"
  ON public.diagnostico_atendimento FOR UPDATE USING (true) WITH CHECK (true);

CREATE TRIGGER trg_diagnostico_atendimento_updated_at
  BEFORE UPDATE ON public.diagnostico_atendimento
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_updated_at();

CREATE INDEX idx_diagnostico_gerado_em ON public.diagnostico_atendimento(gerado_em DESC);

-- 3) sugestoes_base_conhecimento
CREATE TABLE public.sugestoes_base_conhecimento (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id text,
  tipo public.sugestao_tipo NOT NULL DEFAULT 'OUTRO',
  titulo text,
  conteudo text NOT NULL,
  status public.sugestao_status NOT NULL DEFAULT 'pendente',
  aprovado_por text,
  aprovado_em timestamptz,
  origem text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.sugestoes_base_conhecimento TO anon, authenticated;
GRANT ALL ON public.sugestoes_base_conhecimento TO service_role;

ALTER TABLE public.sugestoes_base_conhecimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read sugestoes_base_conhecimento"
  ON public.sugestoes_base_conhecimento FOR SELECT USING (true);
CREATE POLICY "Anyone can insert sugestoes_base_conhecimento"
  ON public.sugestoes_base_conhecimento FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sugestoes_base_conhecimento"
  ON public.sugestoes_base_conhecimento FOR UPDATE USING (true) WITH CHECK (true);

CREATE TRIGGER trg_sugestoes_base_conhecimento_updated_at
  BEFORE UPDATE ON public.sugestoes_base_conhecimento
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_updated_at();

CREATE INDEX idx_sugestoes_status ON public.sugestoes_base_conhecimento(status);
CREATE INDEX idx_sugestoes_created_at ON public.sugestoes_base_conhecimento(created_at DESC);
