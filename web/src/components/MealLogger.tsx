import { useState } from 'react'
import { previewMeal, saveMeal } from '../api'
import { MealItem } from '../types'
import VoiceButton from './VoiceButton'
import './MealLogger.css'

// Reusable type-or-speak meal logger with per-item review/confirm.
// Used on the Dashboard (and reusable anywhere). Calls onSaved() after save.
export default function MealLogger({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<MealItem[] | null>(null)
  const [meta, setMeta] = useState<{ confidence: number; assumptions: string[] } | null>(null)

  const reset = () => {
    setText(''); setInterim(''); setItems(null); setMeta(null); setError(null); setOpen(false)
  }

  const handleParse = async () => {
    if (!text.trim()) return
    try {
      setParsing(true); setError(null)
      const result = await previewMeal(text.trim())
      setItems(result.items)
      setMeta({ confidence: result.confidence, assumptions: result.assumptions })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse meal')
    } finally {
      setParsing(false)
    }
  }

  const updateItem = (idx: number, field: keyof MealItem, value: string) => {
    setItems((prev) => {
      if (!prev) return prev
      const next = [...prev]
      const numeric = field !== 'name' && field !== 'qty'
      next[idx] = { ...next[idx], [field]: numeric ? parseFloat(value) || 0 : value }
      return next
    })
  }

  const removeItem = (idx: number) => setItems((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev))

  const handleSave = async () => {
    if (!items || items.length === 0) return
    try {
      setSaving(true); setError(null)
      await saveMeal({ raw_text: text.trim(), items, confidence: meta?.confidence, assumptions: meta?.assumptions })
      reset()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save meal')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button className="meal-logger-open" onClick={() => setOpen(true)}>+ Add Meal</button>
    )
  }

  return (
    <div className="card meal-logger">
      <div className="meal-logger-head">
        <h2 className="section-title">Add Meal</h2>
        <button className="meal-logger-close" onClick={reset}>Cancel</button>
      </div>

      {error && <div className="ml-error">{error}</div>}

      {!items ? (
        <>
          <VoiceButton
            onTranscript={(t) => { setText((p) => (p ? p + ' ' : '') + t); setInterim('') }}
            onInterim={setInterim}
          />
          <textarea
            className="ml-input"
            placeholder="Speak or type, e.g. 'Jack Link's beef jerky packet'"
            value={interim ? `${text} ${interim}`.trim() : text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
          />
          <button className="ml-submit" onClick={handleParse} disabled={!text.trim() || parsing}>
            {parsing ? 'Looking it up…' : 'Look up nutrition'}
          </button>
        </>
      ) : (
        <div>
          <p className="ml-hint">
            Review &amp; edit, then confirm.
            {meta && meta.confidence < 0.7 && <span className="ml-conf"> (AI {Math.round(meta.confidence * 100)}%)</span>}
          </p>
          {items.map((item, idx) => (
            <div key={idx} className="ml-item">
              <div className="ml-item-head">
                <input className="ml-name" value={item.name} onChange={(e) => updateItem(idx, 'name', e.target.value)} />
                <button className="ml-remove" onClick={() => removeItem(idx)} aria-label="Remove">×</button>
              </div>
              <input className="ml-qty" value={item.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} placeholder="Quantity" />
              <div className="ml-macros">
                <MLField label="Cal" value={item.calories} onChange={(v) => updateItem(idx, 'calories', v)} />
                <MLField label="P" value={item.protein_g} onChange={(v) => updateItem(idx, 'protein_g', v)} />
                <MLField label="C" value={item.carbs_g} onChange={(v) => updateItem(idx, 'carbs_g', v)} />
                <MLField label="F" value={item.fat_g} onChange={(v) => updateItem(idx, 'fat_g', v)} />
                <MLField label="Fib" value={item.fiber_g} onChange={(v) => updateItem(idx, 'fiber_g', v)} />
              </div>
            </div>
          ))}
          <div className="ml-total">
            Total: {Math.round(items.reduce((s, i) => s + (i.calories || 0), 0))} kcal ·
            P {items.reduce((s, i) => s + (i.protein_g || 0), 0).toFixed(1)} ·
            C {items.reduce((s, i) => s + (i.carbs_g || 0), 0).toFixed(1)} ·
            F {items.reduce((s, i) => s + (i.fat_g || 0), 0).toFixed(1)}
          </div>
          <div className="ml-actions">
            <button className="ml-secondary" onClick={() => { setItems(null); setMeta(null) }}>Re-parse</button>
            <button className="ml-submit" onClick={handleSave} disabled={saving || items.length === 0}>
              {saving ? 'Saving…' : 'Confirm & Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MLField({ label, value, onChange }: { label: string; value: number; onChange: (v: string) => void }) {
  return (
    <div className="ml-field">
      <label>{label}</label>
      <input type="number" inputMode="decimal" value={value} min="0" onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
