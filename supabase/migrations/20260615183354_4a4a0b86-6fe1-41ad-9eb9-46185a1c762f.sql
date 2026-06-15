
-- 1) Memória resumida por cliente
CREATE TABLE public.cliente_memoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL,
  cliente_id text NOT NULL,
  nome text,
  cidade text,
  empresa text,
  interesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  produtos_vistos jsonb NOT NULL DEFAULT '[]'::jsonb,
  objecoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ultima_interacao timestamptz,
  probabilidade_compra int CHECK (probabilidade_compra IS NULL OR (probabilidade_compra BETWEEN 0 AND 100)),
  resumo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, cliente_id)
);

GRANT ALL ON public.cliente_memoria TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_memoria TO authenticated;

ALTER TABLE public.cliente_memoria ENABLE ROW LEVEL SECURITY;
-- Sem auth no projeto: acesso apenas via service_role (edge functions). Nenhuma policy pública.

CREATE TRIGGER trg_cliente_memoria_updated
BEFORE UPDATE ON public.cliente_memoria
FOR EACH ROW EXECUTE FUNCTION public.tg_update_updated_at();

CREATE INDEX cliente_memoria_empresa_idx ON public.cliente_memoria(empresa_id);

-- 2) Conversas do agente (para diagnóstico contínuo)
CREATE TABLE public.conversas_agente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL,
  cliente_id text,
  pergunta text NOT NULL,
  resposta text NOT NULL,
  fontes jsonb NOT NULL DEFAULT '[]'::jsonb,
  auditor jsonb,
  transferida_humano boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.conversas_agente TO service_role;
GRANT SELECT, INSERT ON public.conversas_agente TO authenticated;

ALTER TABLE public.conversas_agente ENABLE ROW LEVEL SECURITY;

CREATE INDEX conversas_agente_empresa_idx ON public.conversas_agente(empresa_id, created_at DESC);
