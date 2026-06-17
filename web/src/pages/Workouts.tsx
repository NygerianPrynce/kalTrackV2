import { useEffect, useState } from 'react'
import { getWorkouts, previewWorkout, saveWorkout, deleteWorkout } from '../api'
import { GetWorkoutsResponse, WorkoutExercise, WorkoutLog, Muscle } from '../types'
import VoiceButton from '../components/VoiceButton'
import BodyMap from '../components/BodyMap'
import './Workouts.css'

export default function Workouts() {
  const [data, setData] = useState<GetWorkoutsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reviewItems, setReviewItems] = useState<WorkoutExercise[] | null>(null)
  const [reviewMeta, setReviewMeta] = useState<{ confidence: number; assumptions: string[] } | null>(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      setData(await getWorkouts('30d'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workouts')
    } finally {
      setLoading(false)
    }
  }

  const handleParse = async () => {
    if (!text.trim()) return
    try {
      setParsing(true)
      setError(null)
      const result = await previewWorkout(text.trim())
      setReviewItems(result.items)
      setReviewMeta({ confidence: result.confidence, assumptions: result.assumptions })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse workout')
    } finally {
      setParsing(false)
    }
  }

  const updateItem = (idx: number, field: keyof WorkoutExercise, value: string) => {
    setReviewItems((prev) => {
      if (!prev) return prev
      const next = [...prev]
      if (field === 'name') next[idx] = { ...next[idx], name: value }
      else if (field === 'muscle_groups')
        next[idx] = { ...next[idx], muscle_groups: value.split(',').map((m) => m.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean) as Muscle[] }
      else next[idx] = { ...next[idx], [field]: parseFloat(value) || 0 }
      return next
    })
  }

  const removeItem = (idx: number) =>
    setReviewItems((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev))

  const handleSave = async () => {
    if (!reviewItems || reviewItems.length === 0) return
    try {
      setSaving(true)
      setError(null)
      await saveWorkout({
        raw_text: text.trim(),
        items: reviewItems,
        confidence: reviewMeta?.confidence,
        assumptions: reviewMeta?.assumptions,
      })
      reset()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workout')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setText('')
    setInterim('')
    setReviewItems(null)
    setReviewMeta(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this workout?')) return
    try {
      await deleteWorkout(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workout')
    }
  }

  if (loading && !data) return <div className="workouts">Loading...</div>

  return (
    <div className="workouts">
      <h1 className="page-title">Workouts</h1>

      {/* Body map */}
      <div className="card">
        <BodyMap today={(data?.today_muscles as Muscle[]) || []} week={(data?.week_muscles as Muscle[]) || []} />
        {data && data.streak > 0 && (
          <div className="workout-streak">🔥 {data.streak} day workout streak</div>
        )}
      </div>

      {/* Logger */}
      <div className="card">
        <h2 className="section-title">Log a workout</h2>
        {!reviewItems ? (
          <>
            <VoiceButton
              onTranscript={(t) => { setText((prev) => (prev ? prev + ' ' : '') + t); setInterim('') }}
              onInterim={setInterim}
            />
            <textarea
              className="workout-input"
              placeholder="Speak or type, e.g. '4 sets of bench at 135 for 10, then 3 sets of pullups'"
              value={interim ? `${text} ${interim}`.trim() : text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
            />
            <button className="submit-button" onClick={handleParse} disabled={!text.trim() || parsing}>
              {parsing ? 'Parsing…' : 'Parse workout'}
            </button>
          </>
        ) : (
          <div className="review-section">
            <p className="review-hint">
              Review each exercise, then confirm.
              {reviewMeta && reviewMeta.confidence < 0.7 && (
                <span className="review-confidence"> (AI confidence {Math.round(reviewMeta.confidence * 100)}%)</span>
              )}
            </p>
            {reviewItems.map((it, idx) => (
              <div key={idx} className="review-item">
                <div className="review-item-head">
                  <input className="review-name" value={it.name} onChange={(e) => updateItem(idx, 'name', e.target.value)} />
                  <button className="review-remove" onClick={() => removeItem(idx)} aria-label="Remove">×</button>
                </div>
                <input
                  className="review-qty"
                  value={(it.muscle_groups || []).join(', ')}
                  onChange={(e) => updateItem(idx, 'muscle_groups', e.target.value)}
                  placeholder="Muscles (comma separated)"
                />
                <div className="workout-fields">
                  <WField label="Sets" value={it.sets || 0} onChange={(v) => updateItem(idx, 'sets', v)} />
                  <WField label="Reps" value={it.reps || 0} onChange={(v) => updateItem(idx, 'reps', v)} />
                  <WField label="Weight" value={it.weight || 0} onChange={(v) => updateItem(idx, 'weight', v)} />
                  <WField label="Min" value={it.duration_min || 0} onChange={(v) => updateItem(idx, 'duration_min', v)} />
                </div>
              </div>
            ))}
            <div className="review-actions">
              <button className="secondary-button" onClick={reset}>Cancel</button>
              <button className="submit-button" onClick={handleSave} disabled={saving || reviewItems.length === 0}>
                {saving ? 'Saving…' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <div className="error-banner"><p>{error}</p></div>}

      {/* Recent */}
      <div className="section">
        <h2 className="section-title">Recent Workouts</h2>
        {!data || data.workouts.length === 0 ? (
          <div className="empty-state">No workouts logged yet</div>
        ) : (
          <div className="logs-list">
            {data.workouts.map((w) => <WorkoutCard key={w.id} workout={w} onDelete={() => handleDelete(w.id)} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function WField({ label, value, onChange }: { label: string; value: number; onChange: (v: string) => void }) {
  return (
    <div className="review-field">
      <label>{label}</label>
      <input type="number" inputMode="decimal" value={value} min="0" onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function WorkoutCard({ workout, onDelete }: { workout: WorkoutLog; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const t = new Date(workout.workout_time)
  const when = t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
    t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return (
    <div className="log-card" onClick={() => setExpanded(!expanded)}>
      <div className="log-header">
        <div className="log-time">{when}</div>
        <div className="log-calories">{workout.items.length} exercise{workout.items.length === 1 ? '' : 's'}</div>
        <div className="log-expand">{expanded ? '▼' : '▶'}</div>
      </div>
      <div className="log-text">{workout.raw_text}</div>
      {expanded && (
        <div className="log-details">
          {workout.items.map((it, i) => (
            <div key={i} className="workout-exercise">
              <span className="ex-name">{it.name}</span>
              <span className="ex-detail">
                {it.sets ? `${it.sets}×${it.reps || 0}` : ''}{it.weight ? ` @ ${it.weight}${it.weight_unit || 'lb'}` : ''}
                {it.duration_min ? `${it.duration_min} min` : ''}
              </span>
              <span className="ex-muscles">{(it.muscle_groups || []).join(', ')}</span>
            </div>
          ))}
          <button className="delete-button" onClick={(e) => { e.stopPropagation(); onDelete() }}>Delete</button>
        </div>
      )}
    </div>
  )
}
