#!/usr/bin/env node
// Streams pages on request from the deterministic generator. Nothing is written to disk.
//   GET /page/<variant>/<rows>.html   generated page (chunked, no compression)
//   GET /events.js                    optional beforematch recorder
// Standalone: node server.mjs --port <p>   (default: random port)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { writePage } from './generate.mjs'
import { VARIANTS } from './common.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

export function startServer(port = 0) {
  const stats = { lastBytes: 0 }
  const server = http.createServer(async (req, res) => {
    const p = req.url.split('?')[0]
    let m
    if (p === '/events.js') {
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
      fs.createReadStream(path.join(here, 'events.js')).pipe(res)
    } else if ((m = /^\/page\/(cv-full|uf-text|uf-cells)\/(\d+)\.html$/.exec(p))) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      let bytes = 0
      let closed = false
      res.on('close', () => { closed = true })
      // count bytes by wrapping write; stop early if client goes away
      const ws = new (await import('node:stream')).Writable({
        highWaterMark: 1 << 20,
        write(chunk, enc, cb) {
          if (closed) return cb()
          bytes += Buffer.byteLength(chunk)
          if (res.write(chunk)) cb(); else res.once('drain', cb)
        },
        final(cb) { stats.lastBytes = bytes; res.end(); cb() },
      })
      try { await writePage(m[1], Number(m[2]), ws) } catch { res.destroy() }
    } else {
      res.writeHead(404).end()
    }
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, stats })))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { port: { type: 'string', default: '0' } } })
  const { port } = await startServer(Number(values.port))
  console.log(`listening on http://127.0.0.1:${port}/`)
  for (const [v, sizes] of Object.entries(VARIANTS)) for (const n of sizes) console.log(`  http://127.0.0.1:${port}/page/${v}/${n}.html`)
}
