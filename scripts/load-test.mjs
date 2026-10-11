const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001'
const concurrency = Math.min(200, Math.max(1, Number(process.env.TEST_CONCURRENCY || 100)))
const started = performance.now()
const results = await Promise.all(Array.from({ length: concurrency }, async () => {
  const at = performance.now()
  const response = await fetch(base + '/api/health/live')
  await response.arrayBuffer()
  return { ok: response.ok, ms: performance.now() - at }
}))
const elapsed = performance.now() - started
const sorted = results.map((r) => r.ms).sort((a, b) => a - b)
const report = { concurrency, successful: results.filter((r) => r.ok).length, elapsedMs: Math.round(elapsed), p95Ms: Math.round(sorted[Math.floor(sorted.length * .95)] || 0) }
console.log(JSON.stringify(report))
if (report.successful !== concurrency || report.p95Ms > 2000) process.exitCode = 1
