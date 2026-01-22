import { GetLogsResponse } from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''

if (!SUPABASE_URL) {
  console.error('VITE_SUPABASE_URL is not set! Please create a .env file with VITE_SUPABASE_URL=https://your-project.supabase.co')
}

const SUPABASE_FUNCTIONS_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : ''

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
