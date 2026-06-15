-- Vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- =========================
-- prompts (prompt principal)
-- =========================
CREATE TABLE public.prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL,
  titulo text NOT NULL,
  conteudo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prompts_empresa_id_idx ON public.prompts (empresa_id);

GRANT ALL ON public.prompts TO service_role;
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
-- Sem políticas: acesso apenas via edge functions (service_role).

CREATE TRIGGER prompts_set_updated_at
BEFORE UPDATE ON public.prompts
FOR EACH ROW EXECUTE FUNCTION public.tg_update_updated_at();

-- =========================
-- rag_chunks (memória vetorial)
-- =========================
CREATE TABLE public.rag_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN (
    'empresa','produtos','servicos','faq','objecoes','vendas',
    'politicas','atendimento','casos_de_uso','tom_de_voz','restricoes','exemplos'
  )),
  titulo text NOT NULL,
  conteudo text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rag_chunks_empresa_id_idx ON public.rag_chunks (empresa_id);
CREATE INDEX rag_chunks_categoria_idx ON public.rag_chunks (categoria);
CREATE INDEX rag_chunks_embedding_idx
  ON public.rag_chunks USING hnsw (embedding vector_cosine_ops);

GRANT ALL ON public.rag_chunks TO service_role;
ALTER TABLE public.rag_chunks ENABLE ROW LEVEL SECURITY;
-- Sem políticas: acesso apenas via edge functions (service_role).

-- =========================
-- Função de busca semântica (usada por futuras edge functions)
-- =========================
CREATE OR REPLACE FUNCTION public.match_rag_chunks (
  p_empresa_id text,
  query_embedding vector(1536),
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  categoria text,
  titulo text,
  conteudo text,
  similarity float
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    c.id, c.categoria, c.titulo, c.conteudo,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.rag_chunks c
  WHERE c.empresa_id = p_empresa_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
