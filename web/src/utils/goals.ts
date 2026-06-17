import { NutritionGoals, DEFAULT_GOALS } from '../types'
import { getSettings, updateSettings } from '../api'

const GOALS_CACHE_KEY = 'NUTRITION_GOALS_V2'

// Synchronous read from the local cache — used for instant initial render.
// Supabase is the source of truth; call refreshGoals() to sync.
export function getGoals(): NutritionGoals {
  try {
    const stored = localStorage.getItem(GOALS_CACHE_KEY)
    if (stored) return { ...DEFAULT_GOALS, ...JSON.parse(stored) }
  } catch (error) {
    console.error('Failed to load cached goals:', error)
  }
  return { ...DEFAULT_GOALS }
}

function cacheGoals(goals: NutritionGoals): void {
  try {
    localStorage.setItem(GOALS_CACHE_KEY, JSON.stringify(goals))
  } catch (error) {
    console.error('Failed to cache goals:', error)
  }
  window.dispatchEvent(new CustomEvent('goalsUpdated'))
}

function settingsToGoals(s: any): NutritionGoals {
  return {
    calories_goal: Number(s.calories_goal),
    protein_goal_g: Number(s.protein_goal_g),
    carbs_goal_g: Number(s.carbs_goal_g),
    fat_goal_g: Number(s.fat_goal_g),
    fiber_goal_g: Number(s.fiber_goal_g),
    sugar_goal_g: s.sugar_goal_g != null ? Number(s.sugar_goal_g) : undefined,
    sodium_goal_mg: s.sodium_goal_mg != null ? Number(s.sodium_goal_mg) : undefined,
    water_goal_oz: s.water_goal_oz != null ? Number(s.water_goal_oz) : DEFAULT_GOALS.water_goal_oz,
  }
}

// Fetch the authoritative goals from Supabase and update the cache.
export async function refreshGoals(): Promise<NutritionGoals> {
  const settings = await getSettings()
  const goals = settingsToGoals(settings)
  cacheGoals(goals)
  return goals
}

// Persist goals to Supabase, then update the cache.
export async function saveGoals(goals: NutritionGoals): Promise<void> {
  await updateSettings(goals)
  cacheGoals(goals)
}
