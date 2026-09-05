import { useCallback, useEffect, useState } from 'react'
import { friendlyMessage } from '../lib/friendlyError.js'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import { Empty } from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { listOpenReports, removeMessage, resolveReport } from '../data/messages.js'
import { postedLabel } from '../lib/notices.js'
import { isFileAttachment } from '../data/chatMedia.js'
import FileCard from '../components/FileCard.jsx'
import { WelfareGate } from './Welfare.jsx'

// Reported messages — the Welfare portal's queue. Each report shows the
// message, who reported it and why; the two actions are "remove the message"
// (a soft delete, the words go, the row stays) and "resolve" (leave it up).
// Removing also resolves.

function whereFor(message) {
  if (!message) return '/chat'
  if (message.channel === 'dm') return `/chat/dm/${message.conversation_id}`
  if (message.channel === 'staff') return `/chat/${message.team_id}?channel=staff`
  return message.team_id ? `/chat/${message.team_id}` : '/chat/club'
}

export default function WelfareReports() {
  return (
    <WelfareGate>
      <Queue />
    </WelfareGate>
  )
}

function Queue() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setRows(await listOpenReports())
    } catch (err) {
      setError(friendlyMessage(err, 'We could not load the reports.'))
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function act(report, remove) {
    try {
      if (remove && !report.message) {
        // The joined message came back empty — removing "nothing" quietly
        // looked like success once (24 Aug 2026). Say so instead.
        throw new Error('The reported message could not be loaded, so it was not removed. Reload and try again.')
      }
      // Resolve FIRST: a delete is real since 24 Aug 2026 and cascades the
      // report row, so resolving afterwards would have nothing to resolve.
      await resolveReport(report.id)
      if (remove && report.message) await removeMessage(report.message.id)
      await load()
    } catch (err) {
      setError(friendlyMessage(err, 'Could not do that.'))
    }
  }

  return (
    <section className="px-1">
      <div className="mb-3.5 mt-1">
        <Kicker>Welfare</Kicker>
        <AccentTitle lead="Reported" accent="messages." />
      </div>
      {error && (
        <Card className="mb-3 px-4 py-3">
          <p role="alert" className="text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        </Card>
      )}
      {rows === null && !error && (
        <div className="py-8">
          <Spinner />
        </div>
      )}
      {rows?.length === 0 && <Empty message="Nothing reported. That is the good outcome." />}
      {rows?.map((r) => (
        <Card key={r.id} className="mb-2.5 px-4 py-3" data-testid="report-row">
          <p className="text-[11.5px] font-semibold text-ink-faint">
            Reported by {r.reporter?.full_name ?? 'somebody'} · {postedLabel(r.created_at)}
          </p>
          <p className="mt-1 text-[13.5px] font-bold text-ink">“{r.reason}”</p>
          <blockquote className="mt-2 rounded-[10px] border-l-[3px] border-line bg-surface-mute px-3 py-2 text-[13.5px] text-ink">
            {r.message?.deleted_at ? (
              <em className="text-ink-faint">Already removed</em>
            ) : (
              <>
                {r.message?.body}
                {isFileAttachment(r.message?.attachment_path) && (
                  <FileCard
                    path={r.message.attachment_path}
                    name={r.message.attachments?.[0]?.name}
                    size={r.message.attachments?.[0]?.size}
                    type={r.message.attachments?.[0]?.type}
                  />
                )}
              </>
            )}
            <span className="mt-1 block text-[11.5px] font-semibold text-ink-faint">— {r.message?.author?.full_name ?? 'unknown'}</span>
          </blockquote>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Link to={whereFor(r.message)} className="text-[12.5px] font-bold text-brand-ink underline-offset-2 hover:underline">
              Open where it was said
            </Link>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => act(r, false)}>
              Leave it, resolve
            </Button>
            <Button size="sm" variant="danger" onClick={() => act(r, true)} disabled={Boolean(r.message?.deleted_at)}>
              Remove message
            </Button>
          </div>
        </Card>
      ))}
    </section>
  )
}
