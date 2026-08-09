import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// /auth/confirm — where every emailed auth link now lands (9 Aug 2026).
//
// The emails used to link straight at
// `https://<project-ref>.supabase.co/auth/v1/verify`. Two costs:
//   1. SPAM — the mail is FROM send.adhquins-clubhub.com and every link in it
//      pointed at supabase.co. Sender domain ≠ link domain is a textbook
//      phishing signature; a real confirmation landed in Yahoo's junk.
//   2. TRUST — the project ref reads as "lusmshimxdcxpnrktlgz".
//
// The Send Email Hook hands over a token_hash, not a finished URL, so the
// destination was always ours to choose.

const verifyOtpMock = vi.fn()

vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { verifyOtp: (...a) => verifyOtpMock(...a) } },
}))

import AuthConfirm, { safeNext } from '../src/screens/AuthConfirm.jsx'

function renderAt(search) {
  return render(
    <MemoryRouter initialEntries={[`/auth/confirm${search}`]}>
      <Routes>
        <Route path="/auth/confirm" element={<AuthConfirm />} />
        <Route path="/" element={<div>Dashboard</div>} />
        <Route path="/reset-password" element={<div>Choose a new password</div>} />
        <Route path="/schedule" element={<div>Schedule screen</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyOtpMock.mockResolvedValue({ error: null })
})

// ══ THE SECURITY ONE ═══════════════════════════════════════════════════
//
// `next` arrives in a query string, from an email, and is used to redirect
// AFTER a session exists. An attacker who could get an arbitrary value in
// there would have a link on the club's own domain that signs a person in and
// then bounces them somewhere else — carrying the trust of
// adhquins-clubhub.com with them. That is an open redirect, and it is worth
// more to a phisher than most bugs in this app.
describe('safeNext — the open redirect this screen could have been', () => {
  const ORIGIN = 'https://adhquins-clubhub.com'

  it('keeps a plain path', () => {
    expect(safeNext('/schedule', ORIGIN)).toBe('/schedule')
    expect(safeNext('/roster?team=abc#top', ORIGIN)).toBe('/roster?team=abc#top')
  })

  it('reduces an absolute URL on our own origin to its path', () => {
    // This is the shape Supabase's redirect_to actually arrives in.
    expect(safeNext(`${ORIGIN}/schedule`, ORIGIN)).toBe('/schedule')
  })

  it('refuses an absolute URL on any other origin', () => {
    expect(safeNext('https://evil.example/steal', ORIGIN)).toBe('/')
    expect(safeNext('http://evil.example', ORIGIN)).toBe('/')
    // A lookalike host. String matching on "adhquins-clubhub.com" rather than
    // comparing origins would wave this through.
    expect(safeNext('https://adhquins-clubhub.com.evil.example/x', ORIGIN)).toBe('/')
  })

  // ⚠️ THE ONE PEOPLE MISS. `//evil.example` has no scheme, so a naive
  // "must start with /" check passes it — and a browser reads it as a
  // PROTOCOL-RELATIVE URL pointing at the host evil.example.
  it('refuses a protocol-relative URL, which looks like a path but is a host', () => {
    expect(safeNext('//evil.example', ORIGIN)).toBe('/')
    expect(safeNext('//evil.example/path', ORIGIN)).toBe('/')
  })

  // Some browsers normalise a backslash to a forward slash, turning this into
  // the case directly above.
  it('refuses the backslash variant of the same trick', () => {
    expect(safeNext('/\\evil.example', ORIGIN)).toBe('/')
  })

  it('refuses anything that is not a path at all, and never throws', () => {
    expect(safeNext('javascript:alert(1)', ORIGIN)).toBe('/')
    expect(safeNext('evil.example', ORIGIN)).toBe('/')
    expect(safeNext('', ORIGIN)).toBe('/')
    expect(safeNext(null, ORIGIN)).toBe('/')
    expect(safeNext(undefined, ORIGIN)).toBe('/')
    expect(safeNext(42, ORIGIN)).toBe('/')
  })
})

describe('AuthConfirm — redeeming the link', () => {
  it('redeems the token_hash with the type from the URL', async () => {
    renderAt('?token_hash=abc123&type=signup&next=%2F')

    await waitFor(() =>
      expect(verifyOtpMock).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'signup' }),
    )
  })

  it('sends a confirmed signup on to where the email said', async () => {
    renderAt('?token_hash=abc123&type=signup&next=%2Fschedule')

    expect(await screen.findByText('Schedule screen')).toBeInTheDocument()
  })

  // ⚠️ RECOVERY IGNORES `next`, DELIBERATELY. verifyOtp has just established a
  // recovery session, and that session exists for exactly one purpose: setting
  // a new password. Honouring `next` here would drop the person on the
  // dashboard holding it with nowhere to spend it — the precise failure
  // ResetPassword's own header comment warns about from the other side.
  it('always sends a password reset to the reset screen, whatever next says', async () => {
    renderAt('?token_hash=abc123&type=recovery&next=%2Fschedule')

    expect(await screen.findByText('Choose a new password')).toBeInTheDocument()
  })

  it('falls back to the dashboard when next is hostile', async () => {
    renderAt('?token_hash=abc123&type=magiclink&next=https%3A%2F%2Fevil.example')

    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  it('says the link is spent rather than failing silently', async () => {
    verifyOtpMock.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    renderAt('?token_hash=stale&type=signup')

    // Supabase's own wording is developer-facing; this screen is read by a
    // parent on a phone.
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired or has already been used/i)
    expect(screen.getByRole('link', { name: /go to sign in/i })).toBeInTheDocument()
  })

  it('refuses a link with no token rather than calling the API', async () => {
    renderAt('?type=signup')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(verifyOtpMock).not.toHaveBeenCalled()
  })

  it('refuses a type it does not recognise', async () => {
    // verifyOtp would reject it anyway, but with a message written for a
    // developer rather than for the person holding the phone.
    renderAt('?token_hash=abc123&type=not_a_real_type')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(verifyOtpMock).not.toHaveBeenCalled()
  })

  it('survives a network failure without a blank screen', async () => {
    verifyOtpMock.mockRejectedValue(new Error('offline'))
    renderAt('?token_hash=abc123&type=signup')

    expect(await screen.findByRole('alert')).toHaveTextContent(/connection/i)
  })

  // ⚠️ THE TOKEN IS SINGLE-USE and React StrictMode mounts effects twice in
  // development. Without the guard the second run redeems an already-spent
  // token, fails, and shows "this link has expired" for a link that just
  // worked — in dev only, which is the worst place to lose an hour to it.
  it('redeems the token exactly once under StrictMode double-mounting', async () => {
    // ⚠️ StrictMode IS THE TEST. An earlier version of this case used
    // `rerender`, which re-renders the SAME mounted component and therefore
    // never re-runs the effect — so it passed with the guard deliberately
    // removed. A test that cannot fail is decoration. StrictMode mounts,
    // unmounts and remounts, which is exactly what dev does and exactly what
    // spends a single-use token twice.
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/auth/confirm?token_hash=abc123&type=signup']}>
          <Routes>
            <Route path="/auth/confirm" element={<AuthConfirm />} />
            <Route path="/" element={<div>Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    )

    await waitFor(() => expect(verifyOtpMock).toHaveBeenCalled())
    expect(verifyOtpMock).toHaveBeenCalledTimes(1)
  })
})
