import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { getLogs } from '../api'
import { GetLogsResponse, NutritionGoals } from '../types'
import { getGoals } from '../utils/goals'
import './Trends.css'

export default function Trends() {
  const [data, setData] = useState<GetLogsResponse | null>(null)
  const [goals, setGoals] = useState<NutritionGoals>(getGoals())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState('14d')

  useEffect(() => {
    loadData()
    const handleGoalsUpdate = () => {
      setGoals(getGoals())
    }
    window.addEventListener('goalsUpdated', handleGoalsUpdate)
    window.addEventListener('storage', handleGoalsUpdate)
    return () => {
      window.removeEventListener('goalsUpdated', handleGoalsUpdate)
      window.removeEventListener('storage', handleGoalsUpdate)
    }
  }, [range])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await getLogs({ range, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
      setData(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="trends">Loading...</div>
  }

  if (error) {
    return (
      <div className="trends">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={loadData} className="retry-button">Retry</button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { daily_totals, last_7_avg } = data

  // Format data for charts (include goals for overlay)
  const chartData = daily_totals.map((day) => ({
    date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    calories: day.calories,
    protein: day.protein_g,
    fiber: day.fiber_g,
    carbs: day.carbs_g,
    fat: day.fat_g,
    caloriesGoal: goals.calories_goal,
    proteinGoal: goals.protein_goal_g,
    fiberGoal: goals.fiber_goal_g,
  }))

  return (
    <div className="trends">
      <h1 className="page-title">Trends</h1>

      <div className="range-selector">
        <button
          className={range === '7d' ? 'active' : ''}
          onClick={() => setRange('7d')}
        >
          7 days
        </button>
        <button
          className={range === '14d' ? 'active' : ''}
          onClick={() => setRange('14d')}
        >
          14 days
        </button>
        <button
          className={range === '30d' ? 'active' : ''}
          onClick={() => setRange('30d')}
        >
          30 days
        </button>
        <button
          className={range === '90d' ? 'active' : ''}
          onClick={() => setRange('90d')}
        >
          90 days
        </button>
      </div>

      {/* Last 7 Day Average */}
      <div className="card avg-card">
        <h3 className="card-title">Last 7 Day Average</h3>
        <div className="avg-stats">
          <div className="avg-stat">
            <span className="avg-label">Calories</span>
            <span className="avg-value">{last_7_avg.calories}</span>
          </div>
          <div className="avg-stat">
            <span className="avg-label">Protein</span>
            <span className="avg-value">{last_7_avg.protein_g.toFixed(1)}g</span>
          </div>
          <div className="avg-stat">
            <span className="avg-label">Fiber</span>
            <span className="avg-value">{last_7_avg.fiber_g.toFixed(1)}g</span>
          </div>
        </div>
      </div>

      {/* Calories Chart */}
      <div className="card chart-card">
        <h3 className="card-title">Calories per Day</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="date" stroke="#666" fontSize={12} />
            <YAxis stroke="#666" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
              }}
            />
            <Line
              type="monotone"
              dataKey="calories"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
              name="Calories"
            />
            {goals.calories_goal > 0 && (
              <Line
                type="monotone"
                dataKey="caloriesGoal"
                stroke="#ef4444"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                name="Goal"
              />
            )}
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Fiber Chart */}
      <div className="card chart-card">
        <h3 className="card-title">Fiber per Day</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="date" stroke="#666" fontSize={12} />
            <YAxis stroke="#666" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
              }}
            />
            <Line
              type="monotone"
              dataKey="fiber"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ fill: '#10b981', r: 4 }}
              name="Fiber (g)"
            />
            {goals.fiber_goal_g > 0 && (
              <Line
                type="monotone"
                dataKey="fiberGoal"
                stroke="#ef4444"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                name="Goal"
              />
            )}
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Protein Chart */}
      <div className="card chart-card">
        <h3 className="card-title">Protein per Day</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="date" stroke="#666" fontSize={12} />
            <YAxis stroke="#666" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
              }}
            />
            <Line
              type="monotone"
              dataKey="protein"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ fill: '#8b5cf6', r: 4 }}
              name="Protein (g)"
            />
            {goals.protein_goal_g > 0 && (
              <Line
                type="monotone"
                dataKey="proteinGoal"
                stroke="#ef4444"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                name="Goal"
              />
            )}
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
