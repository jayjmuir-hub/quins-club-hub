import { useMemo, useState } from 'react'
import Button from './Button.jsx'
import NoticeComposer from './NoticeComposer.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { canPostNotice, postableTeams } from '../lib/notices.js'

// "Post a notice", wherever the person already is.
//
// ⚠️ POSTING STOPPED BEING A PLACE YOU GO — Jay, 16 Aug 2026: *"need the ability
// to post the comm from the more screen, not a seperate screen"*, and then on
// Home too. A coach at a pitch had to open More, tap through to the noticeboard,
// wait for three tables to load, and then find a button. The composer now opens
// where they are.
//
// ⚠️ ONE COMPONENT FOR BOTH ENTRY POINTS, and that is the whole reason this file
// exists rather than two nearly-identical blocks. It owns the permission check,
// the squad list, the open/close state and the composer mount — so More and Home
// cannot come to disagree about who may post or what happens afterwards, which
// is precisely the drift this codebase keeps paying for.
//
// ⚠️ IT RENDERS NOTHING FOR SOMEBODY WHO MAY NOT POST, and that is deliberate
// rather than a disabled button. A parent has no use for the concept, and an
// explanation of a control they cannot use is worse than its absence. RLS is the
// real boundary — "announcement create" in the migration; this only decides what
// is offered.
//
// ⚠️ AND IT READS `memberships`, NOT `realMemberships`. An admin previewing as a
// coach must see exactly what that coach sees, which is the entire point of the
// preview — and getting this wrong in the other direction is what
// src/lib/memberships.jsx's `status: 'active'` note is about.

/**
 * @param {object} props
 * @param {() => void} [props.onPosted]  refresh whatever list sits behind this
 * @param {string} [props.label]         the button's words
 * @param {string} [props.className]     wrapper classes, for the caller's layout
 * @param {'primary'|'secondary'} [props.variant]
 * @param {boolean} [props.full]         stretch the button to the container
 */
export default function PostNoticeAction({
  onPosted,
  label = 'Post a notice',
  className = '',
  variant = 'primary',
  full = false,
}) {
  const { memberships, teams } = useMemberships()
  const [open, setOpen] = useState(false)

  const mayPost = canPostNotice(memberships)
  const composerTeams = useMemo(() => postableTeams(memberships, teams), [memberships, teams])

  if (!mayPost) return null

  return (
    <div className={className}>
      <Button
        variant={variant}
        full={full}
        data-testid="post-notice-action"
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>

      <NoticeComposer
        open={open}
        onClose={() => setOpen(false)}
        teams={composerTeams}
        // ⚠️ THE SAME PREDICATE THE NOTICES SCREEN USES, spelled out rather than
        // imported as a helper because `postableScopes` returns it alongside two
        // other things and this is the only bit either caller wants. If a third
        // caller appears, that is the moment to give it a name.
        clubWide={(memberships ?? []).some((m) => m.role === 'admin' && m.status === 'active')}
        onPosted={() => {
          setOpen(false)
          onPosted?.()
        }}
      />
    </div>
  )
}
