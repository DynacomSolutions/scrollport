#!/usr/bin/env node
// Worker for one case. Usage: node case.mjs <browser> <variant> <rows>
// Starts the streaming page server in-process, prints one JSON line (the result) to stdout.
// Runs inside the runner's cgroup scope.
import { chromium, firefox, webkit } from 'playwright'
import { startServer } from './server.mjs'
import { CHUNK, token, targetIndex } from './common.mjs'

const [browserName, variant, rowsArg] = process.argv.slice(2)
const n = Number(rowsArg)
const idx = targetIndex(n)
const tok = token(idx)
const chunkIdx = Math.floor(idx / CHUNK)
const rowInChunk = idx % CHUNK
const types = { chromium, firefox, webkit }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Evaluated in page: state of the target row.
const probe = ([k, r]) => {
  const chunk = document.querySelector(`[data-chunk="${k}"]`)
  if (!chunk) return { chunkFound: false }
  const row = chunk.children[r]
  const rect = row ? row.getBoundingClientRect() : null
  const inView = !!rect && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight
  return {
    chunkFound: true,
    chunkHidden: chunk.hasAttribute('hidden'),
    inView,
    rowTop: rect ? Math.round(rect.top) : null,
    rowHeight: rect ? Math.round(rect.height) : null,
    scrollY: Math.round(window.scrollY),
    events: window.__events || null,
    readyState: document.readyState,
  }
}

const out = { browser: browserName, variant, rows: n, token: tok, targetChunk: chunkIdx }
const { server, port, stats } = await startServer()
const base = `http://127.0.0.1:${port}/page/${variant}/${n}.html`
let browser = null
try {
  browser = await types[browserName].launch({ headless: true })
  // Part 1: normal load, metrics, window.find
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await page.goto(base, { waitUntil: 'load', timeout: 200_000 })
    out.timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0]
      return { domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd), loadMs: Math.round(nav.loadEventEnd) }
    })
    out.htmlBytes = stats.lastBytes
    if (browserName === 'chromium') {
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('Performance.enable')
      const { metrics } = await cdp.send('Performance.getMetrics')
      const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]))
      out.cdp = { Nodes: m.Nodes, LayoutObjects: m.LayoutObjects, JSHeapUsedSize: m.JSHeapUsedSize }
    }
    out.beforeFind = await page.evaluate(probe, [chunkIdx, rowInChunk])
    out.windowFind = await page.evaluate(async (t) => {
      const t0 = performance.now()
      let ret, err = null
      try { ret = window.find(t) } catch (e) { ret = null; err = String(e) }
      return { returned: ret, error: err, durationMs: Math.round(performance.now() - t0) }
    }, tok)
    // allow reveal and scroll to settle
    let after
    for (let i = 0; i < 50; i++) {
      await sleep(100)
      after = await page.evaluate(probe, [chunkIdx, rowInChunk])
      if (after.inView) break
    }
    out.windowFind.chunkRevealed = after.chunkFound && out.beforeFind.chunkHidden === true && after.chunkHidden === false
    out.windowFind.chunkHiddenBefore = out.beforeFind.chunkHidden
    out.windowFind.chunkHiddenAfter = after.chunkHidden
    out.windowFind.targetInViewport = after.inView
    out.windowFind.scrollY = after.scrollY
    out.windowFind.beforematchEvents = after.events
    if (browserName === 'chromium') {
      // Second call with a different token in another chunk and the selection cleared,
      // to separate first-call warmup from steady state. Runs after the viewport checks above.
      const tok2 = token(idx - 2000)
      out.windowFind2 = await page.evaluate((t) => {
        getSelection().removeAllRanges()
        const t0 = performance.now()
        const ret = window.find(t)
        return { token: t, returned: ret, durationMs: Math.round(performance.now() - t0) }
      }, tok2)
    }
    await ctx.close()
  }
  // Part 2: text fragment on a fresh context/page
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    const t0 = Date.now()
    let navErr = null
    const nav = page.goto(`${base}#:~:text=${tok}`, { waitUntil: 'load', timeout: 200_000 }).catch((e) => { navErr = String(e.message).slice(0, 200) })
    let last = null, timeToView = null
    while (Date.now() - t0 < 60_000) {
      try {
        last = await page.evaluate(probe, [chunkIdx, rowInChunk])
        if (last.inView) { timeToView = Date.now() - t0; break }
      } catch { /* navigation in flight */ }
      await sleep(100)
    }
    out.textFragment = {
      targetInViewport: !!(last && last.inView),
      timeToTargetMs: timeToView,
      chunkHiddenAttrRemoved: last && last.chunkFound ? !last.chunkHidden : null,
      beforematchFired: last ? (last.events ? last.events.length > 0 : null) : null,
      beforematchEvents: last ? last.events : null,
      scrollY: last ? last.scrollY : null,
      readyStateAtEnd: last ? last.readyState : null,
      navError: navErr,
    }
    // after the load finished (waits up to 30 s more): did the target ever scroll into view?
    await Promise.race([nav, sleep(30_000)])
    try {
      const post = await page.evaluate(probe, [chunkIdx, rowInChunk])
      out.textFragment.afterLoad = { readyState: post.readyState, targetInViewport: post.inView, scrollY: post.scrollY, chunkHiddenAttrRemoved: post.chunkFound ? !post.chunkHidden : null }
    } catch (e) { out.textFragment.afterLoad = { error: String(e.message).slice(0, 120) } }
    await ctx.close()
  }
  out.status = 'ok'
} catch (e) {
  out.status = 'error'
  out.message = String(e && e.message).slice(0, 400)
}
try { if (browser) await browser.close() } catch {}
server.close()
console.log(JSON.stringify(out))
process.exit(0)
