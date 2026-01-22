import { useState, useEffect } from 'react'
import { getLogs } from '../api'
import { NutritionGoals, GetLogsResponse } from '../types'
import { getGoals, saveGoals } from '../utils/goals'
import './Settings.css'

export default function Settings() {
  const [goals, setGoals] = useState<NutritionGoals>(getGoals())
  const [saved, setSaved] = useState(false)
  const [data, setData] = useState<GetLogsResponse | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const response = await getLogs({ range: '90d', tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
      setData(response)
    } catch (err) {
      console.error('Failed to load data for export', err)
    }
  }

  const handleChange = (field: keyof NutritionGoals, value: string) => {
    const numValue = parseFloat(value) || 0
    setGoals((prev) => ({ ...prev, [field]: numValue }))
    setSaved(false)
  }

  const handleSave = () => {
    try {
      saveGoals(goals)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      // Trigger custom event for same-tab updates
      window.dispatchEvent(new CustomEvent('goalsUpdated'))
      // Trigger storage event for other tabs
      window.dispatchEvent(new Event('storage'))
    } catch (err) {
      alert('Failed to save goals')
    }
  }

  const handleExport = () => {
    if (!data) {
      alert('No data available to export')
      return
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      goals,
      logs: data.logs,
      today_totals: data.today_totals,
      daily_totals: data.daily_totals,
      last_7_avg: data.last_7_avg,
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kaltrack-export-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="settings">
      <h1 className="page-title">Settings</h1>

      <div className="card">
        <h2 className="section-title">Nutrition Goals</h2>
        <p className="section-description">
          Set your daily nutrition targets. These are stored locally on your device.
        </p>

        <div className="goals-form">
          <GoalInput
            label="Calories (kcal)"
            value={goals.calories_goal}
            onChange={(v) => handleChange('calories_goal', v)}
          />
          <GoalInput
            label="Protein (g)"
            value={goals.protein_goal_g}
            onChange={(v) => handleChange('protein_goal_g', v)}
          />
          <GoalInput
            label="Carbs (g)"
            value={goals.carbs_goal_g}
            onChange={(v) => handleChange('carbs_goal_g', v)}
          />
          <GoalInput
            label="Fat (g)"
            value={goals.fat_goal_g}
            onChange={(v) => handleChange('fat_goal_g', v)}
          />
          <GoalInput
            label="Fiber (g)"
            value={goals.fiber_goal_g}
            onChange={(v) => handleChange('fiber_goal_g', v)}
          />
          <GoalInput
            label="Sugar (g)"
            value={goals.sugar_goal_g || 0}
            onChange={(v) => handleChange('sugar_goal_g', v)}
            optional
          />
          <GoalInput
            label="Sodium (mg)"
            value={goals.sodium_goal_mg || 0}
            onChange={(v) => handleChange('sodium_goal_mg', v)}
            optional
          />
        </div>

        <button className="save-button" onClick={handleSave}>
          {saved ? '✓ Saved' : 'Save Goals'}
        </button>
      </div>

      <div className="card">
        <h2 className="section-title">Export Data</h2>
        <p className="section-description">
          Download all your meal logs and nutrition data as JSON.
        </p>
        <button className="export-button" onClick={handleExport} disabled={!data}>
          {data ? 'Export Data' : 'Loading...'}
        </button>
      </div>

      <div className="card">
        <h2 className="section-title">About</h2>
        <p className="section-description">
          KalTrack is a personal meal logging app. Your data is stored in Supabase
          and goals are stored locally on your device.
        </p>
      </div>
    </div>
  )
}

function GoalInput({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string
  value: number
  onChange: (value: string) => void
  optional?: boolean
}) {
  return (
    <div className="goal-input-group">
      <label className="goal-label">
        {label}
        {optional && <span className="optional"> (optional)</span>}
      </label>
      <input
        type="number"
        className="goal-input"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        min="0"
        step={label.includes('Sodium') ? '10' : label.includes('Calories') ? '50' : '1'}
      />
    </div>
  )
}
