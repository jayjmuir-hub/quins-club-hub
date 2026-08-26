import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import PlayerRegistrationForm from './PlayerRegistrationForm.jsx'
import { listSignupSquads } from '../data/signupSquads.js'
import { checkPassword } from '../lib/password.js'
import {
  SIGNUP_ANSWERS,
  SIGNUP_STAFF_ROLES,
  buildSignupIntent,
  needsPlayers,
  needsSquads,
} from '../lib/signupIntent.js'

// Pre-signup roll-call. Filled BEFORE supabase.auth.signUp — originally so
// the confirmation email was not a cliff
// (claude/decisions/2026-08-25-signup-before-confirm.md); the gate itself was
// then removed the same day
// (claude/decisions/2026-08-25-remove-email-confirmation.md), and the order
// still stands: the club gets a name and a role in the same breath as the
// account, whatever the mail does.

const FIELD =
  'w-full rounded-[11px] border-[1.5px] border-line px-3 py-2.5 text-base text-ink focus:border-brand'
const LABEL = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-faint'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function PasswordChecklist({ password }) {
  const result = checkPassword(password)
  return (
    <ul className="mt-2 space-y-1 text-[12.5px] text-ink-muted">
      {result.rules.map((rule) => (
        <li key={rule.id} className="flex items-start gap-2">
          <span aria-hidden="true" className={rule.met ? 'text-brand-ink' : 'text-line'}>
            {rule.met ? '✓' : '•'}
          </span>
          <span>{rule.label}</span>
          <span className="sr-only">{rule.met ? ' — done' : ' — still needed'}</span>
        </li>
      ))}
    </ul>
  )
}

export default function SignupWizard({ busy, error, onError, onSubmitAccount }) {
  const [step, setStep] = useState('who') // 'who' | 'players' | 'account'
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [answers, setAnswers] = useState({})
  const [squadIds, setSquadIds] = useState([])
  const [staffRole, setStaffRole] = useState('')
  const [staffTeamId, setStaffTeamId] = useState('')
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [teamsFailed, setTeamsFailed] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    let mounted = true
    listSignupSquads()
      .then((rows) => {
        if (!mounted) return
        setTeams(rows)
        setTeamsFailed(false)
      })
      .catch(() => {
        if (!mounted) return
        setTeams([])
        setTeamsFailed(true)
      })
    return () => {
      mounted = false
    }
  }, [])

  const sortedTeams = [...teams].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (orderDiff !== 0) return orderDiff
    return String(a.name).localeCompare(String(b.name))
  })

  function toggle(key) {
    setAnswers((current) => ({ ...current, [key]: !current[key] }))
    if (error) onError?.(null)
  }

  function handleWho(event) {
    event.preventDefault()
    const { error: problem, intent } = buildSignupIntent({
      firstName,
      lastName,
      answers,
      squadIds,
      staffRole,
      staffTeamId,
      players: [],
    })
    if (problem || !intent) {
      onError?.(problem)
      return
    }
    onError?.(null)
    if (needsPlayers(answers)) {
      setStep('players')
      return
    }
    setStep('account')
  }

  function handlePlayersCollected(rows) {
    setPlayers(rows)
    onError?.(null)
    setStep('account')
  }

  async function handleAccount(event) {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
      onError?.('Enter a valid email address.')
      return
    }
    if (password.length === 0) {
      onError?.('Enter your password.')
      return
    }
    const { error: problem, intent } = buildSignupIntent({
      firstName,
      lastName,
      answers,
      squadIds,
      staffRole,
      staffTeamId,
      players,
    })
    if (problem || !intent) {
      onError?.(problem)
      return
    }
    await onSubmitAccount({ email: trimmed, password, intent })
  }

  const passwordOk = checkPassword(password).valid

  if (step === 'players') {
    return (
      <div className="mt-4">
        <p className="mb-3 text-sm leading-relaxed text-ink-faint">
          Add who you're here for. A coach checks every new player before you see the rest of
          the squad — creating your account is the last step after this.
        </p>
        {error && (
          <p role="alert" className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
            {error}
          </p>
        )}
        <PlayerRegistrationForm
          teams={sortedTeams}
          collectOnly
          defaultSelfRegister={Boolean(answers.self) && !answers.child}
          submitLabel="Continue"
          onCollect={handlePlayersCollected}
        />
        <button
          type="button"
          className="mt-3 w-full text-center text-sm font-semibold text-ink-faint underline"
          onClick={() => setStep('who')}
        >
          Back
        </button>
      </div>
    )
  }

  if (step === 'account') {
    return (
      <form className="mt-4" onSubmit={handleAccount} noValidate>
        <p className="mb-3 text-sm leading-relaxed text-ink-faint">
          Last step: a login. We'll email this address so the club knows it's really you.
        </p>
        {error && (
          <p role="alert" className="mb-4 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
            {error}
          </p>
        )}
        <label htmlFor="signup-email" className={LABEL}>
          Email address
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className={FIELD}
        />
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <label htmlFor="signup-password" className={LABEL}>
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint underline"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            id="signup-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={FIELD}
          />
          <PasswordChecklist password={password} />
        </div>
        <Button type="submit" disabled={busy || !passwordOk} full className="mt-4">
          {busy ? 'Please wait…' : 'Send my details'}
        </Button>
        <button
          type="button"
          className="mt-3 w-full text-center text-sm font-semibold text-ink-faint underline"
          onClick={() => setStep(needsPlayers(answers) ? 'players' : 'who')}
        >
          Back
        </button>
      </form>
    )
  }

  return (
    <form className="mt-4" onSubmit={handleWho} noValidate data-testid="signup-who">
      <p className="mb-4 text-center text-sm leading-relaxed text-ink-faint">
        Tell us how you fit in first — then create your account. Tick
        everything that's true.
      </p>
      {error && (
        <p role="alert" className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-danger-ink">
          {error}
        </p>
      )}
      {teamsFailed && needsSquads(answers) && (
        <p role="alert" className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-danger-ink">
          We couldn't load the club's age groups. Check your connection and try again.
        </p>
      )}

      <div className="mb-3.5">
        <label className={LABEL} htmlFor="signup-first-name">
          Your first name
        </label>
        <input
          id="signup-first-name"
          type="text"
          autoComplete="given-name"
          className={FIELD}
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
        />
      </div>
      <div className="mb-4">
        <label className={LABEL} htmlFor="signup-last-name">
          Your family name
        </label>
        <input
          id="signup-last-name"
          type="text"
          autoComplete="family-name"
          className={FIELD}
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
      </div>

      <fieldset className="mb-4 border-0 p-0">
        <legend className={`${LABEL} p-0`}>What brings you to the club?</legend>
        {SIGNUP_ANSWERS.map((answer) => (
          <label
            key={answer.key}
            className="mb-2.5 flex cursor-pointer items-start gap-3 rounded-[11px] border border-line bg-surface-mute p-3 transition hover:border-brand"
          >
            <input
              type="checkbox"
              checked={Boolean(answers[answer.key])}
              onChange={() => toggle(answer.key)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--brand)]"
            />
            <span>
              <span className="block text-sm font-bold text-ink">{answer.label}</span>
              <span className="block text-[12.5px] leading-relaxed text-ink-muted">{answer.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {answers.staff && (
        <div className="mb-3.5">
          <label className={LABEL} htmlFor="signup-staff-role">
            What do you do
          </label>
          <select
            id="signup-staff-role"
            className={FIELD}
            value={staffRole}
            onChange={(event) => setStaffRole(event.target.value)}
          >
            <option value="">Choose one…</option>
            {SIGNUP_STAFF_ROLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {answers.staff && (
        <div className="mb-3.5">
          <label className={LABEL} htmlFor="signup-staff-team">
            Which squad do you look after
          </label>
          <select
            id="signup-staff-team"
            className={FIELD}
            value={staffTeamId}
            disabled={sortedTeams.length === 0}
            onChange={(event) => setStaffTeamId(event.target.value)}
          >
            <option value="">{sortedTeams.length === 0 ? 'Loading squads…' : 'Choose one…'}</option>
            {sortedTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* A committee member has no age group — helper-only skips the squads
          entirely (needsSquads, and the whole chain down to the INSERT
          policy agrees). The picker comes back the moment any other box is
          ticked. */}
      {needsSquads(answers) && (
      <fieldset className="mb-4 border-0 p-0">
        <legend className={`${LABEL} p-0`}>Age groups</legend>
        <div className="max-h-48 overflow-y-auto rounded-[11px] border border-line">
          {sortedTeams.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-muted">
              {teamsFailed ? 'Could not load squads.' : 'Loading squads…'}
            </p>
          ) : (
            sortedTeams.map((team) => (
              <label
                key={team.id}
                className="flex cursor-pointer items-center gap-3 px-2 py-2 transition hover:bg-surface-mute"
              >
                <input
                  type="checkbox"
                  checked={squadIds.includes(team.id)}
                  onChange={() => {
                    setSquadIds((current) =>
                      current.includes(team.id)
                        ? current.filter((id) => id !== team.id)
                        : [...current, team.id],
                    )
                    if (error) onError?.(null)
                  }}
                  className="h-5 w-5 shrink-0 accent-[color:var(--brand)]"
                />
                <span className="text-sm font-semibold text-ink">{team.name}</span>
              </label>
            ))
          )}
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
          More than one child? Tick each age group. Not sure? Pick the closest.
        </p>
      </fieldset>
      )}

      <Button type="submit" size="lg" full disabled={sortedTeams.length === 0 && needsSquads(answers)}>
        Continue
      </Button>
    </form>
  )
}
