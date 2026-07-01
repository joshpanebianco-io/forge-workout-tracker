export type MuscleGroup =
  | "Chest" | "Back" | "Shoulders" | "Biceps" | "Triceps"
  | "Quads" | "Hamstrings" | "Glutes" | "Calves" | "Core" | "Full Body"

export type Exercise = {
  id: string
  name: string
  muscle: MuscleGroup
  equipment: "Barbell" | "Dumbbell" | "Machine" | "Cable" | "Bodyweight" | "Kettlebell"
  userId?: string | null
}

export type SetEntry = {
  id: string
  // Server-assigned ordering key, unique per workout_exercise. The next set's
  // number must be derived as max(setNumber)+1 — NOT the array length, which
  // collides with a surviving row's number after a non-last set is deleted
  // (violates UNIQUE(workout_exercise_id, set_number)).
  setNumber: number
  weight: number
  reps: number
  rest?: number
  done: boolean
  isPR?: boolean
}

export type ExerciseLog = {
  id: string
  // Server-assigned ordering key, unique per workout. Same rule as SetEntry:
  // a new exercise's position is max(position)+1, not the array length.
  position: number
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
  // Server ordering key (UNIQUE per user). Carried so a new routine's position
  // is derived as max(position)+1 rather than the list length, which collides
  // with a survivor after a non-last routine is deleted.
  position?: number
}

export type PR = {
  exerciseId: string
  exerciseName: string
  weight: number
  reps: number
  date: string
  estimated1RM: number
}
