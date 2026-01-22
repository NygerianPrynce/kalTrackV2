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

export interface GetLogsResponse {
  logs: MealLog[]
  today_totals: MealTotals
  daily_totals: DailyTotals[]
  last_7_avg: Last7Avg
}

export interface NutritionGoals {
  calories_goal: number
  protein_goal_g: number
  carbs_goal_g: number
  fat_goal_g: number
  fiber_goal_g: number
  sugar_goal_g?: number
  sodium_goal_mg?: number
}

export const DEFAULT_GOALS: NutritionGoals = {
  calories_goal: 2500,
  protein_goal_g: 180,
  carbs_goal_g: 250,
  fat_goal_g: 80,
  fiber_goal_g: 30,
}
