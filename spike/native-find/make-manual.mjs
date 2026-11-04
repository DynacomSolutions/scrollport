#!/usr/bin/env node
// Usage: node make-manual.mjs [port]   Prints the server command and URLs for hand testing (writes nothing).
import { token, targetIndex } from './common.mjs'

const port = process.argv[2] || '8137'
const n = 100_000
const toks = [targetIndex(n), 50_000, 250].map(token)
console.log(`Start the server (streams pages, no files):\n  node ${new URL('./server.mjs', import.meta.url).pathname} --port ${port}\n`)
for (const v of ['cv-full', 'uf-text', 'uf-cells']) {
  const u = `http://127.0.0.1:${port}/page/${v}/${n}.html`
  console.log(`${v}\n  ${u}\n  text fragment: ${u}#:~:text=${toks[0]}\n  Ctrl+F tokens: ${toks.join(', ')}\n`)
}
