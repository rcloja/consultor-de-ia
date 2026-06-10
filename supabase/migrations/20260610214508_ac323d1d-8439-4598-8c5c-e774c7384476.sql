CREATE TABLE public.implantador_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT,
  conversation_id TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT ALL ON public.implantador_logs TO service_role;
ALTER TABLE public.implantador_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_implantador_logs_conversation ON public.implantador_logs(conversation_id);
CREATE INDEX idx_implantador_logs_created_at ON public.implantador_logs(created_at DESC);