import express from 'express'
import cors from 'cors'
import { q, one, pool } from './db.js'
import {
  parseMeal, parseWorkout, workoutTotals, parseWaterOz, extractWater,
  inferMealType, localDate, rCal, rMac, clamp0, MUSCLES,
} from './helpers.js'

const app = express()
app.use(cors())
app.use(express.json())

const jb = (v) => JSON.stringify(v) // jsonb param

// ---------------- health ----------------
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// ---------------- helpers ----------------
function sumTotals(rows) {
  const acc = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 0 }
  for (const r of rows) {
    const t = r.totals || {}
    acc.calories += t.calories || 0
    acc.protein_g += t.protein_g || 0
    acc.carbs_g += t.carbs_g || 0
    acc.fat_g += t.fat_g || 0
    acc.fiber_g += t.fiber_g || 0
    if (t.sugar_g !== undefined) acc.sugar_g += t.sugar_g
    if (t.sodium_mg !== undefined) acc.sodium_mg += t.sodium_mg
  }
  return acc
}

// ---------------- get-logs ----------------
app.get('/get-logs', async (req, res) => {
  try {
    const tz = req.query.tz || 'America/Chicago'
    const range = req.query.range
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 14
    const from = new Date(); from.setDate(from.getDate() - days); from.setHours(0, 0, 0, 0)
    const to = new Date(); to.setHours(23, 59, 59, 999)

    const logs = await q(
      `select * from meal_logs where meal_time >= $1 and meal_time <= $2 order by meal_time desc limit 200`,
      [from.toISOString(), to.toISOString()]
    )
    const today = localDate(new Date(), tz)

    // today totals
    const todayLogs = logs.filter((l) => localDate(new Date(l.meal_time), tz) === today)
    const tt = sumTotals(todayLogs)
    const today_totals = {
      calories: Math.round(tt.calories), protein_g: rMac(tt.protein_g), carbs_g: rMac(tt.carbs_g),
      fat_g: rMac(tt.fat_g), fiber_g: rMac(tt.fiber_g),
      ...(tt.sugar_g > 0 ? { sugar_g: rMac(tt.sugar_g) } : {}), ...(tt.sodium_mg > 0 ? { sodium_mg: rMac(tt.sodium_mg) } : {}),
    }

    // daily totals
    const byDate = new Map()
    for (const l of logs) {
      const d = localDate(new Date(l.meal_time), tz)
      if (!byDate.has(d)) byDate.set(d, [])
      byDate.get(d).push(l)
    }
    const daily_totals = [...byDate.entries()].map(([date, rows]) => {
      const s = sumTotals(rows)
      return { date, calories: Math.round(s.calories), protein_g: rMac(s.protein_g), carbs_g: rMac(s.carbs_g), fat_g: rMac(s.fat_g), fiber_g: rMac(s.fiber_g) }
    }).sort((a, b) => a.date.localeCompare(b.date))

    // last 7 avg
    const last7 = daily_totals.slice(-7)
    const last_7_avg = last7.length
      ? {
          calories: Math.round(last7.reduce((s, d) => s + d.calories, 0) / last7.length),
          fiber_g: rMac(last7.reduce((s, d) => s + d.fiber_g, 0) / last7.length),
          protein_g: rMac(last7.reduce((s, d) => s + d.protein_g, 0) / last7.length),
        }
      : { calories: 0, fiber_g: 0, protein_g: 0 }

    // water + settings
    const waterRows = await q(`select logged_at, amount_oz from water_logs where logged_at >= $1 and logged_at <= $2`, [from.toISOString(), to.toISOString()])
    const settings = await one(`select * from user_settings where id = 1`)
    const waterByDate = new Map()
    let water_today = 0
    for (const w of waterRows) {
      const d = localDate(new Date(w.logged_at), tz)
      const amt = Number(w.amount_oz) || 0
      waterByDate.set(d, (waterByDate.get(d) || 0) + amt)
      if (d === today) water_today += amt
    }
    water_today = Math.round(water_today * 10) / 10
    const water_daily = [...waterByDate.entries()].map(([date, oz]) => ({ date, water_oz: Math.round(oz * 10) / 10 })).sort((a, b) => a.date.localeCompare(b.date))

    // streak
    const calDays = new Set(daily_totals.filter((d) => d.calories > 0).map((d) => d.date))
    let streak = 0
    const cur = new Date()
    if (!calDays.has(localDate(cur, tz))) cur.setDate(cur.getDate() - 1)
    while (calDays.has(localDate(cur, tz))) { streak++; cur.setDate(cur.getDate() - 1) }

    // weekly hit-rate
    const calGoal = settings?.calories_goal ?? 0
    const proteinGoal = Number(settings?.protein_goal_g ?? 0)
    let hit_calories = 0, hit_protein = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const ds = localDate(d, tz)
      const day = daily_totals.find((x) => x.date === ds)
      if (day && calGoal > 0 && day.calories >= calGoal) hit_calories++
      if (day && proteinGoal > 0 && day.protein_g >= proteinGoal) hit_protein++
    }

    res.json({
      logs, today_totals, daily_totals, last_7_avg,
      water_today, water_daily, water_goal_oz: Number(settings?.water_goal_oz ?? 64),
      settings: settings ?? null, streak, weekly: { hit_calories, hit_protein, days: 7 },
    })
  } catch (e) { res.status(500).json({ error: 'Failed to fetch logs', details: e.message }) }
})

// ---------------- log-meal (water/template fast-path + preview + AI) ----------------
app.post('/log-meal', async (req, res) => {
  try {
    const body = req.body || {}
    if (!body.text || typeof body.text !== 'string' || !body.text.trim()) return res.status(400).json({ error: "Missing or invalid 'text' field" })
    const text = body.text.trim()
    const tz = body.tz || 'America/Chicago'
    const preview = body.preview === true

    // fast-path water (non-preview)
    if (!preview) {
      const oz = parseWaterOz(text)
      if (oz !== null) {
        const amount = Math.round(oz * 10) / 10
        await q(`insert into water_logs (logged_at, amount_oz) values ($1, $2)`, [new Date().toISOString(), amount])
        return res.json({ ok: true, kind: 'water', amount_oz: amount, speech: `Logged ${amount} ounces of water.` })
      }
      // fast-path template by name/alias
      const templates = await q(`select * from daily_templates where is_active = true`)
      const needle = text.toLowerCase()
      const match = templates.find((t) =>
        t.name.toLowerCase() === needle ||
        (Array.isArray(t.aliases) && t.aliases.includes(needle)) ||
        (Array.isArray(t.aliases) && t.aliases.some((a) => a && needle.includes(a))))
      if (match) {
        const totals = {
          calories: match.calories, protein_g: Number(match.protein_g), carbs_g: Number(match.carbs_g),
          fat_g: Number(match.fat_g), fiber_g: Number(match.fiber_g),
          ...(match.sugar_g != null ? { sugar_g: Number(match.sugar_g) } : {}), ...(match.sodium_mg != null ? { sodium_mg: Number(match.sodium_mg) } : {}),
        }
        const row = await one(
          `insert into meal_logs (meal_time, raw_text, meal_type, totals, items, confidence, assumptions, template_id)
           values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) returning *`,
          [new Date().toISOString(), match.name, inferMealType(tz), jb(totals), jb([{ name: match.name, qty: '1 serving', ...totals }]), 1.0, [], match.id]
        )
        return res.json({ ok: true, kind: 'template', id: row.id, meal_time: row.meal_time, totals, speech: `Logged ${match.name}, ${Math.round(totals.calories)} calories.` })
      }
    }

    // preview: extract water, parse remaining food
    if (preview) {
      const { oz, cleaned } = extractWater(text)
      let items = [], confidence = 1, assumptions = [], meal_summary = ''
      if (cleaned.trim().length > 0) {
        const parsed = await parseMeal(cleaned.trim())
        items = parsed.items; confidence = parsed.confidence; assumptions = parsed.assumptions; meal_summary = parsed.meal_summary
      }
      return res.json({ ok: true, preview: true, meal_summary, items, confidence, assumptions, water_oz: oz })
    }

    // direct AI log
    const parsed = await parseMeal(text)
    const row = await one(
      `insert into meal_logs (meal_time, raw_text, meal_type, totals, items, confidence, assumptions)
       values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) returning *`,
      [new Date().toISOString(), text, body.meal_type || inferMealType(tz), jb(parsed.totals), jb(parsed.items), parsed.confidence, parsed.assumptions]
    )
    const c = Math.round(parsed.totals.calories), p = Math.round(parsed.totals.protein_g), f = Math.round(parsed.totals.fiber_g)
    res.json({ ok: true, id: row.id, meal_time: row.meal_time, totals: parsed.totals, confidence: parsed.confidence, assumptions: parsed.assumptions, speech: `Logged ${c} calories, ${p} grams protein, ${f} grams fiber.` })
  } catch (e) { res.status(502).json({ error: 'Failed to log meal', details: e.message }) }
})

// ---------------- save-meal ----------------
app.post('/save-meal', async (req, res) => {
  try {
    const body = req.body || {}
    const raw = Array.isArray(body.items) ? body.items : []
    if (raw.length === 0) return res.status(400).json({ error: 'No items to save' })
    const tz = body.tz || 'America/Chicago'
    const items = raw.map((it) => {
      const o = { name: String(it.name ?? 'Item').trim() || 'Item', qty: String(it.qty ?? '1 serving'), calories: rCal(it.calories), protein_g: rMac(it.protein_g), carbs_g: rMac(it.carbs_g), fat_g: rMac(it.fat_g), fiber_g: rMac(it.fiber_g) }
      if (it.sugar_g != null) o.sugar_g = rMac(it.sugar_g)
      if (it.sodium_mg != null) o.sodium_mg = rMac(it.sodium_mg)
      return o
    })
    const totals = { calories: Math.round(items.reduce((s, i) => s + i.calories, 0)), protein_g: rMac(items.reduce((s, i) => s + i.protein_g, 0)), carbs_g: rMac(items.reduce((s, i) => s + i.carbs_g, 0)), fat_g: rMac(items.reduce((s, i) => s + i.fat_g, 0)), fiber_g: rMac(items.reduce((s, i) => s + i.fiber_g, 0)) }
    if (items.some((i) => i.sugar_g !== undefined)) totals.sugar_g = rMac(items.reduce((s, i) => s + (i.sugar_g || 0), 0))
    if (items.some((i) => i.sodium_mg !== undefined)) totals.sodium_mg = rMac(items.reduce((s, i) => s + (i.sodium_mg || 0), 0))
    const row = await one(
      `insert into meal_logs (meal_time, raw_text, meal_type, totals, items, confidence, assumptions)
       values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) returning *`,
      [new Date().toISOString(), body.raw_text ? String(body.raw_text) : items.map((i) => i.name).join(', '), body.meal_type ? String(body.meal_type) : inferMealType(tz), jb(totals), jb(items), body.confidence != null ? Number(body.confidence) : 1.0, Array.isArray(body.assumptions) ? body.assumptions.map(String) : []]
    )
    res.json({ ok: true, id: row.id, meal_time: row.meal_time, totals })
  } catch (e) { res.status(500).json({ error: 'Failed to save meal', details: e.message }) }
})

// ---------------- delete-meal ----------------
app.post('/delete-meal', async (req, res) => {
  try {
    const id = req.body?.id
    if (!id) return res.status(400).json({ error: "Missing or invalid 'id' field" })
    await q(`delete from meal_logs where id = $1`, [id])
    res.json({ ok: true, id })
  } catch (e) { res.status(500).json({ error: 'Failed to delete meal', details: e.message }) }
})

// ---------------- update-meal (totals and/or meal_time) ----------------
app.post('/update-meal', async (req, res) => {
  try {
    const body = req.body || {}
    if (!body.id) return res.status(400).json({ error: "Missing or invalid 'id' field" })
    const hasTotals = body.totals && typeof body.totals === 'object'
    if (!hasTotals && !body.meal_time) return res.status(400).json({ error: "Provide 'totals' and/or 'meal_time' to update" })
    let mealTimeIso
    if (body.meal_time) { const d = new Date(body.meal_time); if (isNaN(d.getTime())) return res.status(400).json({ error: "Invalid 'meal_time'" }); mealTimeIso = d.toISOString() }
    const existing = await one(`select totals from meal_logs where id = $1`, [body.id])
    if (!existing) return res.status(404).json({ error: 'Meal not found' })
    const sets = [], params = []
    if (hasTotals) {
      const t = body.totals
      const merged = { ...existing.totals }
      for (const k of ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg']) {
        if (t[k] !== undefined) merged[k] = k === 'calories' ? rCal(t[k]) : rMac(t[k])
      }
      params.push(jb(merged)); sets.push(`totals = $${params.length}::jsonb`)
    }
    if (mealTimeIso) { params.push(mealTimeIso); sets.push(`meal_time = $${params.length}`) }
    params.push(body.id)
    const row = await one(`update meal_logs set ${sets.join(', ')} where id = $${params.length} returning *`, params)
    res.json({ ok: true, data: row })
  } catch (e) { res.status(500).json({ error: 'Failed to update meal', details: e.message }) }
})

// ---------------- settings ----------------
const SETTINGS_COLS = ['calories_goal', 'protein_goal_g', 'carbs_goal_g', 'fat_goal_g', 'fiber_goal_g', 'sugar_goal_g', 'sodium_goal_mg', 'water_goal_oz', 'timezone']
app.get('/settings', async (_req, res) => {
  try { res.json(await one(`select * from user_settings where id = 1`)) }
  catch (e) { res.status(500).json({ error: 'Failed to load settings', details: e.message }) }
})
app.post('/settings', async (req, res) => {
  try {
    const body = req.body || {}
    const cols = ['updated_at'], vals = [new Date().toISOString()]
    for (const c of SETTINGS_COLS) if (body[c] !== undefined && body[c] !== null) { cols.push(c); vals.push(body[c]) }
    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ')
    // ensure row exists then update
    await q(`insert into user_settings (id) values (1) on conflict do nothing`)
    const row = await one(`update user_settings set ${setClause} where id = 1 returning *`, vals)
    res.json({ ok: true, settings: row })
  } catch (e) { res.status(500).json({ error: 'Failed to save settings', details: e.message }) }
})

// ---------------- templates ----------------
function templateVals(b) {
  const num = (v) => clamp0(v)
  return {
    name: String(b.name ?? '').trim() || 'Untitled',
    aliases: Array.isArray(b.aliases) ? b.aliases.map((a) => String(a).trim().toLowerCase()).filter(Boolean) : [],
    calories: Math.round(num(b.calories)), protein_g: num(b.protein_g), carbs_g: num(b.carbs_g), fat_g: num(b.fat_g), fiber_g: num(b.fiber_g),
    sugar_g: b.sugar_g == null ? null : num(b.sugar_g), sodium_mg: b.sodium_mg == null ? null : num(b.sodium_mg),
    is_active: b.is_active === undefined ? true : !!b.is_active, sort_order: Math.round(num(b.sort_order)),
  }
}
app.get('/templates', async (req, res) => {
  try {
    const all = req.query.all === '1'
    const rows = await q(`select * from daily_templates ${all ? '' : 'where is_active = true'} order by sort_order, created_at`)
    res.json({ templates: rows })
  } catch (e) { res.status(500).json({ error: 'Failed to load templates', details: e.message }) }
})
app.post('/templates', async (req, res) => {
  try {
    const b = req.body || {}
    const action = String(b.action ?? 'create')
    if (action === 'delete') { if (!b.id) return res.status(400).json({ error: 'Missing id' }); await q(`delete from daily_templates where id = $1`, [b.id]); return res.json({ ok: true, id: b.id }) }
    const v = templateVals(b)
    if (action === 'update') {
      if (!b.id) return res.status(400).json({ error: 'Missing id' })
      const row = await one(`update daily_templates set name=$1, aliases=$2, calories=$3, protein_g=$4, carbs_g=$5, fat_g=$6, fiber_g=$7, sugar_g=$8, sodium_mg=$9, is_active=$10, sort_order=$11 where id=$12 returning *`,
        [v.name, v.aliases, v.calories, v.protein_g, v.carbs_g, v.fat_g, v.fiber_g, v.sugar_g, v.sodium_mg, v.is_active, v.sort_order, b.id])
      return res.json({ ok: true, template: row })
    }
    const row = await one(`insert into daily_templates (name, aliases, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, is_active, sort_order) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [v.name, v.aliases, v.calories, v.protein_g, v.carbs_g, v.fat_g, v.fiber_g, v.sugar_g, v.sodium_mg, v.is_active, v.sort_order])
    res.json({ ok: true, template: row })
  } catch (e) { res.status(500).json({ error: 'Failed to save template', details: e.message }) }
})

// ---------------- log-template ----------------
app.post('/log-template', async (req, res) => {
  try {
    const b = req.body || {}
    const tz = b.tz || 'America/Chicago'
    let t = null
    if (b.id) t = await one(`select * from daily_templates where id = $1`, [b.id])
    else if (b.name) {
      const needle = String(b.name).trim().toLowerCase()
      const rows = await q(`select * from daily_templates where is_active = true`)
      t = rows.find((x) => x.name.toLowerCase() === needle || (Array.isArray(x.aliases) && x.aliases.includes(needle)) || needle.includes(x.name.toLowerCase())) || null
    }
    if (!t) return res.status(404).json({ error: 'Template not found' })
    const totals = { calories: t.calories, protein_g: Number(t.protein_g), carbs_g: Number(t.carbs_g), fat_g: Number(t.fat_g), fiber_g: Number(t.fiber_g), ...(t.sugar_g != null ? { sugar_g: Number(t.sugar_g) } : {}), ...(t.sodium_mg != null ? { sodium_mg: Number(t.sodium_mg) } : {}) }
    const row = await one(`insert into meal_logs (meal_time, raw_text, meal_type, totals, items, confidence, assumptions, template_id) values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) returning *`,
      [new Date().toISOString(), t.name, inferMealType(tz), jb(totals), jb([{ name: t.name, qty: '1 serving', ...totals }]), 1.0, [], t.id])
    res.json({ ok: true, id: row.id, meal_time: row.meal_time, totals, speech: `Logged ${t.name}, ${Math.round(totals.calories)} calories, ${Math.round(totals.protein_g)} grams protein.` })
  } catch (e) { res.status(500).json({ error: 'Failed to log template', details: e.message }) }
})

// ---------------- log-water (allows negative corrections) ----------------
app.post('/log-water', async (req, res) => {
  try {
    const b = req.body || {}
    let amt = null
    if (b.amount_oz !== undefined && b.amount_oz !== null) amt = Number(b.amount_oz)
    else if (typeof b.text === 'string') amt = parseWaterOz(b.text)
    if (amt === null || !Number.isFinite(amt) || amt === 0) return res.status(400).json({ error: 'Could not determine a water amount' })
    amt = Math.round(amt * 10) / 10
    const row = await one(`insert into water_logs (logged_at, amount_oz, note) values ($1,$2,$3) returning *`, [new Date().toISOString(), amt, b.note ? String(b.note) : null])
    res.json({ ok: true, id: row.id, amount_oz: amt, speech: amt < 0 ? `Removed ${Math.abs(amt)} ounces of water.` : `Logged ${amt} ounces of water.` })
  } catch (e) { res.status(500).json({ error: 'Failed to log water', details: e.message }) }
})

// ---------------- query-today ----------------
app.get('/query-today', async (req, res) => {
  try {
    const tz = req.query.tz || 'America/Chicago'
    const focus = (req.query.focus || '').toLowerCase()
    const since = new Date(); since.setDate(since.getDate() - 1); since.setHours(0, 0, 0, 0)
    const settings = await one(`select * from user_settings where id = 1`)
    const meals = await q(`select meal_time, totals from meal_logs where meal_time >= $1`, [since.toISOString()])
    const waters = await q(`select logged_at, amount_oz from water_logs where logged_at >= $1`, [since.toISOString()])
    const today = localDate(new Date(), tz)
    const t = { calories: 0, protein_g: 0, fiber_g: 0 }
    for (const m of meals) { if (localDate(new Date(m.meal_time), tz) !== today) continue; const tot = m.totals || {}; t.calories += tot.calories || 0; t.protein_g += tot.protein_g || 0; t.fiber_g += tot.fiber_g || 0 }
    let water = 0
    for (const w of waters) { if (localDate(new Date(w.logged_at), tz) !== today) continue; water += Number(w.amount_oz) || 0 }
    const cal = Math.round(t.calories), protein = Math.round(t.protein_g)
    const calGoal = settings?.calories_goal ?? 2500, proteinGoal = Math.round(Number(settings?.protein_goal_g ?? 180)), waterGoal = Math.round(Number(settings?.water_goal_oz ?? 64))
    const remaining = calGoal - cal
    let speech
    if (focus === 'protein') speech = `You have ${protein} of ${proteinGoal} grams of protein today, ${Math.max(0, proteinGoal - protein)} grams to go.`
    else if (focus === 'water') speech = `You've had ${Math.round(water)} of ${waterGoal} ounces of water, ${Math.max(0, waterGoal - Math.round(water))} ounces to go.`
    else speech = `You've had ${cal} calories and ${protein} grams of protein today. ${remaining >= 0 ? `You're ${remaining} calories under goal.` : `You're ${Math.abs(remaining)} calories over goal.`}`
    res.json({ speech, today_totals: { calories: cal, protein_g: protein, fiber_g: Math.round(t.fiber_g) }, water_oz: Math.round(water * 10) / 10, goals: { calories_goal: calGoal, protein_goal_g: proteinGoal, water_goal_oz: waterGoal } })
  } catch (e) { res.status(500).json({ error: 'Internal server error', details: e.message }) }
})

// ---------------- log-workout ----------------
app.post('/log-workout', async (req, res) => {
  try {
    const b = req.body || {}
    if (!b.text || typeof b.text !== 'string' || !b.text.trim()) return res.status(400).json({ error: "Missing or invalid 'text' field" })
    const text = b.text.trim()
    const parsed = await parseWorkout(text)
    const totals = workoutTotals(parsed.items)
    if (b.preview === true) return res.json({ ok: true, preview: true, summary: parsed.summary, items: parsed.items, totals, confidence: parsed.confidence, assumptions: parsed.assumptions })
    const row = await one(`insert into workout_logs (workout_time, raw_text, items, totals, confidence, assumptions) values ($1,$2,$3::jsonb,$4::jsonb,$5,$6) returning *`,
      [new Date().toISOString(), text, jb(parsed.items), jb(totals), parsed.confidence, parsed.assumptions])
    const ml = totals.muscles.filter((m) => m !== 'cardio').join(', ')
    res.json({ ok: true, id: row.id, workout_time: row.workout_time, totals, speech: `Logged ${parsed.items.length} exercise${parsed.items.length === 1 ? '' : 's'}${ml ? ', hitting ' + ml : ''}.` })
  } catch (e) { res.status(502).json({ error: 'Failed to parse workout with AI', details: e.message }) }
})

// ---------------- save-workout ----------------
app.post('/save-workout', async (req, res) => {
  try {
    const b = req.body || {}
    const raw = Array.isArray(b.items) ? b.items : []
    if (raw.length === 0) return res.status(400).json({ error: 'No exercises to save' })
    const items = raw.map((it) => {
      const groups = (Array.isArray(it.muscle_groups) ? it.muscle_groups : []).map((m) => String(m).toLowerCase().trim().replace(/\s+/g, '_')).filter((m) => MUSCLES.includes(m))
      return { name: String(it.name ?? 'Exercise').trim() || 'Exercise', muscle_groups: groups.length ? [...new Set(groups)] : ['cardio'], sets: Math.round(clamp0(it.sets)), reps: Math.round(clamp0(it.reps)), weight: clamp0(it.weight), weight_unit: it.weight_unit === 'kg' ? 'kg' : 'lb', duration_min: clamp0(it.duration_min), calories: Math.round(clamp0(it.calories)) }
    })
    const totals = workoutTotals(items)
    const row = await one(`insert into workout_logs (workout_time, raw_text, items, totals, confidence, assumptions) values ($1,$2,$3::jsonb,$4::jsonb,$5,$6) returning *`,
      [new Date().toISOString(), b.raw_text ? String(b.raw_text) : items.map((i) => i.name).join(', '), jb(items), jb(totals), b.confidence != null ? Number(b.confidence) : 1.0, Array.isArray(b.assumptions) ? b.assumptions.map(String) : []])
    res.json({ ok: true, id: row.id, workout_time: row.workout_time, totals })
  } catch (e) { res.status(500).json({ error: 'Failed to save workout', details: e.message }) }
})

// ---------------- get-workouts ----------------
app.get('/get-workouts', async (req, res) => {
  try {
    const tz = req.query.tz || 'America/Chicago'
    const range = req.query.range || '30d'
    const days = range === '7d' ? 7 : range === '14d' ? 14 : range === '90d' ? 90 : 30
    const from = new Date(); from.setDate(from.getDate() - days); from.setHours(0, 0, 0, 0)
    const list = await q(`select * from workout_logs where workout_time >= $1 order by workout_time desc limit 200`, [from.toISOString()])
    const today = localDate(new Date(), tz)
    const todayMuscles = new Set(), weekMuscles = new Set()
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    for (const w of list) {
      const wd = localDate(new Date(w.workout_time), tz)
      const muscles = (w.totals?.muscles) || []
      if (wd === today) muscles.forEach((m) => todayMuscles.add(m))
      if (new Date(w.workout_time) >= weekAgo) muscles.forEach((m) => weekMuscles.add(m))
    }
    const wdays = new Set(list.map((w) => localDate(new Date(w.workout_time), tz)))
    let streak = 0; const cur = new Date()
    if (!wdays.has(localDate(cur, tz))) cur.setDate(cur.getDate() - 1)
    while (wdays.has(localDate(cur, tz))) { streak++; cur.setDate(cur.getDate() - 1) }
    res.json({ workouts: list, today_muscles: [...todayMuscles], week_muscles: [...weekMuscles], streak, count: list.length })
  } catch (e) { res.status(500).json({ error: 'Failed to fetch workouts', details: e.message }) }
})

// ---------------- delete-workout ----------------
app.post('/delete-workout', async (req, res) => {
  try {
    const id = req.body?.id
    if (!id) return res.status(400).json({ error: 'Missing id' })
    await q(`delete from workout_logs where id = $1`, [id])
    res.json({ ok: true, id })
  } catch (e) { res.status(500).json({ error: 'Failed to delete workout', details: e.message }) }
})

const port = process.env.PORT || 3000
pool.query('select 1').then(() => console.log('DB connected')).catch((e) => console.error('DB connect error', e.message))
app.listen(port, () => console.log(`kaltrack-server on ${port}`))
