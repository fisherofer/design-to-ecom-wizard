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
      ai_recommendation_log: {
        Row: {
          generated_at: string
          horizon_days: number
          id: string
          model: string
          owner_session: string | null
          picks: Json
          rationale: string | null
          universe: string[]
        }
        Insert: {
          generated_at?: string
          horizon_days?: number
          id?: string
          model: string
          owner_session?: string | null
          picks: Json
          rationale?: string | null
          universe: string[]
        }
        Update: {
          generated_at?: string
          horizon_days?: number
          id?: string
          model?: string
          owner_session?: string | null
          picks?: Json
          rationale?: string | null
          universe?: string[]
        }
        Relationships: []
      }
      code_findings: {
        Row: {
          created_at: string
          file_path: string
          id: string
          language: string | null
          model: string | null
          owner_session: string
          provider: string
          recommendation: string | null
          repo_url: string
          reviewed: boolean
          score: number
          snippet: string | null
          summary: string | null
          tags: string[] | null
          updated_at: string
          verdict: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          language?: string | null
          model?: string | null
          owner_session: string
          provider?: string
          recommendation?: string | null
          repo_url: string
          reviewed?: boolean
          score?: number
          snippet?: string | null
          summary?: string | null
          tags?: string[] | null
          updated_at?: string
          verdict?: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          language?: string | null
          model?: string | null
          owner_session?: string
          provider?: string
          recommendation?: string | null
          repo_url?: string
          reviewed?: boolean
          score?: number
          snippet?: string | null
          summary?: string | null
          tags?: string[] | null
          updated_at?: string
          verdict?: string
        }
        Relationships: []
      }
      drive_backup_targets: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          last_uploaded: number
          owner_session: string
          repo_url: string
          root_folder: string
          token: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_uploaded?: number
          owner_session: string
          repo_url: string
          root_folder?: string
          token?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_uploaded?: number
          owner_session?: string
          repo_url?: string
          root_folder?: string
          token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      portable_profile_sync: {
        Row: {
          created_at: string
          deleted: boolean
          device_id: string | null
          id: string
          key: string
          owner_session: string
          revision: number
          updated_at: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          id?: string
          key: string
          owner_session: string
          revision?: number
          updated_at?: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          deleted?: boolean
          device_id?: string | null
          id?: string
          key?: string
          owner_session?: string
          revision?: number
          updated_at?: string
          value?: Json | null
        }
        Relationships: []
      }
      trade_journal: {
        Row: {
          broker_order_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          message: string
          occurred_at: string
          order_id: string | null
          owner_session: string
          price: number | null
          qty: number | null
          realized_usd: number | null
          severity: string
          side: string | null
          source: string
          symbol: string | null
        }
        Insert: {
          broker_order_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          message: string
          occurred_at?: string
          order_id?: string | null
          owner_session: string
          price?: number | null
          qty?: number | null
          realized_usd?: number | null
          severity?: string
          side?: string | null
          source?: string
          symbol?: string | null
        }
        Update: {
          broker_order_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          message?: string
          occurred_at?: string
          order_id?: string | null
          owner_session?: string
          price?: number | null
          qty?: number | null
          realized_usd?: number | null
          severity?: string
          side?: string | null
          source?: string
          symbol?: string | null
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
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
