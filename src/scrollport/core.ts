/**
 * Scrollport core: native find in a virtual list, without a framework.
 *
 * The browser find bar can only match text that is in the DOM. This module keeps the text of ALL rows in the
 * DOM, as a few hidden index chunks (`hidden="until-found"`). The list draws only the rows in view. A find hit
 * inside a hidden chunk fires `beforematch`: the browser shows the chunk and scrolls the scroller to the match.
 * The caller supplies the scroller, a host element inside it, the row count, the row height and a row text accessor.
 */

export const DEFAULT_ROWS_PER_CHUNK = 100
export const DEFAULT_SPARSE_MAX_CHUNKS = 100

export type NativeFindMode = 'full' | 'sparse'

export type NativeFindOptions = {
  /** The element that scrolls. */
  scroller: HTMLElement
  /** A child of the scroller with `position: relative` and a height of `rowCount * rowHeight`. The index chunks go here. */
  host: HTMLElement
  rowCount: number
  /** Row height in px. The index uses it as its line height, so a match lies on its row. */
  rowHeight: number
  /** Text of one row. Separate cells with a tab. Line breaks become spaces. */
  getRowText: (row: number) => string
  rowsPerChunk?: number
  /** Most chunks that a query may touch to switch to sparse mode. */
  sparseMaxChunks?: number
  /** Width of one tab stop in px (the column width). */
  tabSize?: number
  /** Left padding of the index text in px. */
  indent?: number
  /** Called when the browser moves the selection onto a row. Firefox does this for the find match. Chrome does not. */
  onActiveRow?: (row: number) => void
}

export type NativeFindAudit = {
  expected: number
  expectedOccurrences: number
  findable: number
  total: number
  missing: number[]
  duplicates: number[]
  extra: number[]
  other: string[]
  corrupt: number[]
}

export type NativeFind = {
  readonly mode: NativeFindMode
  /** Text of the last find query that the browser gave to the page (Firefox only). Empty in Chrome. */
  readonly query: string
  readonly chunkCount: number
  /** Chunks that are in the DOM now. All of them in full mode, a few in sparse mode. */
  readonly attachedChunks: number
  /** Go back to full mode and forget the query. Escape does the same. */
  reset: () => void
  /** Count what native find can match for `query`, and compare it with the data. For tests. */
  audit: (query: string) => NativeFindAudit
  destroy: () => void
}

/** Number of chunks for `rowCount` rows. */
export const chunkCount = (rowCount: number, rowsPerChunk: number): number => Math.ceil(rowCount / rowsPerChunk)

/** Index of the chunk that holds `row`. */
export const chunkOfRow = (row: number, rowsPerChunk: number): number => Math.floor(row / rowsPerChunk)

/** First row of a chunk and the row after its last row. */
export const rowsOfChunk = (chunk: number, rowCount: number, rowsPerChunk: number): [first: number, end: number] => [
  chunk * rowsPerChunk,
  Math.min(rowCount, (chunk + 1) * rowsPerChunk),
]

/** Row text with line breaks removed: the index keeps one line per row. */
export const cleanLine = (text: string): string => text.replace(/[\r\n]+/g, ' ')

/** Row that holds a text offset inside a chunk. Count the line breaks before the offset. */
export function rowAtOffset(chunkText: string, offset: number, firstRow: number): number {
  let row = firstRow
  let p = -1
  while ((p = chunkText.indexOf('\n', p + 1)) >= 0 && p < offset) row++
  return row
}

/**
 * Chunks that hold the query, or `null` when the query is empty, holds a space, or touches more than `max` chunks.
 * `lowerLines` and `query` must be lower case.
 */
export function chunksOfQuery(lowerLines: readonly string[], query: string, rowsPerChunk: number, max: number): Set<number> | null {
  if (!query || /\s/.test(query)) return null
  const out = new Set<number>()
  for (let i = 0; i < lowerLines.length; i++) {
    if (lowerLines[i].includes(query)) {
      out.add(chunkOfRow(i, rowsPerChunk))
      if (out.size > max) return null
    }
  }
  return out
}

const CHUNK_ATTR = 'data-sp-chunk'

export function createNativeFind(options: NativeFindOptions): NativeFind {
  const { scroller, host, rowCount, rowHeight, getRowText, onActiveRow } = options
  const per = options.rowsPerChunk ?? DEFAULT_ROWS_PER_CHUNK
  const sparseMax = options.sparseMaxChunks ?? DEFAULT_SPARSE_MAX_CHUNKS
  const tabSize = options.tabSize ?? 120
  const indent = options.indent ?? 8
  const doc = host.ownerDocument
  const win = doc.defaultView as Window
  const count = chunkCount(rowCount, per)
  const lines = Array.from({ length: rowCount }, (_, i) => cleanLine(getRowText(i)))
  let lower: string[] | null = null // built on the first query that the browser gives us (Firefox only)

  // One hidden chunk per `per` rows: one text node, one line per row, a tab between the cells.
  const chunks: HTMLElement[] = []
  const fragment = doc.createDocumentFragment()
  for (let k = 0; k < count; k++) {
    const [first, end] = rowsOfChunk(k, rowCount, per)
    const d = doc.createElement('div')
    d.setAttribute(CHUNK_ATTR, String(k))
    d.setAttribute('hidden', 'until-found')
    d.style.cssText =
      `position:absolute;left:0;top:${first * rowHeight}px;margin:0;padding:0 0 0 ${indent}px;white-space:pre;` +
      `tab-size:${tabSize}px;font:inherit;line-height:${rowHeight}px;color:inherit;pointer-events:none;z-index:1`
    d.textContent = lines.slice(first, end).join('\n')
    chunks.push(d)
    fragment.append(d)
  }
  host.append(fragment)

  // "full": every chunk is in the page. "sparse": a browser that gives the typed text through the selection (Firefox)
  // lets the page drop the chunks that hold no match, when the query touches few chunks. That keeps the document small.
  let mode: NativeFindMode = 'full'
  let keep = new Set<number>()
  let query = ''
  let pinned: HTMLElement | null = null // the chunk of the last find hit: never hidden by scrolling
  let scrollFrame = 0
  let matchFrame = 0
  let destroyed = false

  const chunkOf = (n: Node | null): HTMLElement | null => {
    const e = n && (n.nodeType === 1 ? (n as Element) : n.parentElement)
    return e ? e.closest<HTMLElement>(`[${CHUNK_ATTR}]`) : null
  }

  function reconcile() {
    if (destroyed) return
    const span = per * rowHeight
    const a = Math.floor(scroller.scrollTop / span)
    const b = Math.floor((scroller.scrollTop + scroller.clientHeight) / span)
    const sel = doc.getSelection()
    const selChunk = sel && sel.anchorNode ? chunkOf(sel.anchorNode) : null
    for (let k = 0; k < count; k++) {
      const d = chunks[k]
      const near = k >= a && k <= b
      const protect = d === pinned || d === selChunk
      const attached = d.parentNode === host
      const wantIn = mode === 'full' || near || protect || keep.has(k)
      if (!wantIn) {
        if (attached) d.remove()
        continue
      }
      if (!attached) {
        // keep the chunk order equal to the row order
        let next: HTMLElement | null = null
        for (let j = k + 1; j < count; j++) {
          if (chunks[j].parentNode === host) {
            next = chunks[j]
            break
          }
        }
        host.insertBefore(d, next)
      }
      const shown = !d.hasAttribute('hidden')
      if (near && !shown) d.removeAttribute('hidden')
      else if (!near && shown && !protect) d.setAttribute('hidden', 'until-found')
    }
  }

  function setQuery(q: string) {
    lower ??= lines.map((l) => l.toLowerCase())
    const set = chunksOfQuery(lower, q, per, sparseMax)
    mode = set && set.size ? 'sparse' : 'full'
    keep = set ?? new Set()
    reconcile()
  }

  function reset() {
    query = ''
    mode = 'full'
    keep = new Set()
    reconcile()
  }

  // A find hit inside a hidden chunk: the browser shows it and scrolls to the match. That chunk stays until the next hit.
  const onBeforeMatch = (e: Event) => {
    const c = chunkOf(e.target as Node)
    if (!c) return
    pinned = c
    matchFrame = win.requestAnimationFrame(reconcile)
  }
  const onScroll = () => {
    if (scrollFrame) return
    scrollFrame = win.requestAnimationFrame(() => {
      scrollFrame = 0
      reconcile()
    })
  }
  // Firefox moves the page selection onto the find match: that gives the row and the exact query text.
  const onSelection = () => {
    const s = doc.getSelection()
    const a = s && s.anchorNode
    const text = s ? s.toString() : ''
    if (!s || !a || !text) return
    const c = chunkOf(a)
    if (!c || !c.firstChild) return
    onActiveRow?.(rowAtOffset((c.firstChild as Text).data, s.anchorOffset, Number(c.getAttribute(CHUNK_ATTR)) * per))
    if (!doc.hasFocus()) {
      const q = text.toLowerCase()
      if (q !== query) {
        query = q
        setQuery(q)
      }
    }
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (query || mode !== 'full')) reset()
  }

  host.addEventListener('beforematch', onBeforeMatch)
  scroller.addEventListener('scroll', onScroll, { passive: true })
  doc.addEventListener('selectionchange', onSelection)
  win.addEventListener('keydown', onKey, true)
  reconcile()

  function audit(q: string): NativeFindAudit {
    q = q.toLowerCase()
    const occurrences = (text: string): number => {
      let c = 0
      for (let p = text.indexOf(q); p >= 0; p = text.indexOf(q, p + (q.length || 1))) c++
      return c
    }
    const expected = new Map<number, number>()
    let expectedOccurrences = 0
    for (let i = 0; i < rowCount; i++) {
      let c = 0
      for (const cell of cleanLine(getRowText(i)).toLowerCase().split('\t')) c += occurrences(cell)
      if (c) {
        expected.set(i, c)
        expectedOccurrences += c
      }
    }
    const seen = new Map<number, number>()
    const other: string[] = []
    const corrupt: number[] = []
    let total = 0
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = (n as Text).parentElement
      if (!el || el.closest('script,style,template')) continue
      const hid = el.closest('[hidden]')
      if (hid && hid.getAttribute('hidden') !== 'until-found') continue
      const text = (n as Text).data.toLowerCase()
      const ck = el.closest<HTMLElement>(`[${CHUNK_ATTR}]`)
      if (ck) {
        const base = Number(ck.getAttribute(CHUNK_ATTR)) * per
        const ls = text.split('\n')
        for (let k = 0; k < ls.length; k++) {
          const row = base + k
          if (ls[k] !== lines[row]?.toLowerCase() && corrupt.length < 5) corrupt.push(row)
          for (const cell of ls[k].split('\t')) {
            const c = occurrences(cell)
            if (c) {
              total += c
              seen.set(row, (seen.get(row) ?? 0) + c)
            }
          }
        }
        continue
      }
      const c = occurrences(text)
      if (!c) continue
      total += c
      other.push(`${el.id || el.tagName.toLowerCase()} ${JSON.stringify(text.slice(0, 20))}`)
    }
    return {
      expected: expected.size,
      expectedOccurrences,
      findable: seen.size,
      total,
      missing: [...expected.keys()].filter((i) => !seen.has(i)),
      duplicates: [...seen].filter(([i, n]) => n > (expected.get(i) ?? 0)).map((x) => x[0]),
      extra: [...seen.keys()].filter((i) => !expected.has(i)),
      other,
      corrupt,
    }
  }

  return {
    get mode() {
      return mode
    },
    get query() {
      return query
    },
    chunkCount: count,
    get attachedChunks() {
      return chunks.filter((c) => c.parentNode === host).length
    },
    reset,
    audit,
    destroy() {
      destroyed = true
      host.removeEventListener('beforematch', onBeforeMatch)
      scroller.removeEventListener('scroll', onScroll)
      doc.removeEventListener('selectionchange', onSelection)
      win.removeEventListener('keydown', onKey, true)
      win.cancelAnimationFrame(scrollFrame)
      win.cancelAnimationFrame(matchFrame)
      for (const c of chunks) c.remove()
    },
  }
}
