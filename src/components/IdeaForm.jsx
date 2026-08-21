import { useState } from 'react'
import Button from './Button.jsx'
import { Sheet } from './Sheet.jsx'
import { submitIdea } from '../data/socialIdeas.js'
import { useAuth } from '../lib/auth.jsx'

// "Send the club a post idea" — the member-facing half of Social Media
// Management. Ruling: claude/decisions/2026-08-12-social-media-management.md.
//
// ⚠️ THE CONSENT LINE IS REQUIRED COPY, NOT DECORATION — Jay agreed it
// explicitly. This is the widest door in the app: any member can put an image
// into club storage, that image may contain other people's children, and the
// manager is the only gate before anything reaches Instagram.
//
// ⚠️ AND IT IS A PROMPT, NOT A CONTROL. Nothing here verifies consent and
// nothing here can. If the club ever wants a real gate it is a second reviewer
// or a consent register, and neither exists. Do not let this sentence be read
// as though it does the work.
//
// ⚠️ NOTHING IN THIS FORM SETS `from_staff`, `club_id`, `submitted_by` OR
// `status`. All four are stamped by a BEFORE INSERT trigger from the
// submitter's own membership. A browser-supplied "I am staff" would be a
// self-awarded triage priority.

export default function IdeaForm({ open, onClose, event = null, onSubmitted }) {
  const { user } = useAuth()
  const [body, setBody] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  function reset() {
    setBody('')
    setFile(null)
    setError(null)
    setSent(false)
  }

  async function send(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await submitIdea({
        profileId: user?.id,
        body,
        eventId: event?.id ?? null,
        file,
      })
      setSent(true)
      setBody('')
      setFile(null)
      onSubmitted?.()
    } catch (err) {
      setError(err.message || 'That could not be sent. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => { reset(); onClose?.() }}
      title="Send a post idea"
    >
      {sent ? (
        <div className="p-1">
          <p className="text-sm leading-relaxed text-ink">
            Sent — thank you. The social media manager will see it.
          </p>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => setSent(false)} variant="secondary">Send another</Button>
            <Button onClick={() => { reset(); onClose?.() }}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={send} className="p-1">
          {event && (
            <p className="mb-3 text-[13px] text-ink-muted">
              About <strong className="text-ink">{event.title || event.opponent || 'this event'}</strong>.
            </p>
          )}

          <label className="block text-[13px] font-bold text-ink" htmlFor="idea-body">
            What should we post?
          </label>
          <textarea
            id="idea-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            required
            className="mt-1 w-full rounded-[11px] border border-line bg-surface-card p-3 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            placeholder="A great win for the U12s, and the girls' first try of the season…"
          />

          <label className="mt-4 block text-[13px] font-bold text-ink" htmlFor="idea-photo">
            Add a photo (optional)
          </label>
          <input
            id="idea-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-[13px] text-ink"
          />

          {/* ⚠️ REQUIRED COPY. See the header. */}
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
            Photos you send here may be published on the club’s social media. Please only
            send photos you are happy for the club to use, and that the people in them
            would be happy with too.
          </p>

          {error && (
            <p role="alert" className="mt-3 text-[13px] font-medium text-danger-ink">{error}</p>
          )}

          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={saving || !body.trim()}>
              {saving ? 'Sending…' : 'Send idea'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { reset(); onClose?.() }}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
