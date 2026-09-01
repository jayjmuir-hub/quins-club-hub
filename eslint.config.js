// ESLint for the app. Added 22 Aug 2026, after a dry run over src/ found a real
// crash the 107-file suite could not see (a conditional hook in Accounts.jsx
// that threw on a "View as" switch). The point of this file is the CI step in
// .github/workflows/test.yml: the NEXT one never reaches main.
//
// ⚠️ WHAT IS DELIBERATELY OFF, AND WHY — read before "tidying" a rule back on.
//   react-hooks/set-state-in-effect — 66 hits on day one, every one of them
//     the ordinary "load, then set state" pattern this app is built from. It is
//     a React Compiler opinion, and this app does not use the compiler.
//   react-hooks/purity, react-hooks/refs — same family, same reason. Date.now()
//     in render is how "is this event in the past" is answered here.
//   no-unused-vars is a WARNING, not an error, and ignores `_`-prefixed names:
//     nineteen on day one, none of them a bug. Burn them down; do not block on
//     them.
//
// ⚠️ ESLINT 10 NEEDS AN `overrides` ENTRY IN package.json, AND IT IS NOT A HACK
// TO BE TIDIED AWAY — 1 Sep 2026. `eslint-plugin-react`'s LATEST published
// release (7.37.5, April 2025) peer-caps at `eslint ^9.7`, so `npm ci` refuses
// eslint 10 with ERESOLVE. The plugin itself WORKS: measured with eslint 10.9.1
// genuinely installed, lint/build/suite are byte-for-byte the same result as on
// eslint 9 — 0 errors, the same 66 warnings. The cap is stale METADATA, not a
// real incompatibility, and upstream PR jsx-eslint/eslint-plugin-react#4022
// ("complete ESLint 10 compatibility") is open but unreleased.
//
// ⚠️ WHAT THE OVERRIDE COSTS: it permanently silences the peer check for this
// one plugin, so a FUTURE genuine incompatibility would arrive as a runtime
// error rather than an install refusal. That is the trade, and it is worth it
// only because the three rules taken from this plugin are narrow
// (jsx-uses-react, jsx-uses-vars, jsx-no-undef). REMOVE THE OVERRIDE the moment
// the plugin publishes a release accepting eslint 10.
//
// ⚠️ AND DO NOT "SIMPLIFY" BY DROPPING THE PLUGIN — measured, 1 Sep 2026.
// `react/jsx-uses-vars` is load-bearing: core `no-unused-vars` cannot see JSX,
// so every component used only in markup reports as unused. Removing the plugin
// took the warning count from 66 to 1,237. Exit code stays 0, which is exactly
// why the damage would go unnoticed — it buries the real warnings.
//
// supabase/functions/ is Deno and is not linted here — different globals,
// different runtime, and its own deploy path.
import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'supabase/functions/**', 'harness/stubs/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        ...globals.serviceworker,
        // vite.config.js `define` — baked in at build time.
        __BUILD_REF__: 'readonly',
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // Tests: vitest globals are imported explicitly in this repo, but jsdom
    // and node both apply.
    files: ['tests/**', '**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    // Mocks here are named `useXMock` by convention and called from plain
    // functions; the hooks rule cannot tell them from real hooks.
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
]
