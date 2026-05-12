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
          name: string
          survey_bonus: number
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
          name: string
          survey_bonus?: number
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
          name?: string
          survey_bonus?: number
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
          owner_classification: string
        }
        Insert: {
          created_at?: string
          fleet_id: string
          fleet_name?: string
          game_id: string
          hex_x?: number
          hex_y?: number
          id?: string
          owner_classification?: string
        }
        Update: {
          created_at?: string
          fleet_id?: string
          fleet_name?: string
          game_id?: string
          hex_x?: number
          hex_y?: number
          id?: string
          owner_classification?: string
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
          combat_capability: number
          combat_points_remaining: number
          created_at: string
          faction_id: string | null
          game_id: string
          id: string
          initialized: boolean
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
          combat_capability?: number
          combat_points_remaining?: number
          created_at?: string
          faction_id?: string | null
          game_id: string
          id?: string
          initialized?: boolean
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
          combat_capability?: number
          combat_points_remaining?: number
          created_at?: string
          faction_id?: string | null
          game_id?: string
          id?: string
          initialized?: boolean
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
      app_role: ["admin", "user", "tester"],
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
