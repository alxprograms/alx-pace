/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  // The learner-usage dashboard has its own config (tailwind.metrics.config.js),
  // so none of its classes are shipped in the app's stylesheet.
  content: ['./index.html', './src/**/*.{js,jsx}', '!./src/metrics/**'],
  theme: {
    extend: {
      colors: {
        // ALX brand system — tokens sampled from the live alxafrica.com site.
        navy: {
          DEFAULT: '#03134F', // hero/banner background, headings on light
          950: '#020B33',
          900: '#03134F',
          800: '#0A2168',
          700: '#132D85',
        },
        cobalt: {
          DEFAULT: '#0452F0', // primary brand blue
          600: '#0345C9', // AA-safe for small text on white (≈7:1)
          500: '#0452F0',
          400: '#3B78F5',
        },
        lime: {
          DEFAULT: '#C4E878', // hero accent ("Transform your career.")
          300: '#DAF2A7', // chip background
          400: '#C4E878',
        },
        violet: {
          DEFAULT: '#5F3DC4', // buttons
          700: '#4F32A5',
          600: '#5F3DC4',
          300: '#C3B2F2',
        },
        alxgreen: {
          DEFAULT: '#02B75E',
          700: '#017A3F', // AA-safe for small text on white
        },
        amber: {
          DEFAULT: '#EAB308',
          700: '#92610A', // AA-safe for small text on white
        },
        ink: {
          DEFAULT: '#1C1F2A', // body text on light (site body color)
          soft: '#3F4756', // secondary text, ≈7:1 on white
          mute: '#5A6472', // muted text, ≈5.2:1 on white
        },
        paper: '#F8F8F8', // site off-white background
        tint: '#EBF6FF', // light blue panel tint
      },
      fontFamily: {
        sans: [
          'Poppins',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 4px 24px -8px rgba(3, 19, 79, 0.18)',
        glow: '0 0 0 1px rgba(196, 232, 120, 0.4), 0 8px 30px -10px rgba(4, 82, 240, 0.35)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
      },
    },
  },
}
