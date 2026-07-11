// One-off: pull data from the live Supabase edge functions and insert into Neon.
// Run: DATABASE_URL=... node migrate-from-supabase.js
import pg from 'pg'

const SB = 'https://xkgcrglbqmswxscfpgyt.supabase.co/functions/v1'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const jb = (v) => JSON.stringify(v)

async function main() {
  // 1) meals + settings + water (aggregated) from get-logs over a wide window
  const logsRes = await fetch(`${SB}/get-logs?from=2020-01-01&to=2035-01-01&tz=America/Chicago`).then((r) => r.json())
  const meals = logsRes.logs || []
  const settings = logsRes.settings
  const waterDaily = logsRes.water_daily || []

  // 2) templates
  const tplRes = await fetch(`${SB}/templates?all=1`).then((r) => r.json())
  const templates = tplRes.templates || []

  // 3) workouts
  const woRes = await fetch(`${SB}/get-workouts?range=90d&tz=America/Chicago`).then((r) => r.json())
  const workouts = woRes.workouts || []

  console.log(`Pulled: ${meals.length} meals, ${templates.length} templates, ${waterDaily.length} water-days, ${workouts.length} workouts`)

  // ---- settings ----
  if (settings) {
    await pool.query(
      `update user_settings set calories_goal=$1, protein_goal_g=$2, carbs_goal_g=$3, fat_goal_g=$4, fiber_goal_g=$5, sugar_goal_g=$6, sodium_goal_mg=$7, water_goal_oz=$8, timezone=$9 where id=1`,
      [settings.calories_goal, settings.protein_goal_g, settings.carbs_goal_g, settings.fat_goal_g, settings.fiber_goal_g, settings.sugar_goal_g, settings.sodium_goal_mg, settings.water_goal_oz, settings.timezone]
    )
  }

  // ---- templates (preserve ids) ----
  for (const t of templates) {
    await pool.query(
      `insert into daily_templates (id, created_at, name, aliases, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, is_active, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict (id) do nothing`,
      [t.id, t.created_at, t.name, t.aliases || [], t.calories, t.protein_g, t.carbs_g, t.fat_g, t.fiber_g, t.sugar_g, t.sodium_mg, t.is_active, t.sort_order]
    )
  }

  // ---- meals (preserve ids + timestamps) ----
  for (const m of meals) {
    await pool.query(
      `insert into meal_logs (id, created_at, meal_time, raw_text, meal_type, totals, items, confidence, assumptions, template_id)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10) on conflict (id) do nothing`,
      [m.id, m.created_at, m.meal_time, m.raw_text, m.meal_type, jb(m.totals || {}), jb(m.items || []), m.confidence ?? 1, m.assumptions || [], m.template_id || null]
    )
  }

  // ---- water (aggregated: one row per day) ----
  for (const w of waterDaily) {
    if (!w.water_oz) continue
    const loggedAt = new Date(`${w.date}T12:00:00`).toISOString()
    await pool.query(`insert into water_logs (logged_at, amount_oz, note) values ($1,$2,$3)`, [loggedAt, w.water_oz, 'migrated daily total'])
  }

  // ---- workouts (preserve ids) ----
  for (const wk of workouts) {
    await pool.query(
      `insert into workout_logs (id, created_at, workout_time, raw_text, items, totals, confidence, assumptions)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8) on conflict (id) do nothing`,
      [wk.id, wk.created_at, wk.workout_time, wk.raw_text, jb(wk.items || []), jb(wk.totals || {}), wk.confidence ?? 1, wk.assumptions || []]
    )
  }

  const counts = {}
  for (const tbl of ['meal_logs', 'water_logs', 'daily_templates', 'workout_logs']) {
    counts[tbl] = (await pool.query(`select count(*) from ${tbl}`)).rows[0].count
  }
  console.log('Neon row counts:', counts)
  await pool.end()
}

main().catch((e) => { console.error('MIGRATE ERR', e.message); process.exit(1) })
