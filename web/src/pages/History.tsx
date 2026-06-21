import { useEffect, useState } from 'react'
import { getLogs, deleteMeal, updateMeal, previewMeal, saveMeal } from '../api'
import { GetLogsResponse, MealLog, MealItem } from '../types'
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
  const [parsing, setParsing] = useState(false)
  const [reviewItems, setReviewItems] = useState<MealItem[] | null>(null)
  const [reviewMeta, setReviewMeta] = useState<{ confidence: number; assumptions: string[] } | null>(null)
  const [editingLog, setEditingLog] = useState<MealLog | null>(null)
  const [editTime, setEditTime] = useState('') // datetime-local string
  const [editValues, setEditValues] = useState({
    calories: 0,
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

  // Step 1: parse the typed text with AI but don't save yet
  const handleParse = async () => {
    if (!quickAddText.trim()) return
    try {
      setParsing(true)
      setError(null)
      const result = await previewMeal(quickAddText.trim())
      setReviewItems(result.items)
      setReviewMeta({ confidence: result.confidence, assumptions: result.assumptions })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse meal')
    } finally {
      setParsing(false)
    }
  }

  // Edit a single field of a reviewed item
  const updateReviewItem = (idx: number, field: keyof MealItem, value: string) => {
    setReviewItems((prev) => {
      if (!prev) return prev
      const next = [...prev]
      const numeric = field !== 'name' && field !== 'qty'
      next[idx] = { ...next[idx], [field]: numeric ? parseFloat(value) || 0 : value }
      return next
    })
  }

  const removeReviewItem = (idx: number) => {
    setReviewItems((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev))
  }

  // Step 2: save the confirmed/edited items
  const handleConfirmSave = async () => {
    if (!reviewItems || reviewItems.length === 0) return
    try {
      setSubmitting(true)
      setError(null)
      await saveMeal({
        raw_text: quickAddText.trim(),
        items: reviewItems,
        confidence: reviewMeta?.confidence,
        assumptions: reviewMeta?.assumptions,
      })
      resetQuickAdd()
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save meal')
    } finally {
      setSubmitting(false)
    }
  }

  const resetQuickAdd = () => {
    setQuickAddText('')
    setReviewItems(null)
    setReviewMeta(null)
    setShowQuickAdd(false)
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
    setEditTime(toLocalInput(new Date(log.meal_time)))
    setEditValues({
      calories: log.totals.calories,
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
      const iso = editTime ? new Date(editTime).toISOString() : undefined
      await updateMeal(editingLog.id, editValues, iso)
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
          onClick={() => (showQuickAdd ? resetQuickAdd() : setShowQuickAdd(true))}
        >
          {showQuickAdd ? 'Cancel' : '+ Add Meal'}
        </button>
      </div>

      {showQuickAdd && (
        <div className="quick-add-card">
          <h3 className="card-title">Add Meal</h3>
          <textarea
            className="quick-add-input"
            placeholder="Type what you ate, e.g., 'Jack Link's beef jerky packet'"
            value={quickAddText}
            onChange={(e) => setQuickAddText(e.target.value)}
            rows={3}
            disabled={!!reviewItems}
          />

          {!reviewItems ? (
            <button
              className="submit-button"
              onClick={handleParse}
              disabled={!quickAddText.trim() || parsing}
            >
              {parsing ? 'Looking it up…' : 'Look up nutrition'}
            </button>
          ) : (
            <div className="review-section">
              <p className="review-hint">
                Review and edit each food, then confirm.
                {reviewMeta && reviewMeta.confidence < 0.7 && (
                  <span className="review-confidence"> (AI confidence {Math.round(reviewMeta.confidence * 100)}%)</span>
                )}
              </p>

              {reviewItems.length === 0 && (
                <div className="empty-state">All items removed. Re-parse or cancel.</div>
              )}

              {reviewItems.map((item, idx) => (
                <div key={idx} className="review-item">
                  <div className="review-item-head">
                    <input
                      className="review-name"
                      value={item.name}
                      onChange={(e) => updateReviewItem(idx, 'name', e.target.value)}
                    />
                    <button className="review-remove" onClick={() => removeReviewItem(idx)} aria-label="Remove">×</button>
                  </div>
                  <input
                    className="review-qty"
                    value={item.qty}
                    onChange={(e) => updateReviewItem(idx, 'qty', e.target.value)}
                    placeholder="Quantity"
                  />
                  <div className="review-macros-grid">
                    <ReviewField label="Cal" value={item.calories} onChange={(v) => updateReviewItem(idx, 'calories', v)} />
                    <ReviewField label="P" value={item.protein_g} onChange={(v) => updateReviewItem(idx, 'protein_g', v)} />
                    <ReviewField label="C" value={item.carbs_g} onChange={(v) => updateReviewItem(idx, 'carbs_g', v)} />
                    <ReviewField label="F" value={item.fat_g} onChange={(v) => updateReviewItem(idx, 'fat_g', v)} />
                    <ReviewField label="Fib" value={item.fiber_g} onChange={(v) => updateReviewItem(idx, 'fiber_g', v)} />
                  </div>
                </div>
              ))}

              <div className="review-total">
                Total: {Math.round(reviewItems.reduce((s, i) => s + (i.calories || 0), 0))} kcal ·
                P {reviewItems.reduce((s, i) => s + (i.protein_g || 0), 0).toFixed(1)} ·
                C {reviewItems.reduce((s, i) => s + (i.carbs_g || 0), 0).toFixed(1)} ·
                F {reviewItems.reduce((s, i) => s + (i.fat_g || 0), 0).toFixed(1)}
              </div>

              <div className="review-actions">
                <button className="secondary-button" onClick={() => { setReviewItems(null); setReviewMeta(null) }}>
                  Re-parse
                </button>
                <button
                  className="submit-button"
                  onClick={handleConfirmSave}
                  disabled={submitting || reviewItems.length === 0}
                >
                  {submitting ? 'Saving…' : 'Confirm & Save'}
                </button>
              </div>
            </div>
          )}
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
          time={editTime}
          onTimeChange={setEditTime}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
        />
      )}
    </div>
  )
}

// Format a Date into the value a <input type="datetime-local"> expects,
// in the user's local timezone.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ReviewField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: string) => void
}) {
  return (
    <div className="review-field">
      <label>{label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min="0"
      />
    </div>
  )
}

function EditModal({
  log,
  values,
  onValuesChange,
  time,
  onTimeChange,
  onSave,
  onCancel,
}: {
  log: MealLog
  values: { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }
  onValuesChange: (values: { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }) => void
  time: string
  onTimeChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Edit Meal</h3>
        <p className="modal-subtitle">{log.raw_text}</p>

        <div className="edit-form">
          <div className="edit-field">
            <label>Date &amp; time</label>
            <input
              type="datetime-local"
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
            />
          </div>
          <div className="edit-field">
            <label>Calories (kcal)</label>
            <input
              type="number"
              value={values.calories}
              onChange={(e) => onValuesChange({ ...values, calories: parseFloat(e.target.value) || 0 })}
              step="1"
            />
          </div>
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
