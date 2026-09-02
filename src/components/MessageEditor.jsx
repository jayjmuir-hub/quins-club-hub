import { useEffect, useRef, useState } from 'react'
import Button from './Button.jsx'
import { friendlyMessage } from '../lib/friendlyError.js'

// The inline edit form — one component for every surface that offers Edit
// (channel posts, replies, DMs), so the affordance cannot drift the way the
// bubble itself once did. Renders IN PLACE of the bubble: the person edits
// where the words were, not in a detached sheet.
//
// ⚠️ WHO MAY EDIT, AND FOR HOW LONG, IS THE DATABASE'S RULE — author only,
// 15 minutes (private.touch_message). canStillEdit (src/lib/messageEdit.js) is
// the hint that draws the door; a refusal that slips through renders here as
// the database's own sentence rather than being re-worded.

export default function MessageEditor({ body, onSave, onCancel, busyLabel = 'Saving…' }) {
  const [draft, setDraft] = useState(body ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const ref = useRef(null)

  // Land with the cursor at the end — the common edit is fixing the tail.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  async function save(domEvent) {
    domEvent.preventDefault()
    const text = draft.trim()
    if (!text || saving) return
    // Nothing changed: treat as a cancel, not a write.
    if (text === (body ?? '').trim()) return onCancel()
    setSaving(true)
    setError(null)
    try {
      await onSave(text)
    } catch (err) {
      setError(friendlyMessage(err, 'Could not save that edit.'))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="max-w-[80%] flex-1" data-testid="message-editor">
      <label className="sr-only" htmlFor="message-edit-draft">
        Edit message
      </label>
      <textarea
        id="message-edit-draft"
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter' && !e.shiftKey) save(e)
        }}
        rows={2}
        maxLength={2000}
        className="w-full resize-none rounded-[12px] border border-brand bg-surface-card px-3 py-2 text-[14.5px] text-ink focus:outline-none"
      />
      <div className="mt-1 flex items-center justify-end gap-2">
        {error && (
          <p role="alert" className="mr-auto text-[12px] font-semibold text-danger-ink">
            {error}
          </p>
        )}
        <Button size="sm" variant="ghost" type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" type="submit" disabled={saving || !draft.trim()}>
          {saving ? busyLabel : 'Save'}
        </Button>
      </div>
    </form>
  )
}
