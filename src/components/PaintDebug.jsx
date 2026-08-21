import { useEffect, useState } from 'react'

// A disposable diagnostic overlay — 21 Aug 2026, the night the Squad Hub
// rendered invisible text on Jay's phone (both themes, browser AND installed
// app) while every emulation this session could build rendered it perfectly.
// Rendered ONLY when the URL hash is #paint-debug; costs nothing otherwise.
//
// It answers, on the ACTUAL device, the questions remote debugging could
// not: which engine, which theme state, and what the browser COMPUTES for
// the exact elements that render invisible. Deliberately styled with raw
// inline styles and system-ui — if the app's own styling pipeline is the
// casualty, this box must not die with it.
//
// ⚠️ TEMPORARY. Delete when the phone mystery is solved; nothing imports it
// except SquadHub, and the hash gate keeps it out of everyone's way.
export default function PaintDebug() {
  const [report, setReport] = useState('collecting…')

  useEffect(() => {
    if (window.location.hash !== '#paint-debug') return
    const timer = setTimeout(() => {
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
      const h2 = document.querySelector('h2')
      const kicker = document.querySelector('p')
      const rowBtn = [...document.querySelectorAll('button')].find((b) => /%/.test(b.textContent))
      const sheetTitle = [...document.querySelectorAll('h3')].pop()
      const lines = [
        `UA: ${navigator.userAgent}`,
        `htmlClass: ${document.documentElement.className}`,
        `colorScheme: ${getComputedStyle(document.documentElement).colorScheme}`,
        `bodyColor: ${getComputedStyle(document.body).color}`,
        `bodyBg: ${getComputedStyle(document.body).backgroundColor}`,
        `inkVar: ${getComputedStyle(document.documentElement).getPropertyValue('--ink-rgb')}`,
        `fonts: ${[...document.fonts].filter((f) => f.status === 'loaded').length} loaded / ${document.fonts.size} total`,
        pick('h2', h2),
        pick('firstP', kicker),
        pick('trackRow', rowBtn),
        pick('lastH3', sheetTitle),
      ]
      setReport(lines.join('\n'))
    }, 1500)
    return () => clearTimeout(timer)
  }, [])

  if (typeof window === 'undefined' || window.location.hash !== '#paint-debug') return null
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
    </pre>
  )
}
