import { useEffect, useRef, useState } from 'react'
import EmojiPicker from './EmojiPicker.jsx'
import MentionPicker, { appendMention, mentionQueryAt } from './MentionPicker.jsx'
import VoiceComposer from './VoiceComposer.jsx'
import { autoGrow, composerKeyDown, insertAtCursor, pasteImages } from '../lib/chatComposer.js'
import { chatFileAccept } from '../data/chatMedia.js'
import { PICKER_ACCEPT } from '../lib/imageResize.js'

// The shared chat composer chrome — DMs, groups, channels, and the dock
// (which mounts DmThread / ChannelThread). One + menu for attach actions,
// icon Send, @ only as typeahead in a group with mentionables.
// (Jay, 5 Sep 2026.)

function AttachMenu({ allowPolls, onPhoto, onFile, onPoll }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onDocClick(domEvent) {
      if (!rootRef.current?.contains(domEvent.target)) setOpen(false)
    }
    function onKey(domEvent) {
      if (domEvent.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(action) {
    setOpen(false)
    action?.()
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Attach"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-mute"
        data-testid="attach-menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Attach"
          className="absolute bottom-full left-0 z-30 mb-1 min-w-[11.5rem] overflow-hidden rounded-[12px] border border-line bg-surface-card py-1 shadow-card"
        >
          <button
            type="button"
            role="menuitem"
            aria-label="Photo"
            data-testid="attach-menu-photo"
            onClick={() => pick(onPhoto)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] font-semibold text-ink hover:bg-surface-mute"
          >
            Photo
          </button>
          <button
            type="button"
            role="menuitem"
            aria-label="Attach a file"
            data-testid="attach-menu-file"
            onClick={() => pick(onFile)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] font-semibold text-ink hover:bg-surface-mute"
          >
            File
          </button>
          {allowPolls && (
            <button
              type="button"
              role="menuitem"
              aria-label="Create a poll"
              data-testid="attach-menu-poll"
              onClick={() => pick(onPoll)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] font-semibold text-ink hover:bg-surface-mute"
            >
              Create poll
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l16-8-6 16-3-7-7-1z" />
    </svg>
  )
}

export default function ComposerBar({
  testId,
  textareaId,
  placeholder,
  draft,
  setDraft,
  draftRef,
  mentionables = [],
  setDraftMentions,
  fileRef,
  docFileRef,
  pickPhoto,
  pickFile,
  allowPolls = false,
  onOpenPoll,
  trayCount = 0,
  hasPendingFile = false,
  sending = false,
  progress = null,
  sendLabel = 'Send',
  canVoice = true,
  onSendVoice,
  onVoiceError,
  onSubmit,
  onPasteFiles,
  onPasteFile,
}) {
  const [caret, setCaret] = useState(() => draft?.length ?? 0)
  const token = mentionables.length ? mentionQueryAt(draft, caret) : null
  const idle = !draft.trim() && trayCount === 0 && !hasPendingFile
  const showVoice = canVoice && idle && !progress

  function rememberCaret(el) {
    if (!el) return
    setCaret(el.selectionStart ?? el.value.length)
  }

  function pickMention(person) {
    const el = draftRef?.current
    const value = el?.value ?? draft
    const at = el?.selectionStart ?? caret
    const next = appendMention(value, person, at)
    setDraft(next)
    setDraftMentions?.((ms) => (ms.some((x) => x.profile_id === person.profile_id) ? ms : [...ms, person]))
    const parked = token ? token.start + person.full_name.length + 2 : next.length
    setCaret(parked)
    if (el) {
      try {
        el.setSelectionRange(parked, parked)
      } catch {
        // jsdom / some inputs refuse selection APIs
      }
    }
  }

  return (
    <form onSubmit={onSubmit} className="relative flex items-end gap-1.5" data-testid={testId}>
      <MentionPicker people={mentionables} query={token ? token.query : null} onPick={pickMention} />
      <input ref={fileRef} type="file" multiple accept={PICKER_ACCEPT} className="hidden" onChange={pickPhoto} data-testid="photo-input" />
      <input ref={docFileRef} type="file" accept={chatFileAccept()} className="hidden" onChange={pickFile} data-testid="file-input" />
      <AttachMenu
        allowPolls={allowPolls}
        onPhoto={() => fileRef?.current?.click?.()}
        onFile={() => docFileRef?.current?.click?.()}
        onPoll={onOpenPoll}
      />
      <label className="sr-only" htmlFor={textareaId}>
        Message
      </label>
      <textarea
        id={textareaId}
        ref={draftRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          rememberCaret(e.currentTarget)
        }}
        onClick={(e) => rememberCaret(e.currentTarget)}
        onKeyUp={(e) => rememberCaret(e.currentTarget)}
        onSelect={(e) => rememberCaret(e.currentTarget)}
        onInput={(e) => autoGrow(e.currentTarget)}
        onKeyDown={composerKeyDown}
        onPaste={(e) => pasteImages(e, onPasteFiles, onPasteFile)}
        rows={1}
        maxLength={2000}
        placeholder={placeholder}
        className="min-h-[44px] flex-1 resize-none rounded-[12px] border border-line bg-surface-card px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
      />
      <EmojiPicker onPick={(emoji) => setDraft(insertAtCursor(draftRef?.current, emoji))} />
      {showVoice ? (
        <VoiceComposer onSend={onSendVoice} disabled={sending} onError={onVoiceError} />
      ) : (
        <button
          type="submit"
          aria-label={sendLabel}
          disabled={sending || idle}
          className={[
            'shrink-0 place-items-center rounded-full bg-brand text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60',
            progress ? 'inline-flex h-[38px] max-w-[9rem] px-2.5 text-[11px] font-bold' : 'grid h-[38px] w-[38px]',
          ].join(' ')}
        >
          {progress ? <span data-testid="send-progress">{progress}</span> : <SendIcon />}
        </button>
      )}
    </form>
  )
}
