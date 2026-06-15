export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_compliance_reviews: {
        Row: {
          agent_id: string | null
          conversation_id: string | null
          created_at: string
          decision: Database["public"]["Enums"]["compliance_decision"]
          detected_categories: string[]
          human_notes: string | null
          human_reviewer_id: string | null
          id: string
          justification: string | null
          payload: Json | null
          review_status: Database["public"]["Enums"]["compliance_review_status"]
          risk_level: Database["public"]["Enums"]["compliance_risk_level"]
          suspicious_excerpt: string | null
          tenant_id: string | null
          trigger_event: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          decision: Database["public"]["Enums"]["compliance_decision"]
          detected_categories?: string[]
          human_notes?: string | null
          human_reviewer_id?: string | null
          id?: string
          justification?: string | null
          payload?: Json | null
          review_status?: Database["public"]["Enums"]["compliance_review_status"]
          risk_level: Database["public"]["Enums"]["compliance_risk_level"]
          suspicious_excerpt?: string | null
          tenant_id?: string | null
          trigger_event?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          decision?: Database["public"]["Enums"]["compliance_decision"]
          detected_categories?: string[]
          human_notes?: string | null
          human_reviewer_id?: string | null
          id?: string
          justification?: string | null
          payload?: Json | null
          review_status?: Database["public"]["Enums"]["compliance_review_status"]
          risk_level?: Database["public"]["Enums"]["compliance_risk_level"]
          suspicious_excerpt?: string | null
          tenant_id?: string | null
          trigger_event?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cliente_memoria: {
        Row: {
          cidade: string | null
          cliente_id: string
          created_at: string
          empresa: string | null
          empresa_id: string
          id: string
          interesses: Json
          nome: string | null
          objecoes: Json
          probabilidade_compra: number | null
          produtos_vistos: Json
          resumo: string | null
          ultima_interacao: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          cliente_id: string
          created_at?: string
          empresa?: string | null
          empresa_id: string
          id?: string
          interesses?: Json
          nome?: string | null
          objecoes?: Json
          probabilidade_compra?: number | null
          produtos_vistos?: Json
          resumo?: string | null
          ultima_interacao?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          cliente_id?: string
          created_at?: string
          empresa?: string | null
          empresa_id?: string
          id?: string
          interesses?: Json
          nome?: string | null
          objecoes?: Json
          probabilidade_compra?: number | null
          produtos_vistos?: Json
          resumo?: string | null
          ultima_interacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      conversas_agente: {
        Row: {
          auditor: Json | null
          cliente_id: string | null
          created_at: string
          empresa_id: string
          fontes: Json
          id: string
          pergunta: string
          resposta: string
          transferida_humano: boolean
        }
        Insert: {
          auditor?: Json | null
          cliente_id?: string | null
          created_at?: string
          empresa_id: string
          fontes?: Json
          id?: string
          pergunta: string
          resposta: string
          transferida_humano?: boolean
        }
        Update: {
          auditor?: Json | null
          cliente_id?: string | null
          created_at?: string
          empresa_id?: string
          fontes?: Json
          id?: string
          pergunta?: string
          resposta?: string
          transferida_humano?: boolean
        }
        Relationships: []
      }
      diagnostico_atendimento: {
        Row: {
          created_at: string
          csat_geral: number | null
          csat_humano: number | null
          csat_ia: number | null
          detratores: number
          empresa_id: string | null
          gerado_em: string
          id: string
          neutros: number
          nps: number | null
          periodo_fim: string
          periodo_inicio: string
          pontos_fortes: Json
          pontos_fracos: Json
          promotores: number
          sugestoes: Json
          total_avaliacoes: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          csat_geral?: number | null
          csat_humano?: number | null
          csat_ia?: number | null
          detratores?: number
          empresa_id?: string | null
          gerado_em?: string
          id?: string
          neutros?: number
          nps?: number | null
          periodo_fim: string
          periodo_inicio: string
          pontos_fortes?: Json
          pontos_fracos?: Json
          promotores?: number
          sugestoes?: Json
          total_avaliacoes?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          csat_geral?: number | null
          csat_humano?: number | null
          csat_ia?: number | null
          detratores?: number
          empresa_id?: string | null
          gerado_em?: string
          id?: string
          neutros?: number
          nps?: number | null
          periodo_fim?: string
          periodo_inicio?: string
          pontos_fortes?: Json
          pontos_fracos?: Json
          promotores?: number
          sugestoes?: Json
          total_avaliacoes?: number
          updated_at?: string
        }
        Relationships: []
      }
      implantador_logs: {
        Row: {
          agent_id: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          status: string
          total_tokens: number
        }
        Insert: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          status?: string
          total_tokens?: number
        }
        Update: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          status?: string
          total_tokens?: number
        }
        Relationships: []
      }
      pesquisa_satisfacao: {
        Row: {
          agente_utilizado: string | null
          categoria: string | null
          cliente_id: string | null
          comentario: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          empresa_id: string | null
          id: string
          motivo_contato: string | null
          nome_atendente: string | null
          nota: number | null
          resumo_atendimento: string | null
          status_envio: Database["public"]["Enums"]["status_envio_pesquisa"]
          tempo_atendimento_segundos: number | null
          tipo_atendimento:
            | Database["public"]["Enums"]["tipo_atendimento"]
            | null
          updated_at: string
        }
        Insert: {
          agente_utilizado?: string | null
          categoria?: string | null
          cliente_id?: string | null
          comentario?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          empresa_id?: string | null
          id?: string
          motivo_contato?: string | null
          nome_atendente?: string | null
          nota?: number | null
          resumo_atendimento?: string | null
          status_envio?: Database["public"]["Enums"]["status_envio_pesquisa"]
          tempo_atendimento_segundos?: number | null
          tipo_atendimento?:
            | Database["public"]["Enums"]["tipo_atendimento"]
            | null
          updated_at?: string
        }
        Update: {
          agente_utilizado?: string | null
          categoria?: string | null
          cliente_id?: string | null
          comentario?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          empresa_id?: string | null
          id?: string
          motivo_contato?: string | null
          nome_atendente?: string | null
          nota?: number | null
          resumo_atendimento?: string | null
          status_envio?: Database["public"]["Enums"]["status_envio_pesquisa"]
          tempo_atendimento_segundos?: number | null
          tipo_atendimento?:
            | Database["public"]["Enums"]["tipo_atendimento"]
            | null
          updated_at?: string
        }
        Relationships: []
      }
      prompts: {
        Row: {
          conteudo: string
          created_at: string
          empresa_id: string
          id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          conteudo: string
          created_at?: string
          empresa_id: string
          id?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          empresa_id?: string
          id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      rag_chunks: {
        Row: {
          categoria: string
          conteudo: string
          created_at: string
          embedding: string | null
          empresa_id: string
          id: string
          titulo: string
        }
        Insert: {
          categoria: string
          conteudo: string
          created_at?: string
          embedding?: string | null
          empresa_id: string
          id?: string
          titulo: string
        }
        Update: {
          categoria?: string
          conteudo?: string
          created_at?: string
          embedding?: string | null
          empresa_id?: string
          id?: string
          titulo?: string
        }
        Relationships: []
      }
      sugestoes_base_conhecimento: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          conteudo: string
          created_at: string
          empresa_id: string | null
          id: string
          origem: string | null
          status: Database["public"]["Enums"]["sugestao_status"]
          tipo: Database["public"]["Enums"]["sugestao_tipo"]
          titulo: string | null
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          conteudo: string
          created_at?: string
          empresa_id?: string | null
          id?: string
          origem?: string | null
          status?: Database["public"]["Enums"]["sugestao_status"]
          tipo?: Database["public"]["Enums"]["sugestao_tipo"]
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          conteudo?: string
          created_at?: string
          empresa_id?: string | null
          id?: string
          origem?: string | null
          status?: Database["public"]["Enums"]["sugestao_status"]
          tipo?: Database["public"]["Enums"]["sugestao_tipo"]
          titulo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_rag_chunks: {
        Args: {
          match_count?: number
          p_empresa_id: string
          query_embedding: string
        }
        Returns: {
          categoria: string
          conteudo: string
          id: string
          similarity: number
          titulo: string
        }[]
      }
    }
    Enums: {
      compliance_decision: "liberado" | "revisao_humana" | "bloqueado"
      compliance_review_status:
        | "pendente"
        | "aprovado"
        | "reprovado"
        | "ajustes_solicitados"
      compliance_risk_level: "baixo" | "medio" | "alto" | "critico"
      status_envio_pesquisa: "pendente" | "enviada" | "respondida" | "expirada"
      sugestao_status: "pendente" | "aprovada" | "rejeitada"
      sugestao_tipo: "FAQ" | "PROMPT" | "TOM" | "FLUXO" | "OUTRO"
      tipo_atendimento: "IA" | "HUMANO" | "HIBRIDO"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      compliance_decision: ["liberado", "revisao_humana", "bloqueado"],
      compliance_review_status: [
        "pendente",
        "aprovado",
        "reprovado",
        "ajustes_solicitados",
      ],
      compliance_risk_level: ["baixo", "medio", "alto", "critico"],
      status_envio_pesquisa: ["pendente", "enviada", "respondida", "expirada"],
      sugestao_status: ["pendente", "aprovada", "rejeitada"],
      sugestao_tipo: ["FAQ", "PROMPT", "TOM", "FLUXO", "OUTRO"],
      tipo_atendimento: ["IA", "HUMANO", "HIBRIDO"],
    },
  },
} as const
