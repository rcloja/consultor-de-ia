
CREATE TYPE public.compliance_risk_level AS ENUM ('baixo', 'medio', 'alto', 'critico');
CREATE TYPE public.compliance_decision AS ENUM ('liberado', 'revisao_humana', 'bloqueado');
CREATE TYPE public.compliance_review_status AS ENUM ('pendente', 'aprovado', 'reprovado', 'ajustes_solicitados');

CREATE TABLE public.agent_compliance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text,
  agent_id text,
  user_id text,
  conversation_id text,
  risk_level public.compliance_risk_level NOT NULL,
  detected_categories text[] NOT NULL DEFAULT '{}',
  suspicious_excerpt text,
  decision public.compliance_decision NOT NULL,
  review_status public.compliance_review_status NOT NULL DEFAULT 'pendente',
  human_reviewer_id text,
  human_notes text,
  justification text,
  trigger_event text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_reviews_status ON public.agent_compliance_reviews (review_status);
CREATE INDEX idx_compliance_reviews_risk ON public.agent_compliance_reviews (risk_level);
CREATE INDEX idx_compliance_reviews_agent ON public.agent_compliance_reviews (agent_id);
CREATE INDEX idx_compliance_reviews_created ON public.agent_compliance_reviews (created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.agent_compliance_reviews TO anon, authenticated;
GRANT ALL ON public.agent_compliance_reviews TO service_role;

ALTER TABLE public.agent_compliance_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read compliance reviews"
  ON public.agent_compliance_reviews FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert compliance reviews"
  ON public.agent_compliance_reviews FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update compliance reviews"
  ON public.agent_compliance_reviews FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agent_compliance_reviews_updated
  BEFORE UPDATE ON public.agent_compliance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_updated_at();
