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
