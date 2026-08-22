import { useEffect, useState } from 'react'

// A disposable diagnostic overlay — 21 Aug 2026, the night the Squad Hub
// rendered invisible text on Jay's phone while every emulation this session
// could build rendered it perfectly.
//
// It answers, on the ACTUAL device, the questions remote debugging could
// not: which engine, which theme state, and what the browser COMPUTES for
// the exact elements that render invisible. Deliberately styled with raw
// inline styles and system-ui — if the app's own styling pipeline is the
// casualty, this box must not die with it.
//
// v2 (22 Aug): the hash gate was naive — signing in REDIRECTS and strips
// the hash before any screen renders. Now ?paintdebug=1 or the hash ARMS a
// localStorage flag at any moment; the box follows the flag on every screen
// and carries its own [hide].
//
// v3 (22 Aug): LIVE — recollects every 2s so the box reports the CURRENT
// screen (v2 snapshotted once and froze on Home's numbers), samples only
// elements that actually paint (>2px, so sr-only and the hidden desktop
// sidebar stop muddying the report), and targets the open sheet directly.
//
// ⚠️ TEMPORARY. Delete when the phone mystery is solved.
function wantsDebug() {
  try {
    if (window.location.hash === '#paint-debug' || /[?&]paintdebug=1/.test(window.location.search)) {
      localStorage.setItem('paint-debug', '1')
    }
    return localStorage.getItem('paint-debug') === '1'
  } catch {
    return window.location.hash === '#paint-debug'
  }
}

export default function PaintDebug() {
  const [report, setReport] = useState('collecting…')
  const [active, setActive] = useState(() => wantsDebug())

  useEffect(() => {
    const onHash = () => setActive(wantsDebug())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!active) return undefined
    const collect = () => {
      const pick = (label, el) => {
        if (!el) return `${label}: NOT FOUND`
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        return (
          `${label}: "${(el.textContent || '').trim().slice(0, 18)}"\n` +
          `  color=${cs.color} bg=${cs.backgroundColor}\n` +
          `  font=${cs.fontFamily.split(',')[0]} ${cs.fontSize}/${cs.fontWeight}\n` +
          `  opacity=${cs.opacity} vis=${cs.visibility} filter=${cs.filter}\n` +
          `  rect=${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.top)}`
        )
      }
      const painted = (sel) =>
        [...document.querySelectorAll(sel)].find((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 2 && r.height > 2
        })
      const dialog = document.querySelector('[role="dialog"]')
      const lines = [
        `UA: ${navigator.userAgent}`,
        `htmlClass: ${document.documentElement.className}`,
        `colorScheme: ${getComputedStyle(document.documentElement).colorScheme}`,
        `bodyColor: ${getComputedStyle(document.body).color}`,
        `bodyBg: ${getComputedStyle(document.body).backgroundColor}`,
        `inkVar: ${getComputedStyle(document.documentElement).getPropertyValue('--ink-rgb')}`,
        `fonts: ${[...document.fonts].filter((f) => f.status === 'loaded').length} loaded / ${document.fonts.size} total`,
        `url: ${window.location.pathname} sheetOpen: ${Boolean(dialog)}`,
        pick('h2', painted('h2')),
        pick('firstP', painted('main p')),
        pick(
          'trackRow',
          [...document.querySelectorAll('button')].find((b) => /%/.test(b.textContent)),
        ),
        pick('sheetTitle', dialog ? dialog.querySelector('h3') : painted('h3')),
        pick('sheetRow', dialog ? dialog.querySelector('li span') : null),
      ]
      setReport(lines.join('\n'))
    }
    const timer = setInterval(collect, 2000)
    collect()
    return () => clearInterval(timer)
  }, [active])

  if (!active) return null
  return (
    <pre
      style={{
        position: 'fixed',
        inset: '60px 8px auto 8px',
        zIndex: 99999,
        background: '#ffef99',
        color: '#000',
        fontFamily: 'monospace',
        fontSize: '10px',
        lineHeight: 1.35,
        padding: '8px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        border: '3px solid #c00',
        maxHeight: '75vh',
        overflow: 'auto',
      }}
    >
      {report}
      {'\n\n'}
      <button
        type="button"
        style={{ background: '#c00', color: '#fff', padding: '4px 10px', fontFamily: 'monospace' }}
        onClick={() => {
          try {
            localStorage.removeItem('paint-debug')
          } catch {
            /* fine */
          }
          setActive(false)
        }}
      >
        hide
      </button>
    </pre>
  )
}
