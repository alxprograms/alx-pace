import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/*
  The learner-usage dashboard (metrics/index.html, src/metrics/dashboard),
  built on its own after the app: `npm run build` runs the app's build, then
  this one into the same dist/.

  Apart, not as a second input of the app's build: two pages in one build
  share chunks, so learners' phones would load files there only for the
  dashboard, and a dashboard change could rename the app's and make every
  learner download it again. Built apart, the app's output is exactly what it
  would be with no dashboard at all.
*/
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  // The app's build has already copied public/ into dist/.
  publicDir: false,
  build: {
    outDir: 'dist',
    // Keeps the app, built just before.
    emptyOutDir: false,
    assetsDir: 'metrics/assets',
    rollupOptions: {
      input: fileURLToPath(new URL('./metrics/index.html', import.meta.url)),
    },
  },
})
