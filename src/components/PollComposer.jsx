import { useEffect, useState } from 'react'
import { Sheet } from './Sheet.jsx'
import Button from './Button.jsx'
import useDiscardGuard from '../lib/useDiscardGuard.js'
import DiscardConfirm from './DiscardConfirm.jsx'

// The create-poll sheet — WhatsApp's shape: a question, 2–12 options that grow
// as you fill the last one, and an "allow multiple answers" toggle. Validation
// mirrors create_poll() server-side, so a poll that this lets you send is one
// the server will accept. Spec: claude/plans/2026-08-27-chat-polls.md.

const MAX_OPTIONS = 12

export default function PollComposer({ open, onClose, onSubmit, busy = false }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [multiple, setMultiple] = useState(false)
  // A mis-tap on the backdrop must not throw a half-written poll away (Jay, 3 Sep 2026).
  const guard = useDiscardGuard({
    dirty: question.trim() !== '' || options.some((option) => option.trim() !== ''),
    saving: busy,
    onClose,
  })

  // Each open is a fresh poll. Sheet renders nothing when closed but this
  // component instance stays mounted in the parent, so reset on the open edge.
  useEffect(() => {
    if (open) {
      setQuestion('')
      setOptions(['', ''])
      setMultiple(false)
    }
  }, [open])

  function setOption(i, value) {
    setOptions((prev) => {
      const next = prev.slice()
      next[i] = value
      // typing into the last box grows a new empty one, up to the cap
      if (value.trim() && i === next.length - 1 && next.length < MAX_OPTIONS) next.push('')
      return next
    })
  }

  function removeOption(i) {
    setOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, j) => j !== i)))
  }

  const cleaned = options.map((o) => o.trim()).filter(Boolean)
  const valid = question.trim().length > 0 && cleaned.length >= 2

  function submit() {
    if (!valid || busy) return
    onSubmit({ question: question.trim(), options: cleaned, allowMultiple: multiple })
  }

  const field =
    'w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint outline-none focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand'

  return (
    <Sheet open={open} onClose={guard.requestClose} title="New poll">
      {guard.confirming && <DiscardConfirm id="poll-discard" onDiscard={guard.discard} onKeep={guard.keep} />}
      <div className="flex flex-col gap-3" data-testid="poll-composer">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-muted">Question</span>
          <input
            className={field}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Which weekend for the social?"
            maxLength={2000}
            data-testid="poll-question"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-muted">Options</span>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <label className="sr-only" htmlFor={`poll-option-${i}`}>{`Option ${i + 1}`}</label>
              <input
                id={`poll-option-${i}`}
                className={field}
                value={o}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                maxLength={100}
                data-testid={`poll-option-input-${i}`}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  aria-label={`Remove option ${i + 1}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-mute text-ink-muted hover:text-ink"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[10px] bg-surface-mute px-3 py-2.5">
          <span className="text-[13.5px] font-semibold text-ink">Allow multiple answers</span>
          <input
            type="checkbox"
            checked={multiple}
            onChange={(e) => setMultiple(e.target.checked)}
            className="h-5 w-5 accent-brand"
            data-testid="poll-allow-multiple"
          />
        </label>

        <Button variant="primary" full onClick={submit} disabled={!valid || busy} data-testid="poll-create">
          {busy ? 'Posting…' : 'Post poll'}
        </Button>
      </div>
    </Sheet>
  )
}
