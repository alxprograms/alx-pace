import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// The curriculum CSV is imported at build time via the `?raw` suffix
// (see src/lib/schedule.js), so it is bundled deterministically with the
// app — no runtime fetch, works fully offline, and learners never see a
// file-upload input.
export default defineConfig({
  // BASE_PATH is set by the GitHub Pages deploy workflow (/alx-pace/);
  // local dev and generic hosts serve from the root.
  base: process.env.BASE_PATH || '/',
  plugins: [react()],

  build: {
    rollupOptions: {
      /*
        Two pages: the app, and the learner-usage dashboard at metrics/
        (src/metrics/dashboard). The app's entry keeps the name `index`, so its
        files are named as they always were, and the dashboard imports none of
        the app's modules (it takes its own copies of the portraits and the
        logo), so nothing of the app moves into a shared chunk: they share
        React's chunk and nothing else.
      */
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        metrics: fileURLToPath(new URL('./metrics/index.html', import.meta.url)),
      },
      output: {
        /*
          React gets its own chunk, and the reason is bandwidth rather than
          load time.

          Vite content-hashes every filename, so ANY change to the app — a
          one-word copy fix — produces a new hash and every active learner
          re-downloads the whole bundle. React is roughly half of it and only
          changes when a dependency is upgraded, a few times a year. Shipped
          together, we were re-sending the framework on every deploy.

          Split, a routine deploy sends only the app chunk. The framework stays
          in the browser cache across deploys, which also makes the app start
          faster for anyone who has opened it before.

          This matters because the free hosting allowance is metered on
          bandwidth, and the bill is therefore set by how OFTEN we ship, not by
          how many learners there are.
        */
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
