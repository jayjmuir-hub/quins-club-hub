#!/usr/bin/env node
// Summarise DMARC aggregate reports.
//
// WHY THIS EXISTS: on 15 Aug 2026 Jay asked why his inbox was filling with
// "Report Domain: …" mail from Yahoo, Google and NTT Docomo. The answer was in
// the attachments, and the attachments are gzipped XML — unreadable by eye,
// which is exactly why a real finding could sit in one for weeks unnoticed.
//
// The finding that day was benign: someone on a mobile network in the Republic
// of the Congo was sending as `raker.adhquins-clubhub.com`, an invented
// subdomain, and every message failed SPF and DKIM and was quarantined. That is
// the boring case and it is most of them.
//
// ⚠️ THE CASE THIS SCRIPT EXISTS TO CATCH IS THE OPPOSITE ONE: a message that
// AUTHENTICATED from an identity we do not recognise. That means a DKIM private
// key has leaked or an SPF record authorises someone it should not, and it is
// invisible in the noise of failing spam unless something is looking for it.
// That check, and only that check, sets a non-zero exit code.
//
// Run: npm run mail:dmarc -- <folder>     (default: ~/Downloads)

import { gunzipSync, inflateRawSync } from 'node:zlib'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { homedir } from 'node:os'

/**
 * Identities we send from. Anything else that PASSES is the alarm.
 * `adhquins-clubhub.com` is Microsoft 365; `send.…` is Resend, which puts its
 * bounce domain one level below that again — see claude/runbooks/dmarc-reports.md.
 */
const KNOWN_SENDERS = ['adhquins-clubhub.com', 'send.adhquins-clubhub.com']

const dir = process.argv[2] || join(homedir(), 'Downloads')

// ------------------------------------------------------------- decompression

/**
 * Minimal ZIP reader. Google sends `.zip`, Yahoo and Docomo send `.xml.gz`, and
 * pulling in a dependency for one archive format would make this the only
 * script in scripts/ that needs an install. Walks the local file headers, which
 * is enough for the single-entry archives a DMARC reporter produces.
 */
function unzipEntries(buf) {
  const out = []
  let i = 0
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8)
    let size = buf.readUInt32LE(i + 18)
    const nameLen = buf.readUInt16LE(i + 26)
    const extraLen = buf.readUInt16LE(i + 28)
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString('latin1')
    const start = i + 30 + nameLen + extraLen

    // A streamed entry writes sizes to a trailing descriptor, not the header.
    // Fall back to "the rest of the buffer" and let inflate find the end.
    if (size === 0 && method === 8) size = buf.length - start

    if (name.toLowerCase().endsWith('.xml')) {
      try {
        const data = buf.subarray(start, start + size)
        out.push((method === 8 ? inflateRawSync(data) : data).toString('utf8'))
      } catch {
        // Not fatal: one unreadable entry should not lose the other reports.
      }
    }
    i = start + size
  }
  return out
}

function readReport(file) {
  const buf = readFileSync(file)
  if (file.toLowerCase().endsWith('.gz')) return [gunzipSync(buf).toString('utf8')]
  if (extname(file).toLowerCase() === '.zip') return unzipEntries(buf)
  return [buf.toString('utf8')]
}

// ------------------------------------------------------------------- parsing

// DMARC aggregate XML is small, flat and machine-generated, so tag extraction
// is honest here in a way it would not be for arbitrary XML. Nested blocks are
// pulled out FIRST — `<dkim>` appears under both `policy_evaluated` and
// `auth_results`, and reading the wrong one inverts the result.
const block = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
  return m ? m[1] : ''
}
const blocks = (xml, name) =>
  [...xml.matchAll(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1])
const tag = (xml, name) => block(xml, name).trim()

function parse(xml) {
  const meta = block(xml, 'report_metadata')
  const begin = Number(tag(block(meta, 'date_range'), 'begin'))
  const reporter = tag(meta, 'org_name')
  const day = Number.isFinite(begin) && begin > 0
    ? new Date(begin * 1000).toISOString().slice(0, 10)
    : '(no date)'

  return blocks(xml, 'record').map((rec) => {
    const row = block(rec, 'row')
    const evaluated = block(row, 'policy_evaluated')
    return {
      day,
      reporter,
      headerFrom: tag(block(rec, 'identifiers'), 'header_from'),
      sourceIp: tag(row, 'source_ip'),
      count: Number(tag(row, 'count')) || 0,
      dkim: tag(evaluated, 'dkim'),
      spf: tag(evaluated, 'spf'),
      action: tag(evaluated, 'disposition') || 'none',
    }
  })
}

// --------------------------------------------------------------------- main

// Reporters name their files `reporter!policy-domain!begin!end[!id].ext`. The
// `!` is what separates a DMARC report from everything else in a Downloads
// folder, and filtering on it stops the script choking on an unrelated archive.
let files = []
try {
  files = readdirSync(dir)
    .filter((f) => f.includes('!') && /\.(xml|xml\.gz|zip)$/i.test(f))
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile())
} catch {
  console.error(`Cannot read ${dir}`)
  process.exit(2)
}

if (!files.length) {
  console.log(`No DMARC reports in ${dir}`)
  console.log('Save the attachments from the "Report Domain: …" mail into that folder first.')
  process.exit(0)
}

const rows = files.flatMap((f) => readReport(f).flatMap(parse)).filter((r) => r.headerFrom)
const authenticated = (r) => r.dkim === 'pass' || r.spf === 'pass'
const sum = (rs) => rs.reduce((n, r) => n + r.count, 0)

console.log(`\n${files.length} report file(s) from ${dir}\n`)

console.log('BY SENDING IDENTITY')
const byIdentity = [...new Set(rows.map((r) => r.headerFrom))]
  .map((id) => {
    const rs = rows.filter((r) => r.headerFrom === id)
    return {
      identity: id,
      known: KNOWN_SENDERS.includes(id) ? 'yes' : 'NO',
      messages: sum(rs),
      ips: new Set(rs.map((r) => r.sourceIp)).size,
      passed: sum(rs.filter(authenticated)),
      failed: sum(rs.filter((r) => !authenticated(r))),
    }
  })
  .sort((a, b) => b.messages - a.messages)
console.table(byIdentity)

const failing = rows.filter((r) => !authenticated(r))
console.log(`\nFAILING SOURCES — spoofs, caught (${sum(failing)} message(s))`)
if (failing.length) {
  console.table(
    failing.map(({ day, reporter, headerFrom, sourceIp, count, action }) => ({
      day, reporter, headerFrom, sourceIp, count, action,
    })),
  )
} else {
  console.log('  none\n')
}

const impostors = rows.filter((r) => authenticated(r) && !KNOWN_SENDERS.includes(r.headerFrom))
console.log('AUTHENTICATED FROM AN UNKNOWN IDENTITY — the one that matters')
if (impostors.length) {
  console.table(
    impostors.map(({ day, reporter, headerFrom, sourceIp, count }) => ({
      day, reporter, headerFrom, sourceIp, count,
    })),
  )
  console.error(
    '\n⚠️ Mail AUTHENTICATED as an identity that is not ours. A DKIM key may have\n' +
      '   leaked, or an SPF record authorises a sender it should not. Investigate\n' +
      '   before doing anything else — see claude/runbooks/dmarc-reports.md.',
  )
  process.exit(1)
}

console.log('  none — every authenticated message came from a sender we own\n')
console.log(`Totals: ${sum(rows.filter(authenticated))} authenticated, ${sum(failing)} failed.`)
