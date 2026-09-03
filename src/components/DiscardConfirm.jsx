import Button from './Button.jsx'

/**
 * "Discard your changes?" — the inline two-step the event form introduced in
 * #631, as one component so every sheet asks the same way. Never a native
 * confirm() (RESTORE.md). `danger` is the CONFIRM of the pair: the arming tap
 * was the close itself. Button defaults type="button", so neither of these
 * submits a form they sit inside.
 */
export default function DiscardConfirm({ onDiscard, onKeep, id = 'discard' }) {
  return (
    <div
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      data-testid="discard-confirm"
      className="mb-3.5 rounded-[11px] border border-line bg-surface-mute px-3 py-2.5"
    >
      <p id={`${id}-title`} className="text-sm font-bold text-ink">
        Discard your changes?
      </p>
      <p id={`${id}-body`} className="mt-0.5 text-[12.5px] text-ink-muted">
        Nothing has been saved yet.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="danger" onClick={onDiscard}>
          Discard
        </Button>
        <Button variant="ghost" onClick={onKeep}>
          Keep editing
        </Button>
      </div>
    </div>
  )
}
