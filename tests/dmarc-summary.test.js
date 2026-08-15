// @vitest-environment node
//
// The alarm in scripts/dmarc-summary.mjs is the whole point of the script, and
// an alarm that has never been heard is not an alarm (CLAUDE.md rule 6). These
// tests are the fault injection, kept: the benign shape must stay silent and
// the impostor shape must set a non-zero exit code.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(process.cwd(), 'scripts', 'dmarc-summary.mjs')

/**
 * A DMARC aggregate report with one record. `headerFrom` is the identity the
 * message claimed; `result` is what the receiver's DMARC evaluation concluded.
 */
const report = ({ headerFrom, result, ip = '203.0.113.9', count = 1 }) =>
  '<?xml version="1.0"?><feedback>' +
  '<report_metadata><org_name>TestReporter</org_name>' +
  '<date_range><begin>1786579200</begin><end>1786665599</end></date_range>' +
  '</report_metadata>' +
  '<policy_published><domain>adhquins-clubhub.com</domain><p>quarantine</p></policy_published>' +
  `<record><row><source_ip>${ip}</source_ip><count>${count}</count>` +
  `<policy_evaluated><disposition>none</disposition><dkim>${result}</dkim><spf>${result}</spf>` +
  '</policy_evaluated></row>' +
  `<identifiers><header_from>${headerFrom}</header_from></identifiers>` +
  // auth_results carries dkim/spf tags too. If the script reads these instead
  // of the policy_evaluated ones above it inverts every verdict, so they are
  // deliberately set to the OPPOSITE value in every fixture.
  `<auth_results><dkim><result>${result === 'pass' ? 'fail' : 'pass'}</result></dkim>` +
  `<spf><result>${result === 'pass' ? 'fail' : 'pass'}</result></spf></auth_results>` +
  '</record></feedback>'

const NAME = 'TestReporter!adhquins-clubhub.com!1786579200!1786665599'

let dir

const run = (folder) => {
  try {
    return { status: 0, out: execFileSync('node', [SCRIPT, folder], { encoding: 'utf8' }) }
  } catch (e) {
    return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dmarc-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('dmarc-summary', () => {
  it('stays silent when a spoof FAILED — the ordinary case', () => {
    const d = mkdtempSync(join(tmpdir(), 'dmarc-ok-'))
    writeFileSync(join(d, `${NAME}.xml`), report({ headerFrom: 'raker.adhquins-clubhub.com', result: 'fail' }))
    const { status, out } = run(d)

    expect(status).toBe(0)
    expect(out).toMatch(/FAILING SOURCES/)
    expect(out).toMatch(/raker\.adhquins-clubhub\.com/)
    expect(out).toMatch(/every authenticated message came from a sender we own/)
    rmSync(d, { recursive: true, force: true })
  })

  it('FAILS when an unknown identity authenticated — the alarm', () => {
    const d = mkdtempSync(join(tmpdir(), 'dmarc-bad-'))
    writeFileSync(join(d, `${NAME}.xml`), report({ headerFrom: 'evil.adhquins-clubhub.com', result: 'pass' }))
    const { status, out } = run(d)

    expect(status).toBe(1)
    expect(out).toMatch(/AUTHENTICATED as an identity that is not ours/)
    expect(out).toMatch(/evil\.adhquins-clubhub\.com/)
    rmSync(d, { recursive: true, force: true })
  })

  it('does not fire for our own senders, however much they send', () => {
    const d = mkdtempSync(join(tmpdir(), 'dmarc-ours-'))
    writeFileSync(
      join(d, `${NAME}.xml`),
      report({ headerFrom: 'send.adhquins-clubhub.com', result: 'pass', count: 500 }),
    )
    const { status } = run(d)

    expect(status).toBe(0)
    rmSync(d, { recursive: true, force: true })
  })

  it('reads gzipped reports, which is how Yahoo and Docomo send them', () => {
    writeFileSync(
      join(dir, `${NAME}.xml.gz`),
      gzipSync(report({ headerFrom: 'evil.adhquins-clubhub.com', result: 'pass' })),
    )
    const { status, out } = run(dir)

    expect(status).toBe(1)
    expect(out).toMatch(/evil\.adhquins-clubhub\.com/)
  })

  it('ignores files that are not DMARC reports', () => {
    // An unrelated archive in the same folder must not crash the run — the
    // first version of this script choked on a spreadsheet in Downloads.
    writeFileSync(join(dir, 'quarterly-report.zip'), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))
    writeFileSync(join(dir, 'notes.xml'), '<not-a-report/>')
    const { out } = run(dir)

    expect(out).toMatch(/1 report file\(s\)/)
  })

  it('says so, and exits clean, when there is nothing to read', () => {
    const d = mkdtempSync(join(tmpdir(), 'dmarc-empty-'))
    const { status, out } = run(d)

    expect(status).toBe(0)
    expect(out).toMatch(/No DMARC reports/)
    rmSync(d, { recursive: true, force: true })
  })
})
