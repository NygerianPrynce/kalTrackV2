const OPENAI_API_KEY = process.env.OPENAI_API_KEY

// ---------- rounding ----------
export const clamp0 = (n) => Math.max(0, Number(n) || 0)
export const rCal = (n) => Math.round(clamp0(n))
export const rMac = (n) => Math.round(clamp0(n) * 10) / 10

// ---------- meal type by local hour ----------
export function inferMealType(tz = 'America/Chicago') {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date())
  )
  if (hour >= 4 && hour < 11) return 'breakfast'
  if (hour >= 11 && hour < 16) return 'lunch'
  if (hour >= 16 && hour < 22) return 'dinner'
  return 'snack'
}

// ---------- water ----------
function unitToOz(amount, unit) {
  const u = (unit || 'oz').replace(/\s+/g, '').toLowerCase()
  if (/^(floz|oz|ounce|ounces)$/.test(u)) return amount
  if (/^cups?$/.test(u)) return amount * 8
  if (/^glass(es)?$/.test(u)) return amount * 8
  if (/^bottles?$/.test(u)) return amount * 16.9
  if (/^ml$/.test(u)) return amount * 0.033814
  if (/^(l|liters?|litres?)$/.test(u)) return amount * 33.814
  return amount
}

// null if not a water phrase (for the direct log fast-path)
export function parseWaterOz(text) {
  const t = text.toLowerCase()
  if (!/water|hydrat/.test(t)) return null
  const m = t.match(/(\d+(?:\.\d+)?)\s*(fl\s*oz|oz|ounce|ounces|cups?|glass(?:es)?|bottles?|ml|l|liters?|litres?)?/)
  if (!m) {
    if (/glass/.test(t)) return 8
    if (/bottle/.test(t)) return 16.9
    if (/cup/.test(t)) return 8
    return 8
  }
  const amount = parseFloat(m[1])
  if (!Number.isFinite(amount)) return 8
  return unitToOz(amount, m[2] || 'oz')
}

// Pull water out of a meal description, return {oz, cleaned}
export function extractWater(text) {
  let oz = 0
  let cleaned = text
  const withAmount = /(\d+(?:\.\d+)?)\s*(fl\s*oz|oz|ounces?|cups?|glass(?:es)?|bottles?|ml|l|liters?|litres?)?\s*(?:of\s+)?water/gi
  cleaned = cleaned.replace(withAmount, (_m, amt, unit) => {
    const a = parseFloat(amt)
    if (Number.isFinite(a)) oz += unitToOz(a, unit || 'oz')
    return ' '
  })
  const noAmount = /\b(a|an|one)?\s*(glass|bottle|cup)\s*(?:of\s+)?water/gi
  cleaned = cleaned.replace(noAmount, (_m, _art, container) => {
    oz += container.toLowerCase() === 'bottle' ? 16.9 : 8
    return ' '
  })
  if (oz === 0 && /\bwater\b/i.test(cleaned)) {
    oz += 8
    cleaned = cleaned.replace(/\bwater\b/gi, ' ')
  }
  cleaned = cleaned.replace(/\s+(and|with|plus|,|&)\s*$/i, ' ').replace(/^\s*(and|with|plus|,|&)\s+/i, ' ').replace(/\s{2,}/g, ' ').trim()
  return { oz: Math.round(oz * 10) / 10, cleaned }
}

// ---------- OpenAI shared ----------
function extractOutputText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text
  const chunks = []
  for (const item of data.output ?? []) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) if (c.type === 'output_text' && typeof c.text === 'string') chunks.push(c.text)
    }
  }
  return chunks.join('\n')
}

function stripToJson(content) {
  let s = content.trim()
  if (s.startsWith('```')) return s.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a !== -1 && b > a) return s.slice(a, b + 1)
  return s
}

async function responsesCall({ instructions, input, tools }) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured')
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.3, instructions, input, ...(tools ? { tools } : {}) }),
  })
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`)
  return extractOutputText(await res.json())
}

// ---------- meal parse (web search) ----------
const MEAL_PROMPT = `You are a nutrition parser. Output ONLY valid JSON. No markdown, no extra keys, no explanations.
Schema:
{"meal_summary":"...","items":[{"name":"...","qty":"...","calories":0,"protein_g":0.0,"carbs_g":0.0,"fat_g":0.0,"fiber_g":0.0,"sugar_g":0.0,"sodium_mg":0.0}],"totals":{"calories":0,"protein_g":0.0,"carbs_g":0.0,"fat_g":0.0,"fiber_g":0.0,"sugar_g":0.0,"sodium_mg":0.0},"confidence":0.5,"assumptions":[]}
Rules:
- Assume common serving sizes if missing; list in assumptions.
- Clamp negatives to 0. Round calories to integers, macros to 1 decimal.
- totals must sum all items. confidence 0.0-1.0.`

function normalizeMeal(data) {
  const items = (data.items || []).map((it) => ({
    name: it.name || 'Unknown',
    qty: it.qty || '1 serving',
    calories: rCal(it.calories),
    protein_g: rMac(it.protein_g),
    carbs_g: rMac(it.carbs_g),
    fat_g: rMac(it.fat_g),
    fiber_g: rMac(it.fiber_g),
    ...(it.sugar_g !== undefined ? { sugar_g: rMac(it.sugar_g) } : {}),
    ...(it.sodium_mg !== undefined ? { sodium_mg: rMac(it.sodium_mg) } : {}),
  }))
  const totals = {
    calories: rCal(items.reduce((s, i) => s + i.calories, 0)),
    protein_g: rMac(items.reduce((s, i) => s + i.protein_g, 0)),
    carbs_g: rMac(items.reduce((s, i) => s + i.carbs_g, 0)),
    fat_g: rMac(items.reduce((s, i) => s + i.fat_g, 0)),
    fiber_g: rMac(items.reduce((s, i) => s + i.fiber_g, 0)),
  }
  if (items.some((i) => i.sugar_g !== undefined)) totals.sugar_g = rMac(items.reduce((s, i) => s + (i.sugar_g || 0), 0))
  if (items.some((i) => i.sodium_mg !== undefined)) totals.sodium_mg = rMac(items.reduce((s, i) => s + (i.sodium_mg || 0), 0))
  return {
    meal_summary: data.meal_summary || 'Meal',
    items,
    totals,
    confidence: Math.max(0, Math.min(1, data.confidence || 0.5)),
    assumptions: Array.isArray(data.assumptions) ? data.assumptions : [],
  }
}

export async function parseMeal(text, retry = false) {
  const instruction = retry
    ? `Search the web for accurate nutrition facts, then output ONLY JSON for this meal: "${text}"`
    : `Search the web for accurate nutrition facts for branded/packaged items when helpful, then parse this meal: "${text}"`
  const content = await responsesCall({ instructions: MEAL_PROMPT, input: instruction, tools: [{ type: 'web_search' }] })
  try {
    return normalizeMeal(JSON.parse(stripToJson(content)))
  } catch (e) {
    if (!retry && e instanceof SyntaxError) return parseMeal(text, true)
    throw e
  }
}

// ---------- workout parse ----------
export const MUSCLES = [
  'chest', 'shoulders', 'back', 'lats', 'traps', 'biceps', 'triceps',
  'forearms', 'abs', 'obliques', 'quads', 'hamstrings', 'glutes', 'calves',
  'lower_back', 'cardio',
]

const WORKOUT_PROMPT = `You are a workout parser. Output ONLY valid JSON. No markdown, no extra keys.
Schema:
{"summary":"...","items":[{"name":"...","muscle_groups":["chest","triceps"],"sets":3,"reps":10,"weight":135,"weight_unit":"lb","duration_min":0,"calories":0}],"confidence":0.8,"assumptions":[]}
Rules:
- muscle_groups ONLY from: ${MUSCLES.join(', ')}.
- Pick primary and secondary muscles. Cardio uses ["cardio"] plus legs if relevant, set duration_min and estimate calories.
- Omit or 0 unknown sets/reps/weight; note guesses in assumptions. weight_unit "lb" or "kg". confidence 0.0-1.0.`

function normalizeWorkout(parsed) {
  const items = (parsed.items || []).map((it) => {
    const groups = (Array.isArray(it.muscle_groups) ? it.muscle_groups : [])
      .map((m) => String(m).toLowerCase().trim().replace(/\s+/g, '_'))
      .filter((m) => MUSCLES.includes(m))
    return {
      name: it.name || 'Exercise',
      muscle_groups: groups.length ? [...new Set(groups)] : ['cardio'],
      sets: Math.round(clamp0(it.sets)),
      reps: Math.round(clamp0(it.reps)),
      weight: clamp0(it.weight),
      weight_unit: it.weight_unit === 'kg' ? 'kg' : 'lb',
      duration_min: clamp0(it.duration_min),
      calories: Math.round(clamp0(it.calories)),
    }
  })
  return {
    summary: parsed.summary || 'Workout',
    items,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.6)),
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
  }
}

export function workoutTotals(items) {
  const muscles = new Set()
  let total_sets = 0, total_reps = 0, total_volume = 0, calories = 0
  for (const it of items) {
    (it.muscle_groups || []).forEach((m) => muscles.add(m))
    total_sets += it.sets || 0
    total_reps += (it.sets || 0) * (it.reps || 0)
    total_volume += (it.sets || 0) * (it.reps || 0) * (it.weight || 0)
    calories += it.calories || 0
  }
  return { total_sets, total_reps, total_volume: Math.round(total_volume), calories: Math.round(calories), muscles: [...muscles] }
}

export async function parseWorkout(text, retry = false) {
  const instruction = retry ? `Output ONLY JSON for this workout: "${text}"` : `Parse this workout: "${text}"`
  const content = await responsesCall({ instructions: WORKOUT_PROMPT, input: instruction })
  try {
    return normalizeWorkout(JSON.parse(stripToJson(content)))
  } catch (e) {
    if (!retry && e instanceof SyntaxError) return parseWorkout(text, true)
    throw e
  }
}

// ---------- date helper ----------
export function localDate(d, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
