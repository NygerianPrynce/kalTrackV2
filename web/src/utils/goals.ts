import { NutritionGoals, DEFAULT_GOALS } from '../types'

const GOALS_STORAGE_KEY = 'NUTRITION_GOALS_V1'

export function getGoals(): NutritionGoals {
  try {
    const stored = localStorage.getItem(GOALS_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('Failed to load goals from localStorage:', error)
  }
  return { ...DEFAULT_GOALS }
}

export function saveGoals(goals: NutritionGoals): void {
  try {
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals))
  } catch (error) {
    console.error('Failed to save goals to localStorage:', error)
    throw error
  }
}
