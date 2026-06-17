import { useEffect, useState } from 'react'
import { getTemplates, saveTemplate, deleteTemplate, logTemplate } from '../api'
import { DailyTemplate } from '../types'
import './Dailies.css'

const EMPTY: Partial<DailyTemplate> = {
  name: '',
  aliases: [],
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
}

export default function Dailies() {
  const [templates, setTemplates] = useState<DailyTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logged, setLogged] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Partial<DailyTemplate> | null>(null)
  const [aliasText, setAliasText] = useState('')

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      setLoading(true)
      const { templates } = await getTemplates(true)
      setTemplates(templates)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dailies')
    } finally {
      setLoading(false)
    }
  }

  const handleCheck = async (t: DailyTemplate) => {
    try {
      setBusy(true)
      await logTemplate(t.id)
      setLogged((prev) => new Set(prev).add(t.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to log')
    } finally {
      setBusy(false)
    }
  }

  const openNew = () => {
    setEditing({ ...EMPTY })
    setAliasText('')
  }

  const openEdit = (t: DailyTemplate) => {
    setEditing({ ...t })
    setAliasText((t.aliases || []).join(', '))
  }

  const handleField = (field: keyof DailyTemplate, value: string) => {
    setEditing((prev) =>
      prev ? { ...prev, [field]: field === 'name' ? value : (parseFloat(value) || 0) } : prev
    )
  }

  const handleSaveTemplate = async () => {
    if (!editing) return
    try {
      setBusy(true)
      const aliases = aliasText
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
      await saveTemplate({
        ...editing,
        aliases,
        action: editing.id ? 'update' : 'create',
      })
      setEditing(null)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this daily?')) return
    try {
      setBusy(true)
      await deleteTemplate(id)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="dailies">Loading...</div>

  return (
    <div className="dailies">
      <h1 className="page-title">Dailies</h1>
      <p className="section-description">
        Things you eat regularly. Tap to log one to today's total — no typing, no AI.
      </p>

      {error && <div className="error-message"><p>{error}</p></div>}

      <div className="dailies-list">
        {templates.filter((t) => t.is_active).length === 0 && (
          <div className="empty-state">No dailies yet. Add one below.</div>
        )}
        {templates
          .filter((t) => t.is_active)
          .map((t) => (
            <div key={t.id} className="daily-card">
              <button
                className={`daily-check ${logged.has(t.id) ? 'checked' : ''}`}
                disabled={busy}
                onClick={() => handleCheck(t)}
                aria-label={`Log ${t.name}`}
              >
                {logged.has(t.id) ? '✓' : '+'}
              </button>
              <div className="daily-info" onClick={() => openEdit(t)}>
                <div className="daily-name">{t.name}</div>
                <div className="daily-macros">
                  {t.calories} kcal · P {t.protein_g} · C {t.carbs_g} · F {t.fat_g}
                </div>
              </div>
            </div>
          ))}
      </div>

      {!editing && (
        <button className="save-button" onClick={openNew}>+ New daily</button>
      )}

      {editing && (
        <div className="card daily-editor">
          <h2 className="section-title">{editing.id ? 'Edit daily' : 'New daily'}</h2>
          <label className="goal-label">Name</label>
          <input
            className="goal-input"
            value={editing.name || ''}
            onChange={(e) => handleField('name', e.target.value)}
            placeholder="Morning coffee"
          />
          <label className="goal-label">Siri phrases (comma separated)</label>
          <input
            className="goal-input"
            value={aliasText}
            onChange={(e) => setAliasText(e.target.value)}
            placeholder="coffee, black coffee"
          />
          <div className="editor-grid">
            <Field label="Calories" value={editing.calories} onChange={(v) => handleField('calories', v)} />
            <Field label="Protein (g)" value={editing.protein_g} onChange={(v) => handleField('protein_g', v)} />
            <Field label="Carbs (g)" value={editing.carbs_g} onChange={(v) => handleField('carbs_g', v)} />
            <Field label="Fat (g)" value={editing.fat_g} onChange={(v) => handleField('fat_g', v)} />
            <Field label="Fiber (g)" value={editing.fiber_g} onChange={(v) => handleField('fiber_g', v)} />
          </div>
          <div className="editor-actions">
            <button className="save-button" disabled={busy} onClick={handleSaveTemplate}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className="cancel-button" onClick={() => setEditing(null)}>Cancel</button>
            {editing.id && (
              <button className="delete-button" onClick={() => handleDelete(editing.id!)}>Delete</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (value: string) => void
}) {
  return (
    <div className="goal-input-group">
      <label className="goal-label">{label}</label>
      <input
        type="number"
        className="goal-input"
        value={value ?? 0}
        onChange={(e) => onChange(e.target.value)}
        min="0"
      />
    </div>
  )
}
