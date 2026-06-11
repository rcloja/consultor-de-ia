import { supabase } from "@/integrations/supabase/client";

export type ComplianceRisk = "baixo" | "medio" | "alto" | "critico";
export type ComplianceDecision = "liberado" | "revisao_humana" | "bloqueado";

export interface ComplianceCheckPayload {
  tenant_id?: string | null;
  agent_id?: string | null;
  user_id?: string | null;
  conversation_id?: string | null;
  trigger_event?: string;
  payload: {
    nome_negocio?: string;
    descricao_empresa?: string;
    base?: Record<string, string[]> | unknown;
    prompt_persona?: string;
    produtos_servicos?: string;
    mensagens_automaticas?: string;
    urls?: string[];
    termos_comerciais?: string;
    [k: string]: unknown;
  };
}

export interface ComplianceCheckResult {
  review_id: string | null;
  risk_level: ComplianceRisk;
  decision: ComplianceDecision;
  detected_categories: string[];
  suspicious_excerpt: string;
  justification: string;
  allow_proceed: boolean;
}

export async function runComplianceCheck(
  payload: ComplianceCheckPayload,
): Promise<ComplianceCheckResult> {
  const { data, error } = await supabase.functions.invoke("compliance-check", {
    body: payload,
  });
  if (error) throw new Error(error.message ?? "Falha na verificação de compliance.");
  return data as ComplianceCheckResult;
}

export const MSG_REVISAO_HUMANA =
  "Identifiquei possíveis elementos incompatíveis com as políticas de uso da plataforma. Por segurança, esta implantação será encaminhada para revisão humana antes da ativação.";

export const MSG_BLOQUEIO_CRITICO =
  "Não é possível prosseguir com esta implantação, pois o conteúdo indica possível atividade proibida ou ilícita. O caso foi bloqueado para revisão interna.";
