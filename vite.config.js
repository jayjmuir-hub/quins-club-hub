import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// npm test                 -> unit tests only (default), never touches the network
// npm run test:integration -> only *.integration.test.{js,jsx} files
const isIntegration = process.env.VITEST_MODE === 'integration'

export default defineConfig({
  plugins: [react()],
  base: '/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: isIntegration
      ? ['**/*.integration.test.{js,jsx}']
      : ['**/*.test.{js,jsx}'],
    exclude: isIntegration
      ? ['**/node_modules/**', '**/dist/**']
      : ['**/node_modules/**', '**/dist/**', '**/*.integration.test.{js,jsx}'],
  },
})
