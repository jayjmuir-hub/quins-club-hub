// Portable Playwright resolution for the screenshot scripts.
//
// Playwright is deliberately NOT a dependency of this repo: it pulls a
// ~300MB browser download that the app build, the unit tests and Netlify all
// have no use for. The shoot scripts are the only thing that needs it, and
// they are run by hand. So it is resolved at runtime instead of imported
// statically, and — importantly — WITHOUT hard-coding one machine's install
// path. This repo is cloned onto more than one PC and into fresh sandboxes;
// an absolute path that happens to exist on the machine a script was written
// on is not code, it's a local accident.
//
// Resolution order:
//   1. $PLAYWRIGHT_MODULE, if set — an explicit path or specifier, for
//      environments with Playwright installed somewhere non-standard.
//   2. the bare specifier 'playwright' — a local devDependency, a global
//      install, or anything on NODE_PATH.
//
// Example, for a sandbox with a shared toolchain install:
//   PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs \
//     node harness/shoot-roster.mjs

export async function loadChromium() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean)
  const tried = []

  for (const specifier of candidates) {
    try {
      const { chromium } = await import(specifier)
      if (chromium) return chromium
      tried.push(`${specifier} (loaded, but exports no 'chromium')`)
    } catch (error) {
      // Anything other than "couldn't find it" is a real failure worth
      // surfacing as-is — a corrupt install shouldn't masquerade as a
      // missing one.
      if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
      tried.push(specifier)
    }
  }

  throw new Error(
    `Could not load Playwright (tried: ${tried.join(', ')}).\n` +
      'Either install it in this repo:\n' +
      '  npm i -D playwright && npx playwright install chromium\n' +
      'or point PLAYWRIGHT_MODULE at an existing installation:\n' +
      '  PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node harness/shoot-roster.mjs',
  )
}

export default loadChromium
