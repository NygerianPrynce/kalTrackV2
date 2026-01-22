import { useEffect, useState } from 'react'
import { getLogs, logMeal } from '../api'
import { GetLogsResponse, MealLog } from '../types'
import './History.css'

export default function History() {
  const [data, setData] = useState<GetLogsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickAddText, setQuickAddText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await getLogs({ range: '30d', tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
      setData(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAdd = async () => {
    if (!quickAddText.trim()) return

    try {
      setSubmitting(true)
      setError(null)
      await logMeal({ text: quickAddText.trim() })
      setQuickAddText('')
      setShowQuickAdd(false)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log meal')
    } finally {
      setSubmitting(false)
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

  if (loading && !data) {
    return <div className="history">Loading...</div>
  }

  if (error && !data) {
    return (
      <div className="history">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={loadData} className="retry-button">Retry</button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const filteredLogs = data.logs.filter((log) =>
    log.raw_text.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="history">
      <div className="history-header">
        <h1 className="page-title">History</h1>
        <button
          className="add-button"
          onClick={() => setShowQuickAdd(!showQuickAdd)}
        >
          {showQuickAdd ? 'Cancel' : '+ Add Meal'}
        </button>
      </div>

      {showQuickAdd && (
        <div className="quick-add-card">
          <h3 className="card-title">Quick Add Meal</h3>
          <textarea
            className="quick-add-input"
            placeholder="Describe what you ate, e.g., 'Grilled chicken breast, 200g, with brown rice and steamed broccoli'"
            value={quickAddText}
            onChange={(e) => setQuickAddText(e.target.value)}
            rows={3}
          />
          <button
            className="submit-button"
            onClick={handleQuickAdd}
            disabled={!quickAddText.trim() || submitting}
          >
            {submitting ? 'Logging...' : 'Log Meal'}
          </button>
        </div>
      )}

      <div className="search-box">
        <input
          type="text"
          placeholder="Search meals..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      {filteredLogs.length === 0 ? (
        <div className="empty-state">
          {searchQuery ? 'No meals found matching your search' : 'No meals logged yet'}
        </div>
      ) : (
        <div className="logs-list">
          {filteredLogs.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              expanded={expandedLogs.has(log.id)}
              onToggle={() => toggleLog(log.id)}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={loadData} className="retry-button-small">Retry</button>
        </div>
      )}
    </div>
  )
}

function LogCard({
  log,
  expanded,
  onToggle,
}: {
  log: MealLog
  expanded: boolean
  onToggle: () => void
}) {
  const mealTime = new Date(log.meal_time)
  const dateStr = mealTime.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timeStr = mealTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className="log-card" onClick={onToggle}>
      <div className="log-header">
        <div className="log-date-time">
          <div className="log-date">{dateStr}</div>
          <div className="log-time">{timeStr}</div>
        </div>
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
          {log.confidence < 0.7 && (
            <div className="log-confidence">
              <strong>Confidence:</strong> {Math.round(log.confidence * 100)}%
            </div>
          )}
        </div>
      )}
    </div>
  )
}
