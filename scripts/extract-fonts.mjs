// Pulls the self-hosted Anton / Barlow / Barlow Condensed woff2 subsets out of
// the club site's older single-file build (where they were still inlined as
// base64 data: URLs) and writes them into this app's public/fonts/ as real
// files plus a fonts.css.
//
// Why this route: the current club-site bundle serves them from assets/, but
// that build isn't on this machine, and the deployed copy sits behind Netlify
// password protection. The old inlined build has the identical font data.
//
// Safe to delete once public/fonts/ exists and is committed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'C:/Users/Jay/OneDrive/Desktop/Rugby Site Pics/quins-site/index.html'
const OUT = 'public/fonts'
mkdirSync(OUT, { recursive: true })

const html = readFileSync(SRC, 'utf8')

// Grab each @font-face block whole, so we keep family/weight/style/unicode-range
const faces = [...html.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0])
if (!faces.length) {
  console.error('No @font-face blocks found in', SRC)
  process.exit(1)
}

let css = `/* Self-hosted Anton / Barlow / Barlow Condensed (latin subsets),
   extracted from the club website build so the app and the site render
   identical type with no Google Fonts request at runtime. */\n\n`

let n = 0
const seen = new Map() // base64 -> filename, so shared subsets aren't duplicated

for (const face of faces) {
  const b64 = face.match(/base64,([A-Za-z0-9+/=]+)/)
  if (!b64) {
    console.warn('skipped a @font-face with no base64 payload')
    continue
  }
  let file = seen.get(b64[1])
  if (!file) {
    file = `font-${n++}.woff2`
    writeFileSync(join(OUT, file), Buffer.from(b64[1], 'base64'))
    seen.set(b64[1], file)
  }
  // Rewrite the src to point at the emitted file, keep every other descriptor.
  css += face.replace(/src\s*:\s*url\([^)]*\)[^;]*;/, `src: url('/fonts/${file}') format('woff2');`).trim() + '\n\n'
}

writeFileSync(join(OUT, 'fonts.css'), css)

const fams = [...new Set(faces.map((f) => (f.match(/font-family\s*:\s*['"]?([^;'"]+)/) || [])[1]))]
console.log(`wrote ${seen.size} woff2 file(s) + fonts.css to ${OUT}`)
console.log('families:', fams.join(', '))
