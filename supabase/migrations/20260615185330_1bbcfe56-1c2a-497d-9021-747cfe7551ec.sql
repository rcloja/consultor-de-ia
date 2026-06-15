
-- Remove políticas públicas existentes
DROP POLICY IF EXISTS "Anyone can insert compliance reviews" ON public.agent_compliance_reviews;
DROP POLICY IF EXISTS "Anyone can read compliance reviews" ON public.agent_compliance_reviews;
DROP POLICY IF EXISTS "Anyone can update compliance reviews" ON public.agent_compliance_reviews;

DROP POLICY IF EXISTS "Anyone can insert pesquisa_satisfacao" ON public.pesquisa_satisfacao;
DROP POLICY IF EXISTS "Anyone can read pesquisa_satisfacao" ON public.pesquisa_satisfacao;
DROP POLICY IF EXISTS "Anyone can update pesquisa_satisfacao" ON public.pesquisa_satisfacao;

DROP POLICY IF EXISTS "Anyone can insert diagnostico_atendimento" ON public.diagnostico_atendimento;
DROP POLICY IF EXISTS "Anyone can read diagnostico_atendimento" ON public.diagnostico_atendimento;
DROP POLICY IF EXISTS "Anyone can update diagnostico_atendimento" ON public.diagnostico_atendimento;

DROP POLICY IF EXISTS "Anyone can insert sugestoes_base_conhecimento" ON public.sugestoes_base_conhecimento;
DROP POLICY IF EXISTS "Anyone can read sugestoes_base_conhecimento" ON public.sugestoes_base_conhecimento;
DROP POLICY IF EXISTS "Anyone can update sugestoes_base_conhecimento" ON public.sugestoes_base_conhecimento;

-- Revoga privilégios PostgREST de roles anônimos/autenticados
REVOKE ALL ON public.agent_compliance_reviews FROM anon, authenticated;
REVOKE ALL ON public.pesquisa_satisfacao FROM anon, authenticated;
REVOKE ALL ON public.diagnostico_atendimento FROM anon, authenticated;
REVOKE ALL ON public.sugestoes_base_conhecimento FROM anon, authenticated;
REVOKE ALL ON public.cliente_memoria FROM anon, authenticated;
REVOKE ALL ON public.conversas_agente FROM anon, authenticated;
REVOKE ALL ON public.prompts FROM anon, authenticated;
REVOKE ALL ON public.rag_chunks FROM anon, authenticated;

-- Garante acesso total apenas ao service_role (usado pelas edge functions)
GRANT ALL ON public.agent_compliance_reviews TO service_role;
GRANT ALL ON public.pesquisa_satisfacao TO service_role;
GRANT ALL ON public.diagnostico_atendimento TO service_role;
GRANT ALL ON public.sugestoes_base_conhecimento TO service_role;
GRANT ALL ON public.cliente_memoria TO service_role;
GRANT ALL ON public.conversas_agente TO service_role;
GRANT ALL ON public.prompts TO service_role;
GRANT ALL ON public.rag_chunks TO service_role;

-- Política de bloqueio explícito (defensa em profundidade) — RLS já estava ativo
CREATE POLICY "deny_all_anon_authenticated_compliance"
  ON public.agent_compliance_reviews
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "deny_all_anon_authenticated_pesquisa"
  ON public.pesquisa_satisfacao
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "deny_all_anon_authenticated_diagnostico"
  ON public.diagnostico_atendimento
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "deny_all_anon_authenticated_sugestoes"
  ON public.sugestoes_base_conhecimento
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
