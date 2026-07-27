### Task 1: Scaffold app + first deploy
**Files:** Create `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `tailwind.config.js`, `postcss.config.js`, `src/index.css`, `netlify.toml`, `.gitignore`, `.env.example`.
**Interfaces:** Produces a running Vite+React+Tailwind app and a build that Netlify can publish.
- [ ] Scaffold Vite React app; add Tailwind; add the brand colours as Tailwind theme tokens (`quinsRed #C21F32`, `quinsGreen #7DC351`, `quinsGreenSoft #87C97F`, `quinsRedDark #8E1526`, `quinsBlack #141414`).
- [ ] Put a temporary "Quins Club Hub" heading on the red→green gradient to confirm styling.
- [ ] Add `netlify.toml` (build `npm run build`, publish `dist`, SPA redirect `/* → /index.html` status 200).
- [ ] Add Vitest + React Testing Library + jsdom; `npm test` runs unit tests only (exclude `*.integration.test.js`).
- [ ] Verify: `npm run build` succeeds and `npm test` passes. Commit.

