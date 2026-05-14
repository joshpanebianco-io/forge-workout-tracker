export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      exercises: {
        Row: {
          created_at: string
          equipment: string
          id: string
          muscle: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          equipment: string
          id?: string
          muscle: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          equipment?: string
          id?: string
          muscle?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bodyweight_kg: number | null
          goal: string | null
          handle: string | null
          id: string
          joined_at: string
          name: string | null
          updated_at: string
        }
        Insert: {
          bodyweight_kg?: number | null
          goal?: string | null
          handle?: string | null
          id: string
          joined_at?: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          bodyweight_kg?: number | null
          goal?: string | null
          handle?: string | null
          id?: string
          joined_at?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      routine_exercises: {
        Row: {
          exercise_id: string
          id: string
          position: number
          routine_id: string
          target_reps: string
          target_sets: number
        }
        Insert: {
          exercise_id: string
          id?: string
          position: number
          routine_id: string
          target_reps: string
          target_sets: number
        }
        Update: {
          exercise_id?: string
          id?: string
          position?: number
          routine_id?: string
          target_reps?: string
          target_sets?: number
        }
        Relationships: [
          {
            foreignKeyName: "routine_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_exercises_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          schedule: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          schedule?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          schedule?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sets: {
        Row: {
          done: boolean
          id: string
          reps: number
          rpe: number | null
          set_number: number
          weight_kg: number
          workout_exercise_id: string
        }
        Insert: {
          done?: boolean
          id?: string
          reps?: number
          rpe?: number | null
          set_number: number
          weight_kg?: number
          workout_exercise_id: string
        }
        Update: {
          done?: boolean
          id?: string
          reps?: number
          rpe?: number | null
          set_number?: number
          weight_kg?: number
          workout_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sets_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_exercises: {
        Row: {
          exercise_id: string
          id: string
          notes: string | null
          position: number
          workout_id: string
        }
        Insert: {
          exercise_id: string
          id?: string
          notes?: string | null
          position: number
          workout_id: string
        }
        Update: {
          exercise_id?: string
          id?: string
          notes?: string | null
          position?: number
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          duration_min: number | null
          ended_at: string | null
          id: string
          routine_id: string | null
          started_at: string
          title: string
          user_id: string
          volume_kg: number | null
        }
        Insert: {
          duration_min?: number | null
          ended_at?: string | null
          id?: string
          routine_id?: string | null
          started_at?: string
          title: string
          user_id: string
          volume_kg?: number | null
        }
        Update: {
          duration_min?: number | null
          ended_at?: string | null
          id?: string
          routine_id?: string | null
          started_at?: string
          title?: string
          user_id?: string
          volume_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workouts_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      personal_records: {
        Row: {
          achieved_at: string | null
          estimated_1rm: number | null
          exercise_id: string | null
          reps: number | null
          user_id: string | null
          weight_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
