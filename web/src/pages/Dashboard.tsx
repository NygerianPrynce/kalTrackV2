import { useEffect, useState } from 'react'
import { getLogs, logWater, logMeal } from '../api'
import { GetLogsResponse, MealLog, NutritionGoals } from '../types'
import { getGoals, refreshGoals } from '../utils/goals'
import MealLogger from '../components/MealLogger'
import './Dashboard.css'

export default function Dashboard() {
  const [data, setData] = useState<GetLogsResponse | null>(null)
  const [goals, setGoals] = useState<NutritionGoals>(getGoals())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Load cached data first
    const cached = localStorage.getItem('kaltrack_logs_cache')
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        setData(parsed)
        setLoading(false)
      } catch (e) {
        console.error('Failed to parse cached data', e)
      }
    }

    // Fetch fresh data + authoritative goals
    loadData()
    refreshGoals().then(setGoals).catch((e) => console.error('Failed to refresh goals', e))

    // Listen for goals updates (same tab and other tabs)
    const handleGoalsUpdate = () => {
      setGoals(getGoals())
    }
    window.addEventListener('goalsUpdated', handleGoalsUpdate)
    window.addEventListener('storage', handleGoalsUpdate)
    return () => {
      window.removeEventListener('goalsUpdated', handleGoalsUpdate)
      window.removeEventListener('storage', handleGoalsUpdate)
    }
  }, [])

  const handleAddWater = async (oz: number) => {
    try {
      setBusy(true)
      await logWater(oz)
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to log water')
    } finally {
      setBusy(false)
    }
  }

  const handleRelog = async (text: string) => {
    try {
      setBusy(true)
      await logMeal({ text })
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to re-log meal')
    } finally {
      setBusy(false)
    }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await getLogs({ range: '14d', tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
      setData(response)
      // Cache the response
      localStorage.setItem('kaltrack_logs_cache', JSON.stringify(response))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const toggleLog = (id: string) => {
    const newExpanded = new Set(expandedLogs)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedLogs(newExpanded)
  }

  const getProgress = (current: number, goal: number): number => {
    if (goal === 0) return 0
    return Math.min(100, Math.round((current / goal) * 100))
  }

  if (loading && !data) {
    return <div className="dashboard">Loading...</div>
  }

  if (error && !data) {
    return (
      <div className="dashboard">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={loadData} className="retry-button">Retry</button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { today_totals, logs } = data
  const recentLogs = logs.slice(0, 10)
  const streak = data.streak ?? 0
  const weekly = data.weekly
  const waterToday = data.water_today ?? 0
  const waterGoal = data.water_goal_oz ?? goals.water_goal_oz ?? 64
  const waterPct = waterGoal > 0 ? Math.min(100, Math.round((waterToday / waterGoal) * 100)) : 0

  return (
    <div className="dashboard">
      <h1 className="page-title">Today</h1>

      {/* Quick add a meal right from the dashboard */}
      <MealLogger onSaved={loadData} />

      {/* Streak / weekly hit-rate */}
      {(streak > 0 || (weekly && weekly.hit_protein > 0)) && (
        <div className="streak-banner">
          {streak > 0 && (
            <span className="streak-pill">🔥 {streak} day{streak === 1 ? '' : 's'} streak</span>
          )}
          {weekly && (
            <span className="streak-meta">
              {weekly.hit_protein}/{weekly.days} protein · {weekly.hit_calories}/{weekly.days} calories this week
            </span>
          )}
        </div>
      )}

      {/* Water Card */}
      <div className="card water-card">
        <div className="macro-header">
          <span className="macro-label">💧 Water</span>
          <span className="macro-value">{Math.round(waterToday)} / {Math.round(waterGoal)} oz</span>
        </div>
        <div className="progress-bar-container">
          <div
            className="progress-bar"
            style={{ width: `${waterPct}%`, backgroundColor: '#0ea5e9' }}
          />
        </div>
        <div className="water-actions">
          <button className="water-minus" disabled={busy || waterToday <= 0} onClick={() => handleAddWater(-8)}>−8 oz</button>
          <button disabled={busy} onClick={() => handleAddWater(8)}>+8 oz</button>
          <button disabled={busy} onClick={() => handleAddWater(16)}>+16 oz</button>
          <button disabled={busy} onClick={() => handleAddWater(24)}>+24 oz</button>
        </div>
      </div>

      {/* Calories Card */}
      <div className="card calories-card">
        <div className="calories-main">
          <div className="calories-number">{Math.round(today_totals.calories)}</div>
          <div className="calories-label">calories</div>
        </div>
        <div className="progress-bar-container">
          <div
            className="progress-bar"
            style={{
              width: `${getProgress(today_totals.calories, goals.calories_goal)}%`,
              backgroundColor: getProgress(today_totals.calories, goals.calories_goal) > 100 ? '#ef4444' : '#3b82f6',
            }}
          />
        </div>
        <div className="progress-text">
          {Math.round(today_totals.calories)} / {goals.calories_goal} kcal
        </div>
      </div>

      {/* Macro Cards */}
      <div className="macros-grid">
        <MacroCard
          label="Protein"
          current={today_totals.protein_g}
          goal={goals.protein_goal_g}
          unit="g"
        />
        <MacroCard
          label="Carbs"
          current={today_totals.carbs_g}
          goal={goals.carbs_goal_g}
          unit="g"
        />
        <MacroCard
          label="Fat"
          current={today_totals.fat_g}
          goal={goals.fat_goal_g}
          unit="g"
        />
        <MacroCard
          label="Fiber"
          current={today_totals.fiber_g}
          goal={goals.fiber_goal_g}
          unit="g"
        />
      </div>

      {/* Recent Logs */}
      <div className="section">
        <h2 className="section-title">Recent Meals</h2>
        {recentLogs.length === 0 ? (
          <div className="empty-state">No meals logged today</div>
        ) : (
          <div className="logs-list">
            {recentLogs.map((log) => (
              <LogCard
                key={log.id}
                log={log}
                expanded={expandedLogs.has(log.id)}
                onToggle={() => toggleLog(log.id)}
                onRelog={() => handleRelog(log.raw_text)}
                busy={busy}
              />
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={loadData} className="retry-button-small">Retry</button>
        </div>
      )}
    </div>
  )
}

function MacroCard({
  label,
  current,
  goal,
  unit,
}: {
  label: string
  current: number
  goal: number
  unit: string
}) {
  const progress = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0

  return (
    <div className="macro-card">
      <div className="macro-header">
        <span className="macro-label">{label}</span>
        <span className="macro-value">
          {current.toFixed(1)} / {goal} {unit}
        </span>
      </div>
      <div className="progress-bar-container">
        <div
          className="progress-bar"
          style={{
            width: `${progress}%`,
            backgroundColor: progress > 100 ? '#ef4444' : '#10b981',
          }}
        />
      </div>
      <div className="macro-percent">{progress}%</div>
    </div>
  )
}

function LogCard({
  log,
  expanded,
  onToggle,
  onRelog,
  busy,
}: {
  log: MealLog
  expanded: boolean
  onToggle: () => void
  onRelog: () => void
  busy: boolean
}) {
  const mealTime = new Date(log.meal_time)
  const timeStr = mealTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className="log-card" onClick={onToggle}>
      <div className="log-header">
        <div className="log-time">{timeStr}</div>
        <div className="log-calories">{Math.round(log.totals.calories)} kcal</div>
        <div className="log-expand">{expanded ? '▼' : '▶'}</div>
      </div>
      <div className="log-text">{log.raw_text}</div>
      {expanded && (
        <div className="log-details">
          <div className="log-items">
            {log.items.map((item, idx) => (
              <div key={idx} className="log-item">
                <span className="item-name">{item.name}</span>
                <span className="item-qty">{item.qty}</span>
                <span className="item-calories">{Math.round(item.calories)} kcal</span>
              </div>
            ))}
          </div>
          <div className="log-macros">
            <span>P: {log.totals.protein_g.toFixed(1)}g</span>
            <span>C: {log.totals.carbs_g.toFixed(1)}g</span>
            <span>F: {log.totals.fat_g.toFixed(1)}g</span>
            <span>Fiber: {log.totals.fiber_g.toFixed(1)}g</span>
          </div>
          {log.assumptions.length > 0 && (
            <div className="log-assumptions">
              <strong>Assumptions:</strong> {log.assumptions.join(', ')}
            </div>
          )}
          <button
            className="relog-button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation()
              onRelog()
            }}
          >
            ↻ Log again now
          </button>
        </div>
      )}
    </div>
  )
}
