#!/usr/bin/env node
// Usage: node generate.mjs --variant <cv-full|uf-text|uf-cells> --rows <n> --out <file>
import fs from 'node:fs'
import { once } from 'node:events'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { CHUNK, ROW_H, COL_W, COLS, TOKEN_COL, token } from './common.mjs'

const first = ['Ava','Liam','Noah','Emma','Olivia','Elijah','Mia','Sophia','James','Lucas','Amelia','Isabella','Ethan','Mason','Harper','Evelyn','Benjamin','Charlotte']
const last = ['Turner','Rivera','Patel','Brooks','Nguyen','Bennett','Campbell','Morris','Hughes','Parker','Edwards','Reed','Kelly','Diaz','Ward','Mitchell','Bailey']
const roles = ['Product Manager','Sales Lead','Account Executive','Data Analyst','Engineering Manager','Support Specialist','Finance Manager','Marketing Strategist']
const depts = ['Product','Sales','Operations','Engineering','Finance','Marketing','Support']
const countries = ['United States','Canada','United Kingdom','Germany','Australia','Netherlands']
const cities = ['New York','Toronto','London','Berlin','Sydney','Amsterdam','Austin','Chicago']
const statuses = ['Active','Pending','Suspended']
const plans = ['Free','Starter','Growth','Enterprise']
const companies = ['Northwind Labs','BluePeak Systems','Summit Grid','Cedar Analytics','Harborline Tech','Vertex Dynamics','Atlas Commerce','Pioneer Works']
const domains = ['example.com','acme.io','northwind.app','harborhq.com','bluepeak.co']
const BASE = Date.UTC(2026, 0, 1)

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (a, r) => a[Math.floor(r() * a.length)]
const between = (a, b, r) => a + (b - a) * r()
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d
const day = (off) => new Date(BASE - off * 86400000).toISOString().slice(0, 10)
const mins = (off) => new Date(BASE - off * 60000).toISOString()

// Returns 28 cell strings; cell TOKEN_COL (username) is the unique token.
export function rowValues(i) {
  const r = mulberry32((i + 1) * 1299721)
  const f = pick(first, r), l = pick(last, r)
  const user = `${f.toLowerCase()}.${l.toLowerCase()}${Math.floor(between(10, 999, r))}`
  const dom = pick(domains, r)
  const mrr = round(between(200, 26000, r), 2)
  const v = [
    i + 1, token(i), `https://i.pravatar.cc/64?u=${user}`, `${f} ${l}`, `${user}@${dom}`,
    pick(roles, r), pick(depts, r), pick(countries, r), pick(cities, r), pick(statuses, r),
    pick(plans, r), day(Math.floor(between(10, 2200, r))), mins(Math.floor(between(5, 120000, r))),
    `https://www.${dom}`, `https://app.${dom}/users/${user}`, pick(companies, r),
    Math.floor(between(0, 1600, r)), Math.floor(between(5, 14000, r)),
    round(between(0.2, 34.2, r), 2), round(between(2000, 320000, r), 2), round(between(50, 92000, r), 2),
    mrr, round(mrr * 12, 2), round(between(500, 210000, r), 2), Math.round(between(35, 99, r)),
    Math.floor(between(0, 36, r)), day(-Math.floor(between(-10, 420, r))),
  ]
  return v.map(String)
}

const css = `
*{box-sizing:border-box}
body{margin:0;font:13px/${ROW_H}px system-ui,sans-serif}
.t{width:${COLS.length * COL_W}px}
.h,.r{display:grid;grid-template-columns:repeat(${COLS.length},${COL_W}px);height:${ROW_H}px}
.h{position:sticky;top:0;z-index:1;background:#eee;font-weight:600;border-bottom:1px solid #999}
.c,.h>div{padding:0 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.r{border-bottom:1px solid #ddd}
.rt{height:${ROW_H}px;overflow:hidden;white-space:nowrap;border-bottom:1px solid #ddd;padding:0 6px}
.k{contain-intrinsic-size:auto ${CHUNK * ROW_H}px}
.k.cv{content-visibility:auto}
`

const cellsHtml = (v) => v.map((x) => `<div class="c" role="cell">${x}</div>`).join('')
const rowHtml = (i) => `<div class="r" role="row">${cellsHtml(rowValues(i))}</div>`
const textHtml = (i) => `<div class="rt">${rowValues(i).join(' ')}</div>`

// Streams the page for (variant, n) into any writable stream, honouring backpressure.
export async function writePage(variant, n, ws) {
  let buf = []
  let size = 0
  const flush = async () => {
    if (!buf.length) return
    const data = buf.join(''); buf = []; size = 0
    if (!ws.write(data)) await once(ws, 'drain')
  }
  const put = async (s) => {
    buf.push(s); size += s.length
    if (size > 1 << 20) await flush()
  }
  await put(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${variant} ${n}</title><style>${css}</style>`)
  await put(`<script src="/events.js" defer></script></head><body>`)
  await put(`<div class="t" role="table" aria-rowcount="${n + 1}"><div class="h" role="row">`)
  await put(COLS.map((c) => `<div role="columnheader">${c}</div>`).join('') + '</div>')
  for (let start = 0, k = 0; start < n; start += CHUNK, k++) {
    const end = Math.min(start + CHUNK, n)
    let open, rowFn
    if (variant === 'cv-full') {
      open = `<div class="k cv" role="rowgroup" data-chunk="${k}">`; rowFn = rowHtml
    } else if (k === 0) {
      open = `<div class="k" role="rowgroup" data-chunk="0">`; rowFn = rowHtml
    } else {
      open = `<div class="k" role="rowgroup" hidden="until-found" data-chunk="${k}">`
      rowFn = variant === 'uf-text' ? textHtml : rowHtml
    }
    await put(open)
    for (let i = start; i < end; i++) await put(rowFn(i))
    await put('</div>')
  }
  await put('</div></body></html>')
  await flush()
  ws.end()
}

async function main() {
  const { values } = parseArgs({ options: { variant: { type: 'string' }, rows: { type: 'string' }, out: { type: 'string' } } })
  const { variant, out } = values
  const n = Number(values.rows)
  if (!['cv-full', 'uf-text', 'uf-cells'].includes(variant) || !(n > 0) || !out) {
    console.error('usage: generate.mjs --variant <cv-full|uf-text|uf-cells> --rows <n> --out <file>')
    process.exit(2)
  }
  const ws = fs.createWriteStream(out)
  await writePage(variant, n, ws)
  await once(ws, 'finish')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
