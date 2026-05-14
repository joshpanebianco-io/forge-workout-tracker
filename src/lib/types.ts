export type MuscleGroup =
  | "Chest" | "Back" | "Shoulders" | "Biceps" | "Triceps"
  | "Quads" | "Hamstrings" | "Glutes" | "Calves" | "Core" | "Full Body"

export type Exercise = {
  id: string
  name: string
  muscle: MuscleGroup
  equipment: "Barbell" | "Dumbbell" | "Machine" | "Cable" | "Bodyweight" | "Kettlebell"
}

export type SetEntry = {
  id: string
  weight: number
  reps: number
  rpe?: number
  done: boolean
  isPR?: boolean
}

export type ExerciseLog = {
  id: string
  exercise: Exercise
  sets: SetEntry[]
  notes?: string
}

export type Workout = {
  id: string
  title: string
  date: string // ISO
  durationMin: number
  exercises: ExerciseLog[]
  routineId?: string
  prCount?: number
}

export type Routine = {
  id: string
  name: string
  description: string
  schedule: string
  exercises: { exerciseId: string; sets: number; targetReps: string }[]
  color: string
}

export type PR = {
  exerciseId: string
  exerciseName: string
  weight: number
  reps: number
  date: string
  estimated1RM: number
}
