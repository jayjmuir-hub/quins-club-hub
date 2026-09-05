import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from './Card.jsx'
import { listPlayupRequests } from '../data/playups.js'
import { useMemberships } from '../lib/memberships.jsx'
import { isSuperAdmin } from '../lib/scope.js'

// Home peek for super admins: open play-up requests waiting on Approve.
// Club Ops hybrid C is slice 3; this is a thin inbox door only.

export default function PlayupRequestBanner() {
  const { memberships } = useMemberships()
  const superAdmin = isSuperAdmin(memberships)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!superAdmin) return undefined
    let mounted = true
    listPlayupRequests()
      .then((rows) => {
        if (mounted) setCount((rows ?? []).length)
      })
      .catch(() => {
        if (mounted) setCount(0)
      })
    return () => {
      mounted = false
    }
  }, [memberships, superAdmin])

  if (!superAdmin || count === 0) return null

  return (
    <Card data-testid="playup-request-banner" className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
      <p className="text-sm font-bold text-ink">
        {count === 1 ? '1 play-up request' : `${count} play-up requests`} waiting for a decision
      </p>
      <Link to="/admin/playups" className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
        Review
      </Link>
    </Card>
  )
}