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
      ai_decision_log: {
        Row: {
          created_at: string
          details_json: Json
          game_id: string
          id: string
          phase: string
          player_id: string
          summary: string
          turn_number: number
        }
        Insert: {
          created_at?: string
          details_json?: Json
          game_id: string
          id?: string
          phase: string
          player_id: string
          summary?: string
          turn_number?: number
        }
        Update: {
          created_at?: string
          details_json?: Json
          game_id?: string
          id?: string
          phase?: string
          player_id?: string
          summary?: string
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_decision_log_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decision_log_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_goals: {
        Row: {
          created_at: string
          created_turn: number
          game_id: string
          goal_type: string
          id: string
          parent_goal_id: string | null
          player_id: string
          priority: number
          resolved_turn: number | null
          status: string
          target_json: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_turn?: number
          game_id: string
          goal_type: string
          id?: string
          parent_goal_id?: string | null
          player_id: string
          priority?: number
          resolved_turn?: number | null
          status?: string
          target_json?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_turn?: number
          game_id?: string
          goal_type?: string
          id?: string
          parent_goal_id?: string | null
          player_id?: string
          priority?: number
          resolved_turn?: number | null
          status?: string
          target_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_goals_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_goals_parent_goal_id_fkey"
            columns: ["parent_goal_id"]
            isOneToOne: false
            referencedRelation: "ai_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_goals_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_persona_goal_weights: {
        Row: {
          base_weight: number
          created_at: string
          goal_type: string
          id: string
          persona_id: string
          threshold_json: Json
          updated_at: string
          urgency_multiplier: number
        }
        Insert: {
          base_weight?: number
          created_at?: string
          goal_type: string
          id?: string
          persona_id: string
          threshold_json?: Json
          updated_at?: string
          urgency_multiplier?: number
        }
        Update: {
          base_weight?: number
          created_at?: string
          goal_type?: string
          id?: string
          persona_id?: string
          threshold_json?: Json
          updated_at?: string
          urgency_multiplier?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_persona_goal_weights_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "ai_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_personas: {
        Row: {
          aggression: number
          created_at: string
          description: string
          diplomacy: number
          economic_focus: number
          expansionism: number
          id: string
          loyalty: number
          model_key: string
          name: string
          paranoia: number
          risk_tolerance: number
          system_prompt: string
          updated_at: string
        }
        Insert: {
          aggression?: number
          created_at?: string
          description?: string
          diplomacy?: number
          economic_focus?: number
          expansionism?: number
          id?: string
          loyalty?: number
          model_key?: string
          name: string
          paranoia?: number
          risk_tolerance?: number
          system_prompt?: string
          updated_at?: string
        }
        Update: {
          aggression?: number
          created_at?: string
          description?: string
          diplomacy?: number
          economic_focus?: number
          expansionism?: number
          id?: string
          loyalty?: number
          model_key?: string
          name?: string
          paranoia?: number
          risk_tolerance?: number
          system_prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_plan_steps: {
        Row: {
          created_at: string
          executed_turn: number | null
          id: string
          payload_json: Json
          plan_id: string
          scheduled_turn: number
          status: string
          step_order: number
          step_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          executed_turn?: number | null
          id?: string
          payload_json?: Json
          plan_id: string
          scheduled_turn?: number
          status?: string
          step_order?: number
          step_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          executed_turn?: number | null
          id?: string
          payload_json?: Json
          plan_id?: string
          scheduled_turn?: number
          status?: string
          step_order?: number
          step_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_plan_steps_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "ai_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_plans: {
        Row: {
          created_at: string
          created_turn: number
          game_id: string
          goal_id: string
          id: string
          player_id: string
          rationale: string
          status: string
          target_completion_turn: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_turn?: number
          game_id: string
          goal_id: string
          id?: string
          player_id: string
          rationale?: string
          status?: string
          target_completion_turn?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_turn?: number
          game_id?: string
          goal_id?: string
          id?: string
          player_id?: string
          rationale?: string
          status?: string
          target_completion_turn?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_plans_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_plans_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "ai_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_plans_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_relationship_events: {
        Row: {
          created_at: string
          details_json: Json
          event_type: string
          fear_delta: number
          game_id: string
          id: string
          opinion_delta: number
          player_id: string
          target_player_id: string
          trust_delta: number
          turn_number: number
        }
        Insert: {
          created_at?: string
          details_json?: Json
          event_type: string
          fear_delta?: number
          game_id: string
          id?: string
          opinion_delta?: number
          player_id: string
          target_player_id: string
          trust_delta?: number
          turn_number?: number
        }
        Update: {
          created_at?: string
          details_json?: Json
          event_type?: string
          fear_delta?: number
          game_id?: string
          id?: string
          opinion_delta?: number
          player_id?: string
          target_player_id?: string
          trust_delta?: number
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_relationship_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_relationship_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_relationship_events_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_relationships: {
        Row: {
          created_at: string
          fear: number
          game_id: string
          id: string
          last_interaction_turn: number
          notes_json: Json
          opinion: number
          player_id: string
          target_player_id: string
          trust: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fear?: number
          game_id: string
          id?: string
          last_interaction_turn?: number
          notes_json?: Json
          opinion?: number
          player_id: string
          target_player_id: string
          trust?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fear?: number
          game_id?: string
          id?: string
          last_interaction_turn?: number
          notes_json?: Json
          opinion?: number
          player_id?: string
          target_player_id?: string
          trust?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_relationships_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_relationships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_relationships_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_world_beliefs: {
        Row: {
          belief_key: string
          confidence: number
          created_at: string
          game_id: string
          id: string
          player_id: string
          turn_number: number
          updated_at: string
          value_json: Json
        }
        Insert: {
          belief_key: string
          confidence?: number
          created_at?: string
          game_id: string
          id?: string
          player_id: string
          turn_number?: number
          updated_at?: string
          value_json?: Json
        }
        Update: {
          belief_key?: string
          confidence?: number
          created_at?: string
          game_id?: string
          id?: string
          player_id?: string
          turn_number?: number
          updated_at?: string
          value_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_world_beliefs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_world_beliefs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          default_map_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          default_map_id?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          default_map_id?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_default_map_id_fkey"
            columns: ["default_map_id"]
            isOneToOne: false
            referencedRelation: "saved_maps"
            referencedColumns: ["id"]
          },
        ]
      }
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
      blog_posts: {
        Row: {
          author_id: string
          content: string
          cover_image_url: string | null
          created_at: string
          excerpt: string
          id: string
          mailed_at: string | null
          mailed_count: number
          published: boolean
          published_at: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          mailed_at?: string | null
          mailed_count?: number
          published?: boolean
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          mailed_at?: string | null
          mailed_count?: number
          published?: boolean
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
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
      cutscene_slides: {
        Row: {
          created_at: string
          cutscene_id: string
          fade_in_ms: number
          fade_out_ms: number
          hold_ms: number
          id: string
          image_url: string | null
          order_index: number
          slug_delay_ms: number
          text: string
          text_2: string
          text_3: string
          updated_at: string
          word_speed_ms: number
        }
        Insert: {
          created_at?: string
          cutscene_id: string
          fade_in_ms?: number
          fade_out_ms?: number
          hold_ms?: number
          id?: string
          image_url?: string | null
          order_index?: number
          slug_delay_ms?: number
          text?: string
          text_2?: string
          text_3?: string
          updated_at?: string
          word_speed_ms?: number
        }
        Update: {
          created_at?: string
          cutscene_id?: string
          fade_in_ms?: number
          fade_out_ms?: number
          hold_ms?: number
          id?: string
          image_url?: string | null
          order_index?: number
          slug_delay_ms?: number
          text?: string
          text_2?: string
          text_3?: string
          updated_at?: string
          word_speed_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "cutscene_slides_cutscene_id_fkey"
            columns: ["cutscene_id"]
            isOneToOne: false
            referencedRelation: "cutscenes"
            referencedColumns: ["id"]
          },
        ]
      }
      cutscenes: {
        Row: {
          audio_url: string | null
          audio_volume: number
          created_at: string
          created_by: string
          description: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          audio_url?: string | null
          audio_volume?: number
          created_at?: string
          created_by: string
          description?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          audio_url?: string | null
          audio_volume?: number
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_suppressions: {
        Row: {
          created_at: string
          email: string
          id: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          reason?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          reason?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      facility_types: {
        Row: {
          condition_bonus: number
          construction_kickback: number
          consumed_facility_id: string | null
          cost: number
          created_at: string
          description: string
          fighter_capacity: number
          ground_defense_bonus: number
          gunship_capacity: number
          icon: string
          id: string
          maintenance: number
          max_per_system: number
          max_ship_hull_class: string | null
          name: string
          ship_build_capacity: number
          survey_bonus: number
          synod: boolean
          tribute_flat: number
          tribute_percent: number
          turns_to_build: number
          updated_at: string
        }
        Insert: {
          condition_bonus?: number
          construction_kickback?: number
          consumed_facility_id?: string | null
          cost?: number
          created_at?: string
          description?: string
          fighter_capacity?: number
          ground_defense_bonus?: number
          gunship_capacity?: number
          icon?: string
          id?: string
          maintenance?: number
          max_per_system?: number
          max_ship_hull_class?: string | null
          name: string
          ship_build_capacity?: number
          survey_bonus?: number
          synod?: boolean
          tribute_flat?: number
          tribute_percent?: number
          turns_to_build?: number
          updated_at?: string
        }
        Update: {
          condition_bonus?: number
          construction_kickback?: number
          consumed_facility_id?: string | null
          cost?: number
          created_at?: string
          description?: string
          fighter_capacity?: number
          ground_defense_bonus?: number
          gunship_capacity?: number
          icon?: string
          id?: string
          maintenance?: number
          max_per_system?: number
          max_ship_hull_class?: string | null
          name?: string
          ship_build_capacity?: number
          survey_bonus?: number
          synod?: boolean
          tribute_flat?: number
          tribute_percent?: number
          turns_to_build?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_types_consumed_facility_id_fkey"
            columns: ["consumed_facility_id"]
            isOneToOne: false
            referencedRelation: "facility_types"
            referencedColumns: ["id"]
          },
        ]
      }
      factions: {
        Row: {
          ai_persona_id: string | null
          code_name: string
          color: string
          created_at: string
          fleet_naming_convention: string
          fleet_naming_convention_id: string | null
          id: string
          name: string
          planet_naming_convention: string
          planet_naming_convention_id: string | null
          updated_at: string
        }
        Insert: {
          ai_persona_id?: string | null
          code_name: string
          color?: string
          created_at?: string
          fleet_naming_convention?: string
          fleet_naming_convention_id?: string | null
          id?: string
          name: string
          planet_naming_convention?: string
          planet_naming_convention_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_persona_id?: string | null
          code_name?: string
          color?: string
          created_at?: string
          fleet_naming_convention?: string
          fleet_naming_convention_id?: string | null
          id?: string
          name?: string
          planet_naming_convention?: string
          planet_naming_convention_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factions_fleet_naming_convention_id_fkey"
            columns: ["fleet_naming_convention_id"]
            isOneToOne: false
            referencedRelation: "naming_conventions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factions_planet_naming_convention_id_fkey"
            columns: ["planet_naming_convention_id"]
            isOneToOne: false
            referencedRelation: "naming_conventions"
            referencedColumns: ["id"]
          },
        ]
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
      fleet_size_categories: {
        Row: {
          created_at: string
          descriptor: string
          id: string
          max_points: number
          min_points: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          descriptor: string
          id?: string
          max_points?: number
          min_points?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          descriptor?: string
          id?: string
          max_points?: number
          min_points?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      fleets: {
        Row: {
          created_at: string
          current_ground_invasion: number
          current_supply: number
          id: string
          name: string
          next_readiness: number | null
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
          current_ground_invasion?: number
          current_supply?: number
          id?: string
          name: string
          next_readiness?: number | null
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
          current_ground_invasion?: number
          current_supply?: number
          id?: string
          name?: string
          next_readiness?: number | null
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
      game_fleet_ships: {
        Row: {
          crippled: boolean
          current_hp: number | null
          game_fleet_id: string
          id: string
          notes: string | null
          quantity: number
          ship_type_id: string
          tactical_group: string
        }
        Insert: {
          crippled?: boolean
          current_hp?: number | null
          game_fleet_id: string
          id?: string
          notes?: string | null
          quantity?: number
          ship_type_id: string
          tactical_group?: string
        }
        Update: {
          crippled?: boolean
          current_hp?: number | null
          game_fleet_id?: string
          id?: string
          notes?: string | null
          quantity?: number
          ship_type_id?: string
          tactical_group?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_fleet_ships_game_fleet_id_fkey"
            columns: ["game_fleet_id"]
            isOneToOne: false
            referencedRelation: "game_fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_fleet_ships_ship_type_id_fkey"
            columns: ["ship_type_id"]
            isOneToOne: false
            referencedRelation: "ship_types"
            referencedColumns: ["id"]
          },
        ]
      }
      game_fleets: {
        Row: {
          created_at: string
          fleet_id: string
          fleet_name: string
          game_id: string
          hex_x: number
          hex_y: number
          id: string
          is_garrison: boolean
          owner_classification: string
          system_id: number | null
        }
        Insert: {
          created_at?: string
          fleet_id: string
          fleet_name?: string
          game_id: string
          hex_x?: number
          hex_y?: number
          id?: string
          is_garrison?: boolean
          owner_classification?: string
          system_id?: number | null
        }
        Update: {
          created_at?: string
          fleet_id?: string
          fleet_name?: string
          game_id?: string
          hex_x?: number
          hex_y?: number
          id?: string
          is_garrison?: boolean
          owner_classification?: string
          system_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_fleets_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_fleets_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_logs: {
        Row: {
          created_at: string
          details_json: Json
          game_id: string
          id: string
          log_type: string
          message: string
          phase: string
          turn_number: number
        }
        Insert: {
          created_at?: string
          details_json?: Json
          game_id: string
          id?: string
          log_type?: string
          message?: string
          phase?: string
          turn_number?: number
        }
        Update: {
          created_at?: string
          details_json?: Json
          game_id?: string
          id?: string
          log_type?: string
          message?: string
          phase?: string
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_logs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          admin_capability: number
          admin_points_remaining: number
          ai_persona_id: string | null
          combat_capability: number
          combat_points_remaining: number
          created_at: string
          faction_id: string | null
          game_id: string
          id: string
          initialized: boolean
          is_ai: boolean
          last_maintenance: number
          last_tribute: number
          orders_locked: boolean
          player_slot: number
          treasury: number
          user_id: string
          visible_system_ids: Json
        }
        Insert: {
          admin_capability?: number
          admin_points_remaining?: number
          ai_persona_id?: string | null
          combat_capability?: number
          combat_points_remaining?: number
          created_at?: string
          faction_id?: string | null
          game_id: string
          id?: string
          initialized?: boolean
          is_ai?: boolean
          last_maintenance?: number
          last_tribute?: number
          orders_locked?: boolean
          player_slot: number
          treasury?: number
          user_id: string
          visible_system_ids?: Json
        }
        Update: {
          admin_capability?: number
          admin_points_remaining?: number
          ai_persona_id?: string | null
          combat_capability?: number
          combat_points_remaining?: number
          created_at?: string
          faction_id?: string | null
          game_id?: string
          id?: string
          initialized?: boolean
          is_ai?: boolean
          last_maintenance?: number
          last_tribute?: number
          orders_locked?: boolean
          player_slot?: number
          treasury?: number
          user_id?: string
          visible_system_ids?: Json
        }
        Relationships: [
          {
            foreignKeyName: "game_players_ai_persona_id_fkey"
            columns: ["ai_persona_id"]
            isOneToOne: false
            referencedRelation: "ai_personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_faction_id_fkey"
            columns: ["faction_id"]
            isOneToOne: false
            referencedRelation: "factions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_snapshots: {
        Row: {
          created_at: string
          game_id: string
          id: string
          label: string
          map_data_json: Json
          turn_number: number
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          label?: string
          map_data_json?: Json
          turn_number?: number
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          label?: string
          map_data_json?: Json
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          created_at: string
          created_by: string
          id: string
          map_data_json: Json
          name: string
          status: Database["public"]["Enums"]["game_status"]
          turn_number: number
          turn_phase: Database["public"]["Enums"]["turn_phase"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          map_data_json?: Json
          name: string
          status?: Database["public"]["Enums"]["game_status"]
          turn_number?: number
          turn_phase?: Database["public"]["Enums"]["turn_phase"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          map_data_json?: Json
          name?: string
          status?: Database["public"]["Enums"]["game_status"]
          turn_number?: number
          turn_phase?: Database["public"]["Enums"]["turn_phase"]
          updated_at?: string
        }
        Relationships: []
      }
      ground_combat_outcomes: {
        Row: {
          created_at: string
          damage: number
          description: string
          id: string
          probability: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          damage?: number
          description?: string
          id?: string
          probability?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          damage?: number
          description?: string
          id?: string
          probability?: number
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
      naming_conventions: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          names: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          names?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          names?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      planet_types: {
        Row: {
          created_at: string
          id: string
          max_initial_condition: number
          max_resources: number
          min_initial_condition: number
          min_resources: number
          name: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          max_initial_condition?: number
          max_resources?: number
          min_initial_condition?: number
          min_resources?: number
          name: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          max_initial_condition?: number
          max_resources?: number
          min_initial_condition?: number
          min_resources?: number
          name?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      player_fleet_intel: {
        Row: {
          created_at: string
          enemy_fleet_id: string
          game_id: string
          id: string
          last_seen_turn: number
          observer_player_id: string
          quantity_seen: number
          ship_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enemy_fleet_id: string
          game_id: string
          id?: string
          last_seen_turn?: number
          observer_player_id: string
          quantity_seen?: number
          ship_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enemy_fleet_id?: string
          game_id?: string
          id?: string
          last_seen_turn?: number
          observer_player_id?: string
          quantity_seen?: number
          ship_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_fleet_intel_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_fleet_intel_observer_player_id_fkey"
            columns: ["observer_player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_fleet_intel_ship_type_id_fkey"
            columns: ["ship_type_id"]
            isOneToOne: false
            referencedRelation: "ship_types"
            referencedColumns: ["id"]
          },
        ]
      }
      player_orders: {
        Row: {
          game_id: string
          id: string
          notes: string
          order_json: Json
          order_type: Database["public"]["Enums"]["order_type"]
          player_id: string
          source_plan_step_id: string | null
          submitted_at: string
          turn_number: number
        }
        Insert: {
          game_id: string
          id?: string
          notes?: string
          order_json?: Json
          order_type?: Database["public"]["Enums"]["order_type"]
          player_id: string
          source_plan_step_id?: string | null
          submitted_at?: string
          turn_number: number
        }
        Update: {
          game_id?: string
          id?: string
          notes?: string
          order_json?: Json
          order_type?: Database["public"]["Enums"]["order_type"]
          player_id?: string
          source_plan_step_id?: string | null
          submitted_at?: string
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_orders_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_orders_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_orders_source_plan_step_id_fkey"
            columns: ["source_plan_step_id"]
            isOneToOne: false
            referencedRelation: "ai_plan_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      player_system_intel: {
        Row: {
          created_at: string
          game_id: string
          id: string
          last_seen_turn: number
          observer_player_id: string
          snapshot_json: Json
          system_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          last_seen_turn?: number
          observer_player_id: string
          snapshot_json?: Json
          system_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          last_seen_turn?: number
          observer_player_id?: string
          snapshot_json?: Json
          system_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_system_intel_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_system_intel_observer_player_id_fkey"
            columns: ["observer_player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_games: Json
          admin_notes: string
          billing_plan: string
          created_at: string
          credits_balance: number
          display_name: string | null
          email: string | null
          id: string
          last_game_id: string | null
          last_seen_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_games?: Json
          admin_notes?: string
          billing_plan?: string
          created_at?: string
          credits_balance?: number
          display_name?: string | null
          email?: string | null
          id?: string
          last_game_id?: string | null
          last_seen_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_games?: Json
          admin_notes?: string
          billing_plan?: string
          created_at?: string
          credits_balance?: number
          display_name?: string | null
          email?: string | null
          id?: string
          last_game_id?: string | null
          last_seen_at?: string | null
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
      ship_hull_classes: {
        Row: {
          code: string
          created_at: string
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
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
          laser_heavy: number
          laser_hull_breaker: number
          laser_light: number
          laser_medium: number
          maintenance: number
          map_speed: number
          missile_100kg: number
          missile_10kg: number
          missile_50kg: number
          missile_half_kt: number
          missile_kraken: number
          missile_synod: number
          name: string
          point_cost: number
          repair_pod: number
          scout_sensors: number
          sensor_rating: number
          ship_id: string | null
          supply_pod: number
          synod: boolean
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
          laser_heavy?: number
          laser_hull_breaker?: number
          laser_light?: number
          laser_medium?: number
          maintenance?: number
          map_speed?: number
          missile_100kg?: number
          missile_10kg?: number
          missile_50kg?: number
          missile_half_kt?: number
          missile_kraken?: number
          missile_synod?: number
          name: string
          point_cost: number
          repair_pod?: number
          scout_sensors?: number
          sensor_rating?: number
          ship_id?: string | null
          supply_pod?: number
          synod?: boolean
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
          laser_heavy?: number
          laser_hull_breaker?: number
          laser_light?: number
          laser_medium?: number
          maintenance?: number
          map_speed?: number
          missile_100kg?: number
          missile_10kg?: number
          missile_50kg?: number
          missile_half_kt?: number
          missile_kraken?: number
          missile_synod?: number
          name?: string
          point_cost?: number
          repair_pod?: number
          scout_sensors?: number
          sensor_rating?: number
          ship_id?: string | null
          supply_pod?: number
          synod?: boolean
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
      ships_in_transit: {
        Row: {
          created_at: string
          created_turn: number
          destination_fleet_id: string | null
          game_id: string
          id: string
          origin_system_id: number | null
          owner_classification: string
          quantity: number
          ship_type_id: string
          updated_at: string
          virt_x: number
          virt_y: number
        }
        Insert: {
          created_at?: string
          created_turn?: number
          destination_fleet_id?: string | null
          game_id: string
          id?: string
          origin_system_id?: number | null
          owner_classification?: string
          quantity?: number
          ship_type_id: string
          updated_at?: string
          virt_x?: number
          virt_y?: number
        }
        Update: {
          created_at?: string
          created_turn?: number
          destination_fleet_id?: string | null
          game_id?: string
          id?: string
          origin_system_id?: number | null
          owner_classification?: string
          quantity?: number
          ship_type_id?: string
          updated_at?: string
          virt_x?: number
          virt_y?: number
        }
        Relationships: []
      }
      studio_signups: {
        Row: {
          created_at: string
          email: string
          id: string
          kind: string
          message: string | null
          name: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          kind: string
          message?: string | null
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          kind?: string
          message?: string | null
          name?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
      system_ship_production: {
        Row: {
          cost_paid: number
          created_at: string
          destination_fleet_id: string | null
          destination_hex_x: number | null
          destination_hex_y: number | null
          game_id: string
          id: string
          owner_classification: string
          points_remaining: number
          position: number
          quantity: number
          ship_type_id: string
          system_id: number
          updated_at: string
        }
        Insert: {
          cost_paid?: number
          created_at?: string
          destination_fleet_id?: string | null
          destination_hex_x?: number | null
          destination_hex_y?: number | null
          game_id: string
          id?: string
          owner_classification?: string
          points_remaining?: number
          position?: number
          quantity?: number
          ship_type_id: string
          system_id: number
          updated_at?: string
        }
        Update: {
          cost_paid?: number
          created_at?: string
          destination_fleet_id?: string | null
          destination_hex_x?: number | null
          destination_hex_y?: number | null
          game_id?: string
          id?: string
          owner_classification?: string
          points_remaining?: number
          position?: number
          quantity?: number
          ship_type_id?: string
          system_id?: number
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
          weapon_key: string | null
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
          weapon_key?: string | null
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
          weapon_key?: string | null
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_game_garrisons: { Args: { _game_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "tester" | "opt_in"
      game_status: "setup" | "active" | "paused" | "completed"
      order_type:
        | "fleet_move"
        | "build_facility"
        | "scrap_facility"
        | "set_standing_order"
        | "diplomacy"
        | "other"
        | "set_readiness"
        | "set_strategy"
        | "fleet_composition_change"
      turn_phase: "orders" | "processing"
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
      app_role: ["admin", "user", "tester", "opt_in"],
      game_status: ["setup", "active", "paused", "completed"],
      order_type: [
        "fleet_move",
        "build_facility",
        "scrap_facility",
        "set_standing_order",
        "diplomacy",
        "other",
        "set_readiness",
        "set_strategy",
        "fleet_composition_change",
      ],
      turn_phase: ["orders", "processing"],
    },
  },
} as const
