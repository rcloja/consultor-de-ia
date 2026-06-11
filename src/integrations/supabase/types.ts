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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      compliance_decision: "liberado" | "revisao_humana" | "bloqueado"
      compliance_review_status:
        | "pendente"
        | "aprovado"
        | "reprovado"
        | "ajustes_solicitados"
      compliance_risk_level: "baixo" | "medio" | "alto" | "critico"
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
    },
  },
} as const
