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
      battle_phases: {
        Row: {
          created_at: string
          groups_a: string[]
          groups_b: string[]
          id: string
          mod_a: number
          mod_b: number
          name: string
          required_group: string | null
          seq_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          groups_a?: string[]
          groups_b?: string[]
          id?: string
          mod_a?: number
          mod_b?: number
          name: string
          required_group?: string | null
          seq_order: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          groups_a?: string[]
          groups_b?: string[]
          id?: string
          mod_a?: number
          mod_b?: number
          name?: string
          required_group?: string | null
          seq_order?: number
          updated_at?: string
        }
        Relationships: []
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
      combat_constants: {
        Row: {
          created_at: string
          description: string
          id: string
          key: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          key: string
          updated_at?: string
          value?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          key?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      facility_types: {
        Row: {
          condition_bonus: number
          cost: number
          created_at: string
          description: string
          ground_defense_bonus: number
          icon: string
          id: string
          maintenance: number
          name: string
          survey_bonus: number
          tribute_flat: number
          tribute_percent: number
          updated_at: string
        }
        Insert: {
          condition_bonus?: number
          cost?: number
          created_at?: string
          description?: string
          ground_defense_bonus?: number
          icon?: string
          id?: string
          maintenance?: number
          name: string
          survey_bonus?: number
          tribute_flat?: number
          tribute_percent?: number
          updated_at?: string
        }
        Update: {
          condition_bonus?: number
          cost?: number
          created_at?: string
          description?: string
          ground_defense_bonus?: number
          icon?: string
          id?: string
          maintenance?: number
          name?: string
          survey_bonus?: number
          tribute_flat?: number
          tribute_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      factions: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
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
          readiness: number
          revision: number
          special1_role: string
          special2_role: string
          standing_order: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          points_budget?: number
          readiness?: number
          revision?: number
          special1_role?: string
          special2_role?: string
          standing_order?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          points_budget?: number
          readiness?: number
          revision?: number
          special1_role?: string
          special2_role?: string
          standing_order?: string
          updated_at?: string
        }
        Relationships: []
      }
      ground_combat_outcomes: {
        Row: {
          casualties_inflicted: number
          created_at: string
          description: string
          id: string
          max_force: number
          min_force: number
          updated_at: string
        }
        Insert: {
          casualties_inflicted?: number
          created_at?: string
          description?: string
          id?: string
          max_force?: number
          min_force?: number
          updated_at?: string
        }
        Update: {
          casualties_inflicted?: number
          created_at?: string
          description?: string
          id?: string
          max_force?: number
          min_force?: number
          updated_at?: string
        }
        Relationships: []
      }
      group_modifiers: {
        Row: {
          attack_mod: number
          created_at: string
          defense_mod: number
          group_name: string
          id: string
          updated_at: string
        }
        Insert: {
          attack_mod?: number
          created_at?: string
          defense_mod?: number
          group_name: string
          id?: string
          updated_at?: string
        }
        Update: {
          attack_mod?: number
          created_at?: string
          defense_mod?: number
          group_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_maps: {
        Row: {
          created_at: string
          file_path: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          name?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          name?: string
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
          flavor_description: string
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
          virtual_atk_speed_attack: number
          virtual_atk_speed_attack_planet: number
          virtual_atk_speed_core: number
          virtual_atk_speed_cover_retreat: number
          virtual_atk_speed_flank: number
          virtual_atk_speed_outflank: number
          virtual_atk_speed_rear: number
          virtual_atk_speed_retreat: number
          virtual_atk_speed_skirmish: number
          virtual_def_speed_attack: number
          virtual_def_speed_attack_planet: number
          virtual_def_speed_core: number
          virtual_def_speed_cover_retreat: number
          virtual_def_speed_flank: number
          virtual_def_speed_outflank: number
          virtual_def_speed_rear: number
          virtual_def_speed_retreat: number
          virtual_def_speed_skirmish: number
        }
        Insert: {
          armor?: number
          cbt_speed?: number
          class: string
          fighter_bay?: number
          fighter_storage?: number
          flavor_description?: string
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
          virtual_atk_speed_attack?: number
          virtual_atk_speed_attack_planet?: number
          virtual_atk_speed_core?: number
          virtual_atk_speed_cover_retreat?: number
          virtual_atk_speed_flank?: number
          virtual_atk_speed_outflank?: number
          virtual_atk_speed_rear?: number
          virtual_atk_speed_retreat?: number
          virtual_atk_speed_skirmish?: number
          virtual_def_speed_attack?: number
          virtual_def_speed_attack_planet?: number
          virtual_def_speed_core?: number
          virtual_def_speed_cover_retreat?: number
          virtual_def_speed_flank?: number
          virtual_def_speed_outflank?: number
          virtual_def_speed_rear?: number
          virtual_def_speed_retreat?: number
          virtual_def_speed_skirmish?: number
        }
        Update: {
          armor?: number
          cbt_speed?: number
          class?: string
          fighter_bay?: number
          fighter_storage?: number
          flavor_description?: string
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
          virtual_atk_speed_attack?: number
          virtual_atk_speed_attack_planet?: number
          virtual_atk_speed_core?: number
          virtual_atk_speed_cover_retreat?: number
          virtual_atk_speed_flank?: number
          virtual_atk_speed_outflank?: number
          virtual_atk_speed_rear?: number
          virtual_atk_speed_retreat?: number
          virtual_atk_speed_skirmish?: number
          virtual_def_speed_attack?: number
          virtual_def_speed_attack_planet?: number
          virtual_def_speed_core?: number
          virtual_def_speed_cover_retreat?: number
          virtual_def_speed_flank?: number
          virtual_def_speed_outflank?: number
          virtual_def_speed_rear?: number
          virtual_def_speed_retreat?: number
          virtual_def_speed_skirmish?: number
        }
        Relationships: []
      }
      system_actions: {
        Row: {
          created_at: string
          description: string
          icon: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          icon?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          icon?: string
          id?: string
          name?: string
          updated_at?: string
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
      weapon_target_preferences: {
        Row: {
          created_at: string
          hull_class: string
          id: string
          priority: number
          updated_at: string
          weapon_key: string
        }
        Insert: {
          created_at?: string
          hull_class: string
          id?: string
          priority?: number
          updated_at?: string
          weapon_key: string
        }
        Update: {
          created_at?: string
          hull_class?: string
          id?: string
          priority?: number
          updated_at?: string
          weapon_key?: string
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
      wiki_pages: {
        Row: {
          content: string
          created_at: string
          id: string
          parent_slug: string | null
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          parent_slug?: string | null
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parent_slug?: string | null
          slug?: string
          sort_order?: number
          title?: string
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
      app_role: "admin" | "user" | "tester"
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
      app_role: ["admin", "user", "tester"],
    },
  },
} as const
