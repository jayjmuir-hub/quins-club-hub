import { useCallback, useState } from 'react'
import { validateChatFile } from '../data/chatMedia.js'

// The composer's document slot — one file, never mixed into the photo tray
// (claude/plans/2026-09-04-chat-file-attachments.md). useAttachmentTray stays
// image-only. Drop and paste partition by type (routeChatAttachments):
// allowlisted docs land here; images go to the tray; leftover types still
// hit the tray's "not a photo" gate. This hook is also the File-menu door.

export function usePendingChatFile() {
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)

  const pick = useCallback((files) => {
    const incoming = Array.from(files ?? [])
    if (incoming.length === 0) return
    const first = incoming[0]
    const problem = validateChatFile(first)
    if (problem) {
      setError(problem)
      return
    }
    setFile(first)
    setError(null)
  }, [])

  const clear = useCallback(() => {
    setFile(null)
    setError(null)
  }, [])

  return { file, error, pick, clear, setError }
}
