/**
 * metrics.json as text: one day per line, so a day's commit on the `metrics`
 * branch shows as the handful of lines that changed rather than a reflow of
 * the whole file.
 */
export function stringifyFile(file) {
  const { days, ...head } = file
  const lines = Object.entries(days).map(([day, counts]) => `    ${JSON.stringify(day)}: ${JSON.stringify(counts)}`)
  const top = JSON.stringify(head, null, 2).replace(/\n}$/, '')
  return `${top},\n  "days": {\n${lines.join(',\n')}\n  }\n}\n`
}
