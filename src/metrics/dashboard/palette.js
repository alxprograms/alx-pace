/**
 * The dashboard's colours, all from the ALX theme the app uses, stepped for
 * the dark navy card (#0B1645) and checked with the dataviz validator
 * (lightness band, chroma, colour-blind separation, contrast):
 *
 *   pace   behind #B98A12 · on track #5B8CFF · ahead #079A55
 *          all checks pass; worst adjacent pair ΔE 24.7 under deuteranopia.
 *   lime   #C4E878, the ALX accent: learner counts, everywhere (12.5:1).
 *   muted  daily columns behind the average line, de-emphasised.
 *
 * Text never wears these: labels and values stay in the text tokens, and a
 * coloured mark beside them carries the identity.
 */
export const SURFACE = '#0B1645'
export const LIME = '#C4E878'
export const DAILY = 'rgba(168, 186, 255, 0.28)'
export const GRID = 'rgba(255, 255, 255, 0.08)'
export const PACE = {
  behind: { color: '#B98A12', label: 'Behind' },
  'on-track': { color: '#5B8CFF', label: 'On track' },
  ahead: { color: '#079A55', label: 'Ahead' },
}
/** Bottom to top in a stack, and left to right in a legend. */
export const PACE_ORDER = ['behind', 'on-track', 'ahead']
