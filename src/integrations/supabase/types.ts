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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      battle_events: {
        Row: {
          admin_explain_text: string
          battle_run_id: string
          event_type: string
          id: string
          payload_json: Json
          public_summary_text: string
          seq: number
          tick: number
        }
        Insert: {
          admin_explain_text?: string
          battle_run_id: string
          event_type: string
          id?: string
          payload_json?: Json
          public_summary_text?: string
          seq: number
          tick?: number
        }
        Update: {
          admin_explain_text?: string
          battle_run_id?: string
          event_type?: string
          id?: string
          payload_json?: Json
          public_summary_text?: string
          seq?: number
          tick?: number
        }
        Relationships: [
          {
            foreignKeyName: "battle_events_battle_run_id_fkey"
            columns: ["battle_run_id"]
            isOneToOne: false
            referencedRelation: "battle_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      battle_runs: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          fleet_a_snapshot_json: Json
          fleet_b_snapshot_json: Json
          id: string
          result_json: Json | null
          seed: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          fleet_a_snapshot_json: Json
          fleet_b_snapshot_json: Json
          id?: string
          result_json?: Json | null
          seed: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          fleet_a_snapshot_json?: Json
          fleet_b_snapshot_json?: Json
          id?: string
          result_json?: Json | null
          seed?: string
        }
        Relationships: []
      }
      fleet_ships: {
        Row: {
          fleet_id: string
          id: string
          notes: string | null
          quantity: number
          ship_type_id: string
          tactical_group: string
        }
        Insert: {
          fleet_id: string
          id?: string
          notes?: string | null
          quantity?: number
          ship_type_id: string
          tactical_group?: string
        }
        Update: {
          fleet_id?: string
          id?: string
          notes?: string | null
          quantity?: number
          ship_type_id?: string
          tactical_group?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_ships_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_ships_ship_type_id_fkey"
            columns: ["ship_type_id"]
            isOneToOne: false
            referencedRelation: "ship_types"
            referencedColumns: ["id"]
          },
        ]
      }
      fleets: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          points_budget: number
          revision: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          points_budget?: number
          revision?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          points_budget?: number
          revision?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ship_types: {
        Row: {
          armor: number
          cbt_speed: number
          class: string
          fighter_bay: number
          fighter_storage: number
          ground_invasion: number
          gun_ship_link: number
          gunship_storage: number
          hull: number
          hull_class: string
          id: string
          laser_10cm: number
          laser_14cm: number
          laser_2_5cm: number
          laser_20cm: number
          laser_28cm: number
          laser_4_5cm: number
          laser_50cm: number
          laser_6_5cm: number
          maintenance: number
          map_speed: number
          missile_100kg: number
          missile_10kg: number
          missile_50kg: number
          missile_half_kt: number
          name: string
          point_cost: number
          repair_pod: number
          scout_sensors: number
          sensor_rating: number
          ship_id: string | null
          supply_pod: number
          target_preference: string
        }
        Insert: {
          armor?: number
          cbt_speed?: number
          class: string
          fighter_bay?: number
          fighter_storage?: number
          ground_invasion?: number
          gun_ship_link?: number
          gunship_storage?: number
          hull: number
          hull_class: string
          id?: string
          laser_10cm?: number
          laser_14cm?: number
          laser_2_5cm?: number
          laser_20cm?: number
          laser_28cm?: number
          laser_4_5cm?: number
          laser_50cm?: number
          laser_6_5cm?: number
          maintenance?: number
          map_speed?: number
          missile_100kg?: number
          missile_10kg?: number
          missile_50kg?: number
          missile_half_kt?: number
          name: string
          point_cost: number
          repair_pod?: number
          scout_sensors?: number
          sensor_rating?: number
          ship_id?: string | null
          supply_pod?: number
          target_preference?: string
        }
        Update: {
          armor?: number
          cbt_speed?: number
          class?: string
          fighter_bay?: number
          fighter_storage?: number
          ground_invasion?: number
          gun_ship_link?: number
          gunship_storage?: number
          hull?: number
          hull_class?: string
          id?: string
          laser_10cm?: number
          laser_14cm?: number
          laser_2_5cm?: number
          laser_20cm?: number
          laser_28cm?: number
          laser_4_5cm?: number
          laser_50cm?: number
          laser_6_5cm?: number
          maintenance?: number
          map_speed?: number
          missile_100kg?: number
          missile_10kg?: number
          missile_50kg?: number
          missile_half_kt?: number
          name?: string
          point_cost?: number
          repair_pod?: number
          scout_sensors?: number
          sensor_rating?: number
          ship_id?: string | null
          supply_pod?: number
          target_preference?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weapons: {
        Row: {
          armor_penetration: number
          created_at: string
          damage: number
          hit_chance: number
          id: string
          name: string
          point_cost: number
          range: string
          rate_of_fire: number
          special_notes: string | null
          type: string
          updated_at: string
        }
        Insert: {
          armor_penetration?: number
          created_at?: string
          damage?: number
          hit_chance?: number
          id?: string
          name: string
          point_cost?: number
          range?: string
          rate_of_fire?: number
          special_notes?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          armor_penetration?: number
          created_at?: string
          damage?: number
          hit_chance?: number
          id?: string
          name?: string
          point_cost?: number
          range?: string
          rate_of_fire?: number
          special_notes?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
