#!/usr/bin/env node
// Usage: node run.mjs --out <dir> [--browsers chromium,firefox,webkit] [--variants a,b] [--sizes-max n] [--timeout-s 300]
// Appends to <dir>/results.jsonl. Resumable: skips (browser,variant,rows) already recorded.
// Pages are streamed by the case worker's server on request; nothing large is written to disk.
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { VARIANTS } from './common.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const { values: a } = parseArgs({ options: {
  out: { type: 'string' }, browsers: { type: 'string', default: 'chromium,firefox,webkit' },
  variants: { type: 'string', default: Object.keys(VARIANTS).join(',') },
  'timeout-s': { type: 'string', default: '300' }, 'max-rows': { type: 'string', default: '1e12' },
} })
const outDir = a.out
fs.mkdirSync(outDir, { recursive: true })
fs.mkdirSync(path.join(outDir, 'logs'), { recursive: true })
const resultsFile = path.join(outDir, 'results.jsonl')
const log = (s) => { const l = `${new Date().toISOString()} ${s}`; console.log(l); fs.appendFileSync(path.join(outDir, 'logs', 'run.log'), l + '\n') }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const timeoutMs = Number(a['timeout-s']) * 1000
const maxRows = Number(a['max-rows'])

const done = new Map()
if (fs.existsSync(resultsFile)) for (const l of fs.readFileSync(resultsFile, 'utf8').split('\n').filter(Boolean)) {
  const r = JSON.parse(l); done.set(`${r.browser}|${r.variant}|${r.rows}`, r)
}
const dead = new Set() // browsers that cannot launch
const failed = new Set() // browser|variant that hit oom/timeout
for (const r of done.values()) if (r.status === 'oom' || r.status === 'timeout') failed.add(`${r.browser}|${r.variant}`)

const readNum = (f) => { try { return Number(fs.readFileSync(f, 'utf8').trim()) } catch { return null } }
const events = (dir) => { try { return Object.fromEntries(fs.readFileSync(path.join(dir, 'memory.events'), 'utf8').trim().split('\n').map((l) => l.split(' '))) } catch { return {} } }

async function runCase(browser, variant, rows) {
  const unit = `nfs-${browser}-${variant}-${rows}-${process.pid}`
  const args = ['--user', '--scope', `--unit=${unit}`, '-p', 'MemoryHigh=8G', '-p', 'MemoryMax=12G', '-p', 'MemorySwapMax=512M',
    'node', path.join(here, 'case.mjs'), browser, variant, String(rows)]
  const t0 = Date.now()
  const child = spawn('systemd-run', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', (d) => (stdout += d)); child.stderr.on('data', (d) => (stderr += d))
  let exited = null
  child.on('exit', (code, sig) => { exited = { code, sig } })
  let cg = null, peak = null, oomKills = 0, timedOut = false
  while (!exited) {
    await sleep(500)
    if (!cg) {
      const r = spawnSync('systemctl', ['--user', 'show', `${unit}.scope`, '-p', 'ControlGroup', '--value'])
      const v = r.stdout.toString().trim()
      if (v) cg = '/sys/fs/cgroup' + v
    }
    if (cg) {
      const p = readNum(path.join(cg, 'memory.peak')); if (p != null) peak = p
      const ev = events(cg); if (ev.oom_kill) oomKills = Number(ev.oom_kill)
    }
    if (Date.now() - t0 > timeoutMs) {
      timedOut = true
      log(`timeout ${unit}; stopping scope`)
      spawnSync('systemctl', ['--user', 'kill', '--signal=SIGKILL', `${unit}.scope`])
      spawnSync('systemctl', ['--user', 'stop', `${unit}.scope`])
      await sleep(1500)
      break
    }
  }
  fs.writeFileSync(path.join(outDir, 'logs', `${unit}.log`), `exit=${JSON.stringify(exited)}\n--stdout--\n${stdout}\n--stderr--\n${stderr}\n`)
  let res = null
  try { res = JSON.parse(stdout.trim().split('\n').pop()) } catch {}
  const rec = res || { browser, variant, rows }
  rec.wallMs = Date.now() - t0
  rec.memoryPeakBytes = peak
  rec.oomKills = oomKills
  if (timedOut) { rec.status = 'timeout' }
  else if (oomKills > 0) { rec.status = 'oom' }
  else if (!res) { rec.status = 'error'; rec.message = `no result; exit=${JSON.stringify(exited)} stderr=${stderr.slice(-300)}` }
  return rec
}

for (const variant of a.variants.split(',')) {
  for (const rows of VARIANTS[variant]) {
    if (rows > maxRows) continue
    const todo = a.browsers.split(',').filter((b) => !done.has(`${b}|${variant}|${rows}`))
    const toRun = todo.filter((b) => !failed.has(`${b}|${variant}`))
    for (const b of todo) if (!toRun.includes(b)) {
      const rec = { browser: b, variant, rows, status: 'skipped', message: 'smaller size hit oom/timeout in this browser' }
      fs.appendFileSync(resultsFile, JSON.stringify(rec) + '\n'); done.set(`${b}|${variant}|${rows}`, rec)
    }
    if (!toRun.length) continue
    if (toRun.every((b) => dead.has(b))) {
      for (const b of toRun) { const rec = { browser: b, variant, rows, status: 'error', message: 'browser failed to launch earlier (see first error for this browser)' }; fs.appendFileSync(resultsFile, JSON.stringify(rec) + '\n'); done.set(`${b}|${variant}|${rows}`, rec) }
      continue
    }
    for (const b of toRun) {
      if (dead.has(b)) {
        const rec = { browser: b, variant, rows, status: 'error', message: 'browser failed to launch earlier (see first error for this browser)' }
        fs.appendFileSync(resultsFile, JSON.stringify(rec) + '\n'); done.set(`${b}|${variant}|${rows}`, rec)
        continue
      }
      log(`case ${b} ${variant} ${rows}`)
      const rec = await runCase(b, variant, rows)
      fs.appendFileSync(resultsFile, JSON.stringify(rec) + '\n'); done.set(`${b}|${variant}|${rows}`, rec)
      log(`  -> ${rec.status} peak=${rec.memoryPeakBytes} wall=${rec.wallMs}ms ${rec.message || ''}`)
      if (rec.status === 'error' && /launch/.test(rec.message || '')) dead.add(b)
      if (rec.status === 'oom' || rec.status === 'timeout') failed.add(`${b}|${variant}`)
    }
  }
}
log('done')
