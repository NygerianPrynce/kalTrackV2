import { GetLogsResponse, UserSettings, DailyTemplate, NutritionGoals, MealItem, MealTotals } from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''

if (!SUPABASE_URL) {
  console.error('VITE_SUPABASE_URL is not set! Please create a .env file with VITE_SUPABASE_URL=https://your-project.supabase.co')
}

const SUPABASE_FUNCTIONS_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : ''

const TZ = () => Intl.DateTimeFormat().resolvedOptions().timeZone

// Shared fetch helper with the same error handling used across the app
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!SUPABASE_URL) {
    throw new Error('Supabase URL not configured. Please set VITE_SUPABASE_URL in your .env file.')
  }
  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!response.ok) {
    const contentType = response.headers.get('content-type')
    if (contentType && !contentType.includes('application/json')) {
      await response.text()
      throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}.`)
    }
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }
  return response.json()
}

export async function getLogs(params?: {
  range?: string
  from?: string
  to?: string
  tz?: string
}): Promise<GetLogsResponse> {
  if (!SUPABASE_URL) {
    throw new Error('Supabase URL not configured. Please set VITE_SUPABASE_URL in your .env file.')
  }

  const searchParams = new URLSearchParams()
  if (params?.range) searchParams.set('range', params.range)
  if (params?.from) searchParams.set('from', params.from)
  if (params?.to) searchParams.set('to', params.to)
  if (params?.tz) searchParams.set('tz', params.tz)

  const url = `${SUPABASE_FUNCTIONS_URL}/get-logs${searchParams.toString() ? `?${searchParams.toString()}` : ''}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    // Check if response is HTML (error page) instead of JSON
    const contentType = response.headers.get('content-type')
    if (contentType && !contentType.includes('application/json')) {
      await response.text() // Read the response to clear it
      throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}. Check that the Edge Function is deployed and the URL is correct.`)
    }
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

// ----- Settings (goals) stored in Supabase -----
export async function getSettings(): Promise<UserSettings> {
  return apiFetch<UserSettings>('settings', { method: 'GET' })
}

export async function updateSettings(
  goals: NutritionGoals & { water_goal_oz?: number }
): Promise<{ ok: boolean; settings: UserSettings }> {
  return apiFetch('settings', { method: 'POST', body: JSON.stringify(goals) })
}

// ----- Daily templates -----
export async function getTemplates(includeInactive = false): Promise<{ templates: DailyTemplate[] }> {
  return apiFetch(`templates${includeInactive ? '?all=1' : ''}`, { method: 'GET' })
}

export async function saveTemplate(
  t: Partial<DailyTemplate> & { action?: 'create' | 'update' }
): Promise<{ ok: boolean; template: DailyTemplate }> {
  return apiFetch('templates', { method: 'POST', body: JSON.stringify(t) })
}

export async function deleteTemplate(id: string): Promise<{ ok: boolean; id: string }> {
  return apiFetch('templates', { method: 'POST', body: JSON.stringify({ action: 'delete', id }) })
}

export async function logTemplate(id: string): Promise<{ ok: boolean; id: string; speech: string }> {
  return apiFetch('log-template', { method: 'POST', body: JSON.stringify({ id, tz: TZ() }) })
}

// ----- Water -----
export async function logWater(amount_oz: number): Promise<{ ok: boolean; amount_oz: number }> {
  return apiFetch('log-water', { method: 'POST', body: JSON.stringify({ amount_oz }) })
}

// ----- Type-to-log: parse first (no save), then confirm -----
export interface MealPreview {
  ok: boolean
  preview: true
  meal_summary: string
  items: MealItem[]
  totals: MealTotals
  confidence: number
  assumptions: string[]
}

export async function previewMeal(text: string): Promise<MealPreview> {
  return apiFetch('log-meal', {
    method: 'POST',
    body: JSON.stringify({ text, preview: true, tz: TZ() }),
  })
}

export async function saveMeal(payload: {
  raw_text: string
  items: MealItem[]
  confidence?: number
  assumptions?: string[]
}): Promise<{ ok: boolean; id: string; totals: MealTotals }> {
  return apiFetch('save-meal', { method: 'POST', body: JSON.stringify({ ...payload, tz: TZ() }) })
}

export async function logMeal(data: {
  text: string
  timestamp?: string
  meal_type?: string
}): Promise<{
  ok: boolean
  id: string
  meal_time: string
  totals: any
  confidence: number
  assumptions: string[]
  speech: string
}> {
  if (!SUPABASE_URL) {
    throw new Error('Supabase URL not configured. Please set VITE_SUPABASE_URL in your .env file.')
  }

  const url = `${SUPABASE_FUNCTIONS_URL}/log-meal`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    // Check if response is HTML (error page) instead of JSON
    const contentType = response.headers.get('content-type')
    if (contentType && !contentType.includes('application/json')) {
      await response.text() // Read the response to clear it
      throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}. Check that the Edge Function is deployed and the URL is correct.`)
    }
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

export async function deleteMeal(id: string): Promise<{ ok: boolean; id: string }> {
  if (!SUPABASE_URL) {
    throw new Error('Supabase URL not configured. Please set VITE_SUPABASE_URL in your .env file.')
  }

  const url = `${SUPABASE_FUNCTIONS_URL}/delete-meal`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id }),
  })

  if (!response.ok) {
    const contentType = response.headers.get('content-type')
    if (contentType && !contentType.includes('application/json')) {
      await response.text()
      throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}.`)
    }
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

export async function updateMeal(
  id: string,
  totals: {
    calories?: number
    protein_g?: number
    carbs_g?: number
    fat_g?: number
    fiber_g?: number
    sugar_g?: number
    sodium_mg?: number
  }
): Promise<{ ok: boolean; data: any }> {
  if (!SUPABASE_URL) {
    throw new Error('Supabase URL not configured. Please set VITE_SUPABASE_URL in your .env file.')
  }

  const url = `${SUPABASE_FUNCTIONS_URL}/update-meal`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, totals }),
  })

  if (!response.ok) {
    const contentType = response.headers.get('content-type')
    if (contentType && !contentType.includes('application/json')) {
      await response.text()
      throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}.`)
    }
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}
