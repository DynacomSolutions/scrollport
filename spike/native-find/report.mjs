#!/usr/bin/env node
// Usage: node report.mjs <results.jsonl> [out.md]   (default out: RESULTS.md next to this script)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = process.argv[2]
const dst = process.argv[3] || path.join(here, 'RESULTS.md')
const recs = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const order = { chromium: 0, firefox: 1, webkit: 2 }
const vorder = { 'cv-full': 0, 'uf-text': 1, 'uf-cells': 2 }
recs.sort((x, y) => order[x.browser] - order[y.browser] || vorder[x.variant] - vorder[y.variant] || x.rows - y.rows)
// Collapse an error/note to one short table-safe line.
const clean = (m) => {
  if (!m) return ''
  if (/Host system is missing dependencies/.test(m)) return 'missing system deps (libicu74, libflite1)'
  const line = String(m).replace(/\x1b\[[0-9;]*m/g, '').replace(/\[\d+m/g, '').split('\n').map((l) => l.trim()).find((l) => /[A-Za-z0-9]/.test(l) && !/^[\u2500-\u257f\s]+$/.test(l) && !/^Call log:?$/.test(l)) || ''
  const one = line.replace(/\|/g, '/')
  return one.length > 80 ? one.slice(0, 77) + '...' : one
}
const mb = (b) => (b == null ? '' : (b / 1048576).toFixed(0))
const yn = (v) => (v === true ? 'yes' : v === false ? 'no' : v == null ? '' : String(v))
const lines = []
const head = (title, cols, rowFn) => {
  lines.push(`## ${title}`, '', `| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`)
  for (const r of recs) lines.push(`| ${rowFn(r).join(' | ')} |`)
  lines.push('')
}
lines.push('# Native find spike: raw results', '', `Source: results.jsonl (${recs.length} records). Times in ms, memory in MiB.`, '')
head('Load and memory', ['browser', 'variant', 'rows', 'status', 'html MiB', 'DCL', 'load', 'peak MiB', 'wall', 'Nodes', 'LayoutObjects', 'JSHeap MiB', 'note'], (r) => [
  r.browser, r.variant, r.rows, r.status, mb(r.htmlBytes), r.timing?.domContentLoadedMs ?? '', r.timing?.loadMs ?? '',
  mb(r.memoryPeakBytes), r.wallMs ?? '', r.cdp?.Nodes ?? '', r.cdp?.LayoutObjects ?? '', mb(r.cdp?.JSHeapUsedSize), clean(r.message),
])
head('Text fragment (#:~:text=token of row n-10)', ['browser', 'variant', 'rows', 'in viewport', 'time to target', 'hidden attr removed', 'beforematch', 'scrollY', 'load done at end', 'after load: readyState', 'after load: in viewport', 'after load: scrollY', 'navError'], (r) => {
  const t = r.textFragment || {}
  return [r.browser, r.variant, r.rows, yn(t.targetInViewport), t.timeToTargetMs ?? '', yn(t.chunkHiddenAttrRemoved), yn(t.beforematchFired), t.scrollY ?? '', t.readyStateAtEnd ?? '', t.afterLoad?.readyState ?? '', yn(t.afterLoad?.targetInViewport), t.afterLoad?.scrollY ?? '', clean(t.navError)]
})
head('window.find(token of row n-10)', ['browser', 'variant', 'rows', 'returned', 'duration (1st)', 'returned (2nd)', 'duration (2nd)', 'hidden before', 'hidden after', 'revealed', 'in viewport', 'beforematch events', 'scrollY', 'error'], (r) => {
  const w = r.windowFind || {}
  return [r.browser, r.variant, r.rows, yn(w.returned), w.durationMs ?? '', yn(r.windowFind2?.returned), r.windowFind2?.durationMs ?? '', yn(w.chunkHiddenBefore), yn(w.chunkHiddenAfter), yn(w.chunkRevealed), yn(w.targetInViewport), w.beforematchEvents ? w.beforematchEvents.length : '', w.scrollY ?? '', clean(w.error)]
})
fs.writeFileSync(dst, lines.join('\n'))
