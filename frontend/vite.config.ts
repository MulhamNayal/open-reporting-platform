/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Only applied for production builds -- the dev server still serves from "/" so
  // `npm run dev` keeps working at http://localhost:5173/ unchanged. The build is
  // deployed as an IIS sub-application at /reportingapp, so asset URLs need that
  // prefix baked in, or the browser requests them from the domain root instead.
  base: command === 'build' ? '/reportingapp/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    server: {
      deps: {
        // Inline echarts so its ESM named exports are spy-able (vi.spyOn) in tests.
        inline: ['echarts'],
      },
    },
  },
}))
