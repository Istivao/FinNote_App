export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      diet_days: {
        Row: {
          created_at: string;
          day_of_week: number;
          diet_plan_id: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          day_of_week: number;
          diet_plan_id: string;
          id?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          day_of_week?: number;
          diet_plan_id?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "diet_days_diet_plan_id_fkey";
            columns: ["diet_plan_id"];
            isOneToOne: false;
            referencedRelation: "diet_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      diet_meals: {
        Row: {
          created_at: string;
          diet_day_id: string;
          dish: string;
          id: string;
          meal_time: string;
          name: string;
          position: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          diet_day_id: string;
          dish: string;
          id?: string;
          meal_time: string;
          name: string;
          position?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          diet_day_id?: string;
          dish?: string;
          id?: string;
          meal_time?: string;
          name?: string;
          position?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "diet_meals_diet_day_id_fkey";
            columns: ["diet_day_id"];
            isOneToOne: false;
            referencedRelation: "diet_days";
            referencedColumns: ["id"];
          },
        ];
      };
      diet_plans: {
        Row: {
          created_at: string;
          id: string;
          meal_reminders_enabled: boolean;
          updated_at: string;
          user_id: string;
          water_end_time: string;
          water_interval_minutes: number;
          water_reminders_enabled: boolean;
          water_start_time: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          meal_reminders_enabled?: boolean;
          updated_at?: string;
          user_id?: string;
          water_end_time?: string;
          water_interval_minutes?: number;
          water_reminders_enabled?: boolean;
          water_start_time?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          meal_reminders_enabled?: boolean;
          updated_at?: string;
          user_id?: string;
          water_end_time?: string;
          water_interval_minutes?: number;
          water_reminders_enabled?: boolean;
          water_start_time?: string;
        };
        Relationships: [];
      };
      exercises: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          name: string;
          order_index: number;
          reps: number;
          rest_minutes: number;
          sets: number;
          weight_kg: number | null;
          workout_id: string;
        };
        Insert: {
          category?: string;
          created_at?: string;
          id?: string;
          name: string;
          order_index?: number;
          reps?: number;
          rest_minutes?: number;
          sets?: number;
          weight_kg?: number | null;
          workout_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          name?: string;
          order_index?: number;
          reps?: number;
          rest_minutes?: number;
          sets?: number;
          weight_kg?: number | null;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercises_workout_id_fkey";
            columns: ["workout_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          },
        ];
      };
      finance_occurrences: {
        Row: {
          actual_amount_cents: number | null;
          category: string;
          competence_month: string;
          created_at: string;
          direction: string;
          due_on: string;
          id: string;
          notes: string | null;
          planned_amount_cents: number;
          schedule_id: string;
          schedule_type: string;
          sequence_number: number;
          settled_at: string | null;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          actual_amount_cents?: number | null;
          category: string;
          competence_month: string;
          created_at?: string;
          direction: string;
          due_on: string;
          id?: string;
          notes?: string | null;
          planned_amount_cents: number;
          schedule_id: string;
          schedule_type: string;
          sequence_number: number;
          settled_at?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          actual_amount_cents?: number | null;
          category?: string;
          competence_month?: string;
          created_at?: string;
          direction?: string;
          due_on?: string;
          id?: string;
          notes?: string | null;
          planned_amount_cents?: number;
          schedule_id?: string;
          schedule_type?: string;
          sequence_number?: number;
          settled_at?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "finance_occurrences_schedule_user_fkey";
            columns: ["schedule_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "finance_schedules";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      finance_schedules: {
        Row: {
          category: string;
          created_at: string;
          currency_code: string;
          direction: string;
          ends_on: string | null;
          id: string;
          installment_count: number | null;
          interval_months: number | null;
          notes: string | null;
          occurrence_amount_cents: number | null;
          schedule_type: string;
          starts_on: string;
          title: string;
          total_amount_cents: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          currency_code?: string;
          direction: string;
          ends_on?: string | null;
          id?: string;
          installment_count?: number | null;
          interval_months?: number | null;
          notes?: string | null;
          occurrence_amount_cents?: number | null;
          schedule_type: string;
          starts_on: string;
          title: string;
          total_amount_cents?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          currency_code?: string;
          direction?: string;
          ends_on?: string | null;
          id?: string;
          installment_count?: number | null;
          interval_months?: number | null;
          notes?: string | null;
          occurrence_amount_cents?: number | null;
          schedule_type?: string;
          starts_on?: string;
          title?: string;
          total_amount_cents?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      note_items: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          is_checked: boolean;
          note_id: string;
          position: number;
          updated_at: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          is_checked?: boolean;
          note_id: string;
          position: number;
          updated_at?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          is_checked?: boolean;
          note_id?: string;
          position?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "note_items_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      notes: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          kind: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      reminders: {
        Row: {
          color: string;
          created_at: string;
          description: string | null;
          id: string;
          reminder_date: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          reminder_date: string;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          reminder_date?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          completed_at: string | null;
          created_at: string;
          description: string;
          due_at: string;
          id: string;
          priority: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          description: string;
          due_at: string;
          id?: string;
          priority?: string;
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          description?: string;
          due_at?: string;
          id?: string;
          priority?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      run_zone_paces: {
        Row: {
          fast_sec: number;
          slow_sec: number;
          updated_at: string;
          user_id: string;
          zone: string;
        };
        Insert: {
          fast_sec: number;
          slow_sec: number;
          updated_at?: string;
          user_id?: string;
          zone: string;
        };
        Update: {
          fast_sec?: number;
          slow_sec?: number;
          updated_at?: string;
          user_id?: string;
          zone?: string;
        };
        Relationships: [];
      };
      run_blocks: {
        Row: {
          created_at: string;
          id: string;
          intensity: string;
          order_index: number;
          recovery_intensity: string | null;
          recovery_unit: string | null;
          recovery_volume: number | null;
          sets: number;
          volume: number;
          volume_unit: string;
          workout_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          intensity: string;
          order_index: number;
          recovery_intensity?: string | null;
          recovery_unit?: string | null;
          recovery_volume?: number | null;
          sets: number;
          volume: number;
          volume_unit: string;
          workout_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          intensity?: string;
          order_index?: number;
          recovery_intensity?: string | null;
          recovery_unit?: string | null;
          recovery_volume?: number | null;
          sets?: number;
          volume?: number;
          volume_unit?: string;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "run_blocks_workout_id_fkey";
            columns: ["workout_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_types: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind?: string;
          name: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      workouts: {
        Row: {
          created_at: string;
          day_of_week: number;
          id: string;
          name: string;
          user_id: string;
          workout_type_id: string;
        };
        Insert: {
          created_at?: string;
          day_of_week: number;
          id?: string;
          name: string;
          user_id: string;
          workout_type_id: string;
        };
        Update: {
          created_at?: string;
          day_of_week?: number;
          id?: string;
          name?: string;
          user_id?: string;
          workout_type_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workouts_workout_type_fkey";
            columns: ["workout_type_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "workout_types";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_finance_schedule: {
        Args: {
          p_amount_cents: number;
          p_category: string;
          p_direction: string;
          p_ends_on: string | null;
          p_initially_settled: boolean;
          p_installment_count: number | null;
          p_interval_months: number | null;
          p_notes: string | null;
          p_schedule_type: string;
          p_starts_on: string;
          p_title: string;
        };
        Returns: string;
      };
      create_note: {
        Args: {
          p_body: string | null;
          p_items: Json;
          p_kind: string;
          p_title: string;
        };
        Returns: string;
      };
      create_workout_with_exercises: {
        Args: {
          p_day_of_week: number;
          p_exercises: Json | null;
          p_name: string;
          p_run_blocks: Json | null;
          p_workout_type_id: string;
        };
        Returns: string;
      };
      ensure_finance_month: {
        Args: {
          p_month: string;
        };
        Returns: number;
      };
      save_diet_plan: {
        Args: {
          p_days: Json;
          p_expected_updated_at?: string | null;
          p_meal_reminders_enabled: boolean;
          p_water_end_time: string;
          p_water_interval_minutes: number;
          p_water_reminders_enabled: boolean;
          p_water_start_time: string;
        };
        Returns: string;
      };
      set_finance_occurrence_settled: {
        Args: {
          p_expected_updated_at: string;
          p_occurrence_id: string;
          p_settled: boolean;
        };
        Returns: string;
      };
      update_finance_occurrence: {
        Args: {
          p_category: string;
          p_due_on: string;
          p_expected_updated_at: string;
          p_notes: string | null;
          p_occurrence_id: string;
          p_planned_amount_cents: number;
          p_title: string;
        };
        Returns: string;
      };
      update_workout_with_exercises: {
        Args: {
          p_day_of_week: number;
          p_exercises: Json | null;
          p_id: string;
          p_name: string;
          p_run_blocks: Json | null;
          p_workout_type_id: string;
        };
        Returns: string;
      };
      update_note: {
        Args: {
          p_body: string | null;
          p_id: string;
          p_items: Json;
          p_title: string;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
