import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import Login from './Login.jsx'
import { deleteMyAccount } from '../data/account.js'
import Button from '../components/Button.jsx'
import { friendlyMessage } from '../lib/friendlyError.js'

// /delete-account — PUBLIC, and it is both halves of Google Play's account
// deletion requirement in one screen:
//
//   1. "a web link resource where users can request app account deletion" —
//      this URL, readable by someone who is not signed in and who may not
//      have the app installed at all. It goes on the Play listing.
//   2. "an in-app path to delete their app accounts and associated data" —
//      the same screen, reached from More, with the person already signed in.
//
// ONE screen rather than two because a second implementation of a destructive
// action is a second chance to get it wrong, and they would inevitably drift.
//
// ⚠️ WHEN SIGNED OUT THIS RENDERS THE REAL <Login/>, not a link to it.
// /delete-account is public, so RequireAuth never fires here and would never
// hand anyone a login screen. Rendering Login in place also means the magic
// link comes BACK to this page: signInWithEmail sets emailRedirectTo from
// window.location.pathname (commit 174bffd), so somebody who signs in to
// delete their account lands on the delete screen rather than the dashboard,
// which is the entire point of them being here.

const CONFIRM_WORD = 'DELETE'

function Bullet({ children }) {
  return (
    <li className="mb-1.5 flex gap-2 text-[14px] leading-relaxed text-ink-muted">
      <span aria-hidden="true" className="text-ink-faint">
        •
      </span>
      <span>{children}</span>
    </li>
  )
}

function WhatHappens() {
  return (
    <>
      <h2 className="mb-2 mt-5 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
        What gets deleted
      </h2>
      <ul className="mb-1">
        <Bullet>Your sign-in, so you can no longer get into the app.</Bullet>
        <Bullet>Your name and email address.</Bullet>
        <Bullet>Which squads you can see, and your role in the club.</Bullet>
        <Bullet>Your personal calendar link. It stops working immediately.</Bullet>
      </ul>

      <h2 className="mb-2 mt-5 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
        What stays
      </h2>
      <ul className="mb-1">
        {/* Stated plainly because it is the part people would otherwise be
            surprised by, and because a club has a real reason to keep it. */}
        <Bullet>
          Your child stays on their squad. Their place in the team is the
          club&apos;s record, not part of your account — deleting your login
          must not take a player off a coach&apos;s team sheet.
        </Bullet>
        <Bullet>
          The contact details the club holds for your family stay in the
          club&apos;s roster, the same as they were before you ever signed in.
        </Bullet>
        <Bullet>
          Fixtures, training sessions and anything else you added for the club
          stay. They belong to the club.
        </Bullet>
      </ul>

      <p className="mt-4 rounded-[11px] bg-surface-mute px-3 py-2.5 text-[13.5px] font-semibold leading-relaxed text-ink-muted">
        Because the club keeps your contact details on its roster, signing in
        again later will set your account up again automatically. If you want
        the club to remove your details from the roster too, email{' '}
        <a className="text-brand-ink underline" href="mailto:admin@adhquins-clubhub.com">
          admin@adhquins-clubhub.com
        </a>
        .
      </p>
    </>
  )
}

export default function DeleteAccount() {
  const { user } = useAuth()
  const [typed, setTyped] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'deleting' | 'done'
  const [error, setError] = useState(null)

  const deleting = status === 'deleting'
  // Case-insensitive on purpose: a phone keyboard fights an all-caps word,
  // and the point of this box is deliberateness, not typing accuracy.
  const armed = typed.trim().toUpperCase() === CONFIRM_WORD

  async function handleDelete(domEvent) {
    domEvent.preventDefault()
    if (!armed || deleting) return
    setStatus('deleting')
    setError(null)
    try {
      await deleteMyAccount()
      // Deliberately NOT redirected. They are signed out now, and bouncing
      // someone to a login screen after they asked to leave reads as though
      // it failed. This page is public, so it can simply say it is done.
      setStatus('done')
    } catch (err) {
      setError(err)
      setStatus('idle')
    }
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[560px] px-4 py-8">
      <h1 className="text-[22px] font-extrabold tracking-[-0.2px] text-ink">
        Delete your Quins Club Hub account
      </h1>

      {status === 'done' ? (
        <div className="mt-4 rounded-[14px] border-[1.5px] border-line bg-surface-card p-[18px]">
          <p className="text-[15px] font-bold text-ink">Your account has been deleted.</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            You are signed out and your sign-in no longer works. Your child
            remains on their squad, as described above.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            This removes your access to Quins Club Hub. It cannot be undone.
          </p>

          <WhatHappens />

          {user ? (
            <form
              onSubmit={handleDelete}
              noValidate
              className="mt-6 rounded-[14px] border-[1.5px] border-line bg-surface-card p-[18px]"
            >
              <p className="text-[14px] leading-relaxed text-ink-muted">
                Signed in as <span className="font-bold text-ink">{user.email}</span>.
                Type <span className="font-bold text-ink">{CONFIRM_WORD}</span> to
                confirm.
              </p>

              <label className="sr-only" htmlFor="delete-confirm">
                Type {CONFIRM_WORD} to confirm
              </label>
              <input
                id="delete-confirm"
                type="text"
                autoComplete="off"
                value={typed}
                onChange={(domEvent) => {
                  setTyped(domEvent.target.value)
                  if (error) setError(null)
                }}
                placeholder={CONFIRM_WORD}
                className="mt-3 w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand"
              />

              {error && (
                <p
                  role="alert"
                  className="mt-3 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-danger-ink"
                >
                  {friendlyMessage(error, "We couldn't delete your account. Try again.")}
                </p>
              )}

              {/* ⚠️ `danger`, not `primary`. This was `bg-brand` — the same red
                  as "Save changes" — while every other confirm-a-deletion
                  button in the app was the deeper red. The typed-confirmation
                  gate above is what ARMS it, so this is the confirm half of a
                  destructive pair and should look like one. */}
              <Button
                type="submit"
                variant="danger"
                size="lg"
                full
                disabled={!armed || deleting}
                className="mt-3"
              >
                {deleting ? 'Deleting…' : 'Delete my account'}
              </Button>

              <Link
                to="/settings"
                className="mt-3 block text-center text-[14px] font-bold text-ink-muted underline"
              >
                Cancel and go back
              </Link>
            </form>
          ) : (
            <div className="mt-6">
              <p className="mb-3 text-[14px] font-semibold leading-relaxed text-ink">
                Sign in below and you&apos;ll come straight back here to finish.
              </p>
              {/* embedded — no full-screen dark backdrop, no second <h1>.
                  This page already provides both. */}
              <Login embedded />
            </div>
          )}
        </>
      )}

      <p className="mt-6 text-center text-[13px] text-ink-muted">
        <Link to="/privacy" className="font-bold underline">
          Privacy policy
        </Link>
      </p>
    </main>
  )
}
