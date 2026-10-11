import app from './tailwind.config.js'

/**
 * Tailwind for the learner-usage dashboard (metrics/index.html) alone, chosen
 * by the @config line in src/metrics/dashboard/dashboard.css. The app's
 * theme, so the colours and Poppins are the same; only its own files are
 * scanned, so its classes stay out of the app's stylesheet and the app's out
 * of its.
 */
export default {
  ...app,
  content: ['./metrics/index.html', './src/metrics/**/*.{js,jsx}'],
}
