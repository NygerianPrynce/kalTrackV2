export interface MealItem {
  name: string
  qty: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g?: number
  sodium_mg?: number
}

export interface MealTotals {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g?: number
  sodium_mg?: number
}

export interface MealLog {
  id: string
  created_at: string
  meal_time: string
  raw_text: string
  meal_type: string | null
  totals: MealTotals
  items: MealItem[]
  confidence: number
  assumptions: string[]
}

export interface DailyTotals {
  date: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g?: number
  sodium_mg?: number
}

export interface Last7Avg {
  calories: number
  fiber_g: number
  protein_g: number
}

export interface WaterDay {
  date: string
  water_oz: number
}

export interface WeeklyHits {
  hit_calories: number
  hit_protein: number
  days: number
}

export interface GetLogsResponse {
  logs: MealLog[]
  today_totals: MealTotals
  daily_totals: DailyTotals[]
  last_7_avg: Last7Avg
  water_today?: number
  water_daily?: WaterDay[]
  water_goal_oz?: number
  settings?: UserSettings | null
  streak?: number
  weekly?: WeeklyHits
}

export interface NutritionGoals {
  calories_goal: number
  protein_goal_g: number
  carbs_goal_g: number
  fat_goal_g: number
  fiber_goal_g: number
  sugar_goal_g?: number
  sodium_goal_mg?: number
  water_goal_oz?: number
}

// Mirror of the user_settings row in Supabase
export interface UserSettings extends NutritionGoals {
  id?: number
  water_goal_oz?: number
  timezone?: string
  updated_at?: string
}

export interface DailyTemplate {
  id: string
  created_at?: string
  name: string
  aliases: string[]
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g?: number | null
  sodium_mg?: number | null
  is_active: boolean
  sort_order: number
}

// ----- Workouts -----
export type Muscle =
  | 'chest' | 'shoulders' | 'back' | 'lats' | 'traps' | 'biceps' | 'triceps'
  | 'forearms' | 'abs' | 'obliques' | 'quads' | 'hamstrings' | 'glutes'
  | 'calves' | 'lower_back' | 'cardio'

export interface WorkoutExercise {
  name: string
  muscle_groups: Muscle[]
  sets?: number
  reps?: number
  weight?: number
  weight_unit?: string
  duration_min?: number
  calories?: number
}

export interface WorkoutTotals {
  total_sets: number
  total_reps: number
  total_volume: number
  calories: number
  muscles: Muscle[]
}

export interface WorkoutLog {
  id: string
  created_at: string
  workout_time: string
  raw_text: string
  items: WorkoutExercise[]
  totals: WorkoutTotals
  confidence: number
  assumptions: string[]
}

export interface GetWorkoutsResponse {
  workouts: WorkoutLog[]
  today_muscles: Muscle[]
  week_muscles: Muscle[]
  streak: number
  count: number
}

export const DEFAULT_GOALS: NutritionGoals = {
  calories_goal: 2500,
  protein_goal_g: 180,
  carbs_goal_g: 250,
  fat_goal_g: 80,
  fiber_goal_g: 30,
  water_goal_oz: 64,
}
