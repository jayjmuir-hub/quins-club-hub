// @vitest-environment node
//
// ⚠️ NODE, NOT THE SUITE'S jsdom DEFAULT, AND IT IS NOT A PREFERENCE. Importing
// vite.config.js pulls in vite and therefore esbuild, which refuses to load
// under jsdom: `new TextEncoder().encode("") instanceof Uint8Array` is false
// there, and esbuild treats that as a broken environment. The failure is a
// COLLECTION error naming esbuild, with zero tests run — it looks like a broken
// dependency and is a wrong environment.
import { describe, it, expect } from 'vitest'
import config from '../vite.config.js'

// ⚠️ THIS FILE EXISTS BECAUSE THE FLAKY SUITE WAS ONE CONFIG LINE, AND A CONFIG
// LINE IS THE EASIEST THING IN THE REPO TO DELETE BY ACCIDENT.
//
// Vitest's default testTimeout is 5000ms. The heaviest tests here legitimately
// cost 1.4-2.6s in jsdom, so on the default they run with a margin of about 2x,
// and CPU contention slows everything by more than that. The result was four
// unrelated files each producing a phantom failure in a full run and passing
// alone — which reads as cross-file state and is not. The reasoning, and the
// measurements, are in vite.config.js beside the setting.
//
// ⚠️ IT ASSERTS A FLOOR, NOT A VALUE. Raising the ceiling further is a judgement
// call and does not need this file changed; removing it, or dropping back to the
// default, brings the flake back and must fail here instead of failing at random
// in somebody else's pull request three weeks later.
describe('the vitest timeout that stopped the suite being flaky', () => {
  it('is set explicitly rather than left on the 5000ms default', () => {
    expect(config.test?.testTimeout).toBeTypeOf('number')
  })

  // 6.6x the slowest legitimate test measured on 14 Aug 2026. Below this the
  // margin stops covering a loaded machine, which is the only condition the
  // flake ever appeared under.
  it('leaves enough margin for a contended machine', () => {
    expect(config.test.testTimeout).toBeGreaterThanOrEqual(15000)
  })
})
