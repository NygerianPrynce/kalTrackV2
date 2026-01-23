import { useEffect, useState } from 'react'
import { getLogs, logMeal, deleteMeal, updateMeal } from '../api'
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
  const [editingLog, setEditingLog] = useState<MealLog | null>(null)
  const [editValues, setEditValues] = useState({
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
  })

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

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this meal?')) return

    try {
      await deleteMeal(id)
      await loadData()
      // Remove from expanded if it was expanded
      const newExpanded = new Set(expandedLogs)
      newExpanded.delete(id)
      setExpandedLogs(newExpanded)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete meal')
    }
  }

  const handleEdit = (log: MealLog, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingLog(log)
    setEditValues({
      protein_g: log.totals.protein_g,
      carbs_g: log.totals.carbs_g,
      fat_g: log.totals.fat_g,
      fiber_g: log.totals.fiber_g,
    })
  }

  const handleSaveEdit = async () => {
    if (!editingLog) return

    try {
      setError(null)
      await updateMeal(editingLog.id, editValues)
      setEditingLog(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update meal')
    }
  }

  const handleCancelEdit = () => {
    setEditingLog(null)
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
              onDelete={handleDelete}
              onEdit={handleEdit}
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

      {editingLog && (
        <EditModal
          log={editingLog}
          values={editValues}
          onValuesChange={setEditValues}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
        />
      )}
    </div>
  )
}

function EditModal({
  log,
  values,
  onValuesChange,
  onSave,
  onCancel,
}: {
  log: MealLog
  values: { protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }
  onValuesChange: (values: { protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Edit Macros</h3>
        <p className="modal-subtitle">{log.raw_text}</p>
        
        <div className="edit-form">
          <div className="edit-field">
            <label>Protein (g)</label>
            <input
              type="number"
              value={values.protein_g}
              onChange={(e) => onValuesChange({ ...values, protein_g: parseFloat(e.target.value) || 0 })}
              step="0.1"
            />
          </div>
          <div className="edit-field">
            <label>Carbs (g)</label>
            <input
              type="number"
              value={values.carbs_g}
              onChange={(e) => onValuesChange({ ...values, carbs_g: parseFloat(e.target.value) || 0 })}
              step="0.1"
            />
          </div>
          <div className="edit-field">
            <label>Fat (g)</label>
            <input
              type="number"
              value={values.fat_g}
              onChange={(e) => onValuesChange({ ...values, fat_g: parseFloat(e.target.value) || 0 })}
              step="0.1"
            />
          </div>
          <div className="edit-field">
            <label>Fiber (g)</label>
            <input
              type="number"
              value={values.fiber_g}
              onChange={(e) => onValuesChange({ ...values, fiber_g: parseFloat(e.target.value) || 0 })}
              step="0.1"
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="cancel-button" onClick={onCancel}>
            Cancel
          </button>
          <button className="save-button" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function LogCard({
  log,
  expanded,
  onToggle,
  onDelete,
  onEdit,
}: {
  log: MealLog
  expanded: boolean
  onToggle: () => void
  onDelete: (id: string, e: React.MouseEvent) => void
  onEdit: (log: MealLog, e: React.MouseEvent) => void
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
          <div className="log-actions">
            <button className="edit-button" onClick={(e) => onEdit(log, e)}>
              Edit Macros
            </button>
            <button className="delete-button" onClick={(e) => onDelete(log.id, e)}>
              Delete
            </button>
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
