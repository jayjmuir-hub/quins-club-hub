// Retheme codemod: migrates every colour reference in src/ off raw hex
// literals and the old quins* token names onto the semantic tokens defined in
// tailwind.config.js.
//
// Run:  node scripts/retheme-codemod.mjs [--dry]
//
// Written as a script rather than done by hand because there were 288 hex
// literals and 150 named-token uses across 39 files. A script is auditable,
// re-runnable, and can't get bored on file 17. Safe to delete once merged.
//
// Ordering matters and is deliberate:
//   1. theme(colors.X) helper calls   — before bare-name replacement
//   2. old token names in class names — longest first (quinsRedDark before quinsRed)
//   3. arbitrary values  prefix-[#hex] -> prefix-token
//   4. any remaining bare hex literals
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DRY = process.argv.includes('--dry')

// --- hex -> semantic token suffix -------------------------------------------
// Left column is what the app used to use; right is the token that replaces it.
// Grouped so it's obvious where several near-identical greys collapsed into one
// step — the old palette had seven barely-distinguishable off-whites.
const HEX = {
  // surfaces
  '#f5f4f3': 'surface',
  '#faf8fb': 'surface-mute',
  '#fbf3f6': 'surface-mute',
  '#f3eef5': 'surface-mute',
  '#f2edf4': 'surface-mute',
  '#f0ecf2': 'surface-mute',
  '#eef0f2': 'surface-mute',
  '#ece6f0': 'surface-sunk',
  '#dcd4e0': 'surface-sunk',
  '#eee': 'surface-sunk',
  // hairlines
  '#e6e3e1': 'line',
  // type
  '#221f1d': 'ink',
  '#5c5854': 'ink-muted',
  '#5a6470': 'ink-muted',
  '#77726e': 'ink-faint',
  '#a29d99': 'ink-faint',
  '#cfc7d5': 'ink-faint',
  // brand
  '#d62a3d': 'brand-hi',
  // states
  '#fbeae8': 'danger-bg',
  '#d1483b': 'danger',
  '#fbf1dd': 'warn-bg',
  '#c9861a': 'warn',
  '#8a5a12': 'warn-ink',
  '#2f7d3d': 'accent-ink',
  '#2f9e4f': 'accent-mid',
  '#3e9c4f': 'accent-mid',
  '#e7f6ea': 'accent-bg',
  '#eef7e6': 'accent-bg',
  '#eef7ee': 'accent-bg',
  '#eaf4fb': 'info-bg',
  '#365a99': 'info',
}

// --- bare hex that isn't in a utility class (gradient strings etc.) ----------
const BARE = {
  '#c21f32': '#e11b22', // old quinsRed      -> brand
  '#8e1526': '#b3141a', // old quinsRedDark  -> brand.deep
  '#b23a38': '#c23a30', // header gradient mid stop
  '#7dc351': '#3bd070', // old quinsGreen    -> accent
  '#d62a3d': '#f0343a',
}

// --- theme() helper calls ----------------------------------------------------
const THEME = {
  'theme(colors.quinsRedDark)': 'theme(colors.brand.deep)',
  'theme(colors.quinsGreenSoft)': 'theme(colors.accent.DEFAULT)',
  'theme(colors.quinsGreen)': 'theme(colors.accent.DEFAULT)',
  'theme(colors.quinsRed)': 'theme(colors.brand.DEFAULT)',
  'theme(colors.quinsBlack)': 'theme(colors.chrome.DEFAULT)',
}

// --- old token names inside class names (longest first) ----------------------
const NAMED = [
  ['quinsGreenSoft', 'accent'],
  ['quinsRedDark', 'brand-deep'],
  ['quinsGreen', 'accent'],
  ['quinsBlack', 'chrome'],
  ['quinsRed', 'brand'],
]

// Roots default to src/. Pass others on the command line, e.g.
//   node scripts/retheme-codemod.mjs tests
// The test suite asserts on exact Tailwind class strings, so it holds the same
// literals the components did and needs the identical mapping applied.
const ROOTS = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const files = []
;(function walkAll(roots) {
  for (const root of roots.length ? roots : ['src']) {
    ;(function walk(d) {
      for (const e of readdirSync(d)) {
        const p = join(d, e)
        statSync(p).isDirectory() ? walk(p) : /\.(jsx?)$/.test(p) && files.push(p)
      }
    })(root)
  }
})(ROOTS)

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
let changedFiles = 0
const tally = {}
const leftovers = []

for (const f of files) {
  const before = readFileSync(f, 'utf8')
  let s = before

  // 1. theme() helpers
  for (const [from, to] of Object.entries(THEME)) {
    s = s.split(from).join(to)
  }

  // 2. old token names wherever they appear as a Tailwind class fragment
  for (const [from, to] of NAMED) {
    s = s.replace(new RegExp(`\\b${from}\\b`, 'g'), to)
  }

  // 3. arbitrary values:  bg-[#f5f4f3] -> bg-surface,  border-l-[#c9861a] -> border-l-warn
  s = s.replace(/([a-z][a-z-]*)-\[(#[0-9a-fA-F]{3,6})\]/g, (m, prefix, hex) => {
    const token = HEX[hex.toLowerCase()]
    if (!token) return m
    tally[`${hex.toLowerCase()} -> ${token}`] = (tally[`${hex.toLowerCase()} -> ${token}`] || 0) + 1
    return `${prefix}-${token}`
  })

  // 4. any bare hex left over (inside gradient strings, inline styles, svg fills)
  for (const [from, to] of Object.entries(BARE)) {
    const re = new RegExp(esc(from), 'gi')
    if (re.test(s)) {
      s = s.replace(re, to)
      tally[`${from} -> ${to} (bare)`] = (tally[`${from} -> ${to} (bare)`] || 0) + 1
    }
  }

  // report anything still holding a raw hex so nothing migrates silently
  for (const m of s.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
    leftovers.push(`${f}: ${m[0]}`)
  }

  if (s !== before) {
    changedFiles++
    if (!DRY) writeFileSync(f, s)
  }
}

console.log(DRY ? '(dry run — nothing written)' : 'WROTE CHANGES')
console.log(`files scanned: ${files.length}   files changed: ${changedFiles}`)
console.log('\n--- replacements ---')
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(String(v).padStart(4), k)
}
console.log(`\n--- remaining raw hex (${leftovers.length}) ---`)
for (const l of leftovers) console.log('  ' + l)
