import type { Exercise, Workout, Routine, PR } from "./types"

export const exercises: Exercise[] = [
  { id: "ex-1", name: "Barbell Bench Press", muscle: "Chest", equipment: "Barbell" },
  { id: "ex-2", name: "Incline Dumbbell Press", muscle: "Chest", equipment: "Dumbbell" },
  { id: "ex-3", name: "Cable Fly", muscle: "Chest", equipment: "Cable" },
  { id: "ex-4", name: "Tricep Pushdown", muscle: "Triceps", equipment: "Cable" },
  { id: "ex-5", name: "Overhead Press", muscle: "Shoulders", equipment: "Barbell" },
  { id: "ex-6", name: "Lateral Raise", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "ex-7", name: "Back Squat", muscle: "Quads", equipment: "Barbell" },
  { id: "ex-8", name: "Romanian Deadlift", muscle: "Hamstrings", equipment: "Barbell" },
  { id: "ex-9", name: "Leg Press", muscle: "Quads", equipment: "Machine" },
  { id: "ex-10", name: "Pull Up", muscle: "Back", equipment: "Bodyweight" },
  { id: "ex-11", name: "Barbell Row", muscle: "Back", equipment: "Barbell" },
  { id: "ex-12", name: "Lat Pulldown", muscle: "Back", equipment: "Cable" },
  { id: "ex-13", name: "Barbell Curl", muscle: "Biceps", equipment: "Barbell" },
]

const today = new Date()
const iso = (daysAgo: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}

export const todayWorkout: Workout = {
  id: "w-today",
  title: "Push Day",
  date: iso(0),
  durationMin: 38,
  routineId: "r-1",
  prCount: 1,
  exercises: [
    {
      id: "el-1",
      position: 1,
      exercise: exercises[0],
      sets: [
        { id: "s1", setNumber: 1, weight: 60, reps: 10, done: true },
        { id: "s2", setNumber: 2, weight: 80, reps: 8, done: true },
        { id: "s3", setNumber: 3, weight: 100, reps: 8, done: true, isPR: true },
        { id: "s4", setNumber: 4, weight: 100, reps: 7, done: true },
        { id: "s5", setNumber: 5, weight: 100, reps: 6, done: false },
      ],
    },
    {
      id: "el-2",
      position: 2,
      exercise: exercises[1],
      sets: [
        { id: "s6", setNumber: 1, weight: 30, reps: 10, done: true },
        { id: "s7", setNumber: 2, weight: 32.5, reps: 9, done: true },
        { id: "s8", setNumber: 3, weight: 32.5, reps: 8, done: false },
      ],
    },
    {
      id: "el-3",
      position: 3,
      exercise: exercises[4],
      sets: [
        { id: "s9", setNumber: 1, weight: 50, reps: 8, done: false },
        { id: "s10", setNumber: 2, weight: 50, reps: 8, done: false },
        { id: "s11", setNumber: 3, weight: 50, reps: 8, done: false },
      ],
    },
  ],
}

export const recentWorkouts: Workout[] = [
  todayWorkout,
  {
    id: "w-1", title: "Pull Day", date: iso(2), durationMin: 52, prCount: 0,
    exercises: [
      { id: "p1", position: 1, exercise: exercises[10], sets: Array.from({ length: 4 }, (_, i) => ({ id: `p1s${i}`, setNumber: i + 1, weight: 80, reps: 8, done: true })) },
      { id: "p2", position: 2, exercise: exercises[9], sets: Array.from({ length: 3 }, (_, i) => ({ id: `p2s${i}`, setNumber: i + 1, weight: 0, reps: 10, done: true })) },
      { id: "p3", position: 3, exercise: exercises[12], sets: Array.from({ length: 3 }, (_, i) => ({ id: `p3s${i}`, setNumber: i + 1, weight: 30, reps: 12, done: true })) },
    ],
  },
  {
    id: "w-2", title: "Leg Day", date: iso(4), durationMin: 64, prCount: 2,
    exercises: [
      { id: "l1", position: 1, exercise: exercises[6], sets: Array.from({ length: 5 }, (_, i) => ({ id: `l1s${i}`, setNumber: i + 1, weight: 120, reps: 5, done: true, isPR: i === 2 })) },
      { id: "l2", position: 2, exercise: exercises[7], sets: Array.from({ length: 4 }, (_, i) => ({ id: `l2s${i}`, setNumber: i + 1, weight: 100, reps: 8, done: true })) },
      { id: "l3", position: 3, exercise: exercises[8], sets: Array.from({ length: 3 }, (_, i) => ({ id: `l3s${i}`, setNumber: i + 1, weight: 200, reps: 10, done: true })) },
    ],
  },
  {
    id: "w-3", title: "Push Day", date: iso(7), durationMin: 45, prCount: 1,
    exercises: [
      { id: "h1", position: 1, exercise: exercises[0], sets: Array.from({ length: 4 }, (_, i) => ({ id: `h1s${i}`, setNumber: i + 1, weight: 95, reps: 8, done: true })) },
      { id: "h2", position: 2, exercise: exercises[1], sets: Array.from({ length: 3 }, (_, i) => ({ id: `h2s${i}`, setNumber: i + 1, weight: 30, reps: 10, done: true })) },
    ],
  },
  {
    id: "w-4", title: "Pull Day", date: iso(9), durationMin: 50, prCount: 0,
    exercises: [
      { id: "pp1", position: 1, exercise: exercises[10], sets: Array.from({ length: 4 }, (_, i) => ({ id: `pp1s${i}`, setNumber: i + 1, weight: 80, reps: 8, done: true })) },
    ],
  },
  {
    id: "w-5", title: "Leg Day", date: iso(11), durationMin: 58, prCount: 0,
    exercises: [
      { id: "ll1", position: 1, exercise: exercises[6], sets: Array.from({ length: 4 }, (_, i) => ({ id: `ll1s${i}`, setNumber: i + 1, weight: 115, reps: 6, done: true })) },
    ],
  },
]

export const routines: Routine[] = [
  {
    id: "r-1", name: "Push Day", description: "Chest, shoulders, triceps",
    schedule: "Mon · Thu", color: "from-blue-500 to-indigo-500",
    exercises: [
      { exerciseId: "ex-1", sets: 5, targetReps: "5-8" },
      { exerciseId: "ex-2", sets: 3, targetReps: "8-10" },
      { exerciseId: "ex-5", sets: 3, targetReps: "8" },
      { exerciseId: "ex-6", sets: 3, targetReps: "12-15" },
      { exerciseId: "ex-4", sets: 3, targetReps: "10-12" },
    ],
  },
  {
    id: "r-2", name: "Pull Day", description: "Back, biceps, rear delts",
    schedule: "Tue · Fri", color: "from-sky-400 to-cyan-500",
    exercises: [
      { exerciseId: "ex-11", sets: 4, targetReps: "6-8" },
      { exerciseId: "ex-10", sets: 4, targetReps: "AMRAP" },
      { exerciseId: "ex-12", sets: 3, targetReps: "10-12" },
      { exerciseId: "ex-13", sets: 3, targetReps: "10" },
    ],
  },
  {
    id: "r-3", name: "Leg Day", description: "Quads, hams, glutes, calves",
    schedule: "Wed · Sat", color: "from-indigo-500 to-violet-500",
    exercises: [
      { exerciseId: "ex-7", sets: 5, targetReps: "5" },
      { exerciseId: "ex-8", sets: 4, targetReps: "8" },
      { exerciseId: "ex-9", sets: 3, targetReps: "10-12" },
    ],
  },
]

export const personalRecords: PR[] = [
  { exerciseId: "ex-1", exerciseName: "Barbell Bench Press", weight: 100, reps: 8, date: iso(0), estimated1RM: 124 },
  { exerciseId: "ex-7", exerciseName: "Back Squat", weight: 120, reps: 5, date: iso(4), estimated1RM: 138 },
  { exerciseId: "ex-8", exerciseName: "Romanian Deadlift", weight: 140, reps: 6, date: iso(11), estimated1RM: 166 },
  { exerciseId: "ex-5", exerciseName: "Overhead Press", weight: 60, reps: 5, date: iso(14), estimated1RM: 69 },
  { exerciseId: "ex-11", exerciseName: "Barbell Row", weight: 90, reps: 8, date: iso(16), estimated1RM: 112 },
]

export const weeklyVolumeData = [
  { day: "Mon", volume: 5840 },
  { day: "Tue", volume: 0 },
  { day: "Wed", volume: 9120 },
  { day: "Thu", volume: 6420 },
  { day: "Fri", volume: 0 },
  { day: "Sat", volume: 8740 },
  { day: "Sun", volume: 5210 },
]

export const benchProgressData = [
  { week: "W1", weight: 80 },
  { week: "W2", weight: 85 },
  { week: "W3", weight: 87.5 },
  { week: "W4", weight: 90 },
  { week: "W5", weight: 92.5 },
  { week: "W6", weight: 95 },
  { week: "W7", weight: 97.5 },
  { week: "W8", weight: 100 },
]

export const stats = {
  thisWeek: { workouts: 4, volume: 30130, minutes: 199, prCount: 3 },
  lastWeek: { workouts: 4, volume: 28210, minutes: 187, prCount: 1 },
  streak: 12,
  totalWorkouts: 147,
}

export const user = {
  name: "Josh Panebianco",
  handle: "@joshp",
  weight: 82.4,
  bodyweightChange: -0.6,
  goal: "Strength",
  joined: "Jan 2024",
}
