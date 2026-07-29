// One-off audit: tally every distinct colour literal in src/ so the retheme
// codemod can be written against the real inventory rather than a guess.
// Safe to delete once the migration lands.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const files = []
;(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    statSync(p).isDirectory() ? walk(p) : /\.(jsx?|css)$/.test(p) && files.push(p)
  }
})('src')

const hex = new Map()
const named = new Map()
const ctx = new Map()

for (const f of files) {
  const s = readFileSync(f, 'utf8')
  for (const m of s.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
    const k = m[0].toLowerCase()
    hex.set(k, (hex.get(k) || 0) + 1)
  }
  for (const m of s.matchAll(/([a-z-]+)-\[(#[0-9a-fA-F]{3,6})\]/g)) {
    const k = m[2].toLowerCase()
    if (!ctx.has(k)) ctx.set(k, new Set())
    ctx.get(k).add(m[1])
  }
  for (const m of s.matchAll(/quins(RedDark|GreenSoft|Red|Green|Black)\b/g)) {
    named.set(m[0], (named.get(m[0]) || 0) + 1)
  }
}

const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])
console.log('FILES SCANNED:', files.length)
console.log('--- HEX LITERALS (count, value, used-as) ---')
for (const [k, v] of sortDesc(hex)) {
  console.log(String(v).padStart(4), k, ' ', [...(ctx.get(k) || [])].join(','))
}
console.log('--- NAMED TOKENS ---')
for (const [k, v] of sortDesc(named)) console.log(String(v).padStart(4), k)
console.log('DISTINCT HEX:', hex.size, 'TOTAL:', [...hex.values()].reduce((a, b) => a + b, 0))
