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
export const DEFAULT_TAB_QUANTUM = 20

export type NativeFindMode = 'full' | 'sparse'

/** Where the text of a column lies in the host, in px from the left edge of the host. */
export type NativeFindColumn = {
  /** Left edge of the text area of the cell. */
  start: number
  /** Right edge of the text area of the cell. */
  end: number
  /** Where the cell draws its text. Default `'start'`. */
  align?: 'start' | 'end'
  /**
   * Where the lines of a multi-line cell lie. A cell that shows several lines (a handle and a name) gives its text as an
   * array of lines. Line `k` uses `lines[k]`: `dx` is the distance in px from `start` to the text of the line (default 0),
   * `dy` is the distance in px from the centre of the row to the centre of the line (negative is up, default 0).
   * A line without an entry lies at the start of the column and at the centre of the row.
   */
  lines?: readonly NativeFindLine[]
}

/** Where one line of a multi-line cell lies. See `NativeFindColumn.lines`. */
export type NativeFindLine = {
  dx?: number
  dy?: number
  /**
   * Average width in px of one character of the visible text of this line. The index text is monospace, so a highlight is as
   * wide as its characters times the index character width. With this value the index draws the line with a font size that makes
   * the highlight as wide as the visible text. Without it the line uses the index font (12 px monospace).
   */
  charWidth?: number
}

/** One line of a multi-line cell with its own place. `dx` and `dy` replace the values of `NativeFindColumn.lines` for this line. */
export type NativeFindPlacedLine = {
  text: string
  dx?: number
  dy?: number
  charWidth?: number
}

/**
 * The text of a cell: one string (the index puts it at the start of the column), or an array of lines. Each line is placed
 * exactly: by `NativeFindColumn.lines`, or by its own `dx` and `dy`. Use an array for a cell with several lines, and for a
 * cell whose text does not start at the start of the column (an indent, a pill, an icon).
 */
export type NativeFindCell = string | readonly (string | NativeFindPlacedLine)[]

/** A line of a multi-line cell in the index: text that lies at an exact place over the row. */
export type NativeFindOverlay = {
  /** Offset in the row text where the overlay sits in the document order. */
  at: number
  text: string
  /** Left edge of the text in px from the left edge of the host. */
  x: number
  /** Distance in px from the centre of the row to the centre of the line. */
  dy: number
  /** Font size in px of the line, when it differs from the index font. */
  fontSize?: number
}

/**
 * Where the row text comes from.
 *
 * - `getRowText`: a visible index. The index text IS the text on screen. Cells are separated by a tab, at equal tab stops.
 * - `getRowCells` and `columns`: a transparent index over rows that draw their own text. The cells are placed at the
 *   column positions, so the browser highlight of a match lies over the real cell.
 */
export type NativeFindSource =
  | {
      /** Text of one row. Separate the cells with a tab. Line breaks become spaces. */
      getRowText: (row: number) => string
      getRowCells?: never
      columns?: never
    }
  | {
      /** Text of the cells of one row, in column order. Tabs and line breaks become spaces. A cell with several lines gives an array. */
      getRowCells: (row: number) => readonly NativeFindCell[]
      /** Position of each column. The cell at index `i` uses `columns[i]`. */
      columns: readonly NativeFindColumn[]
      getRowText?: never
    }

export type NativeFindBase = {
  /** The element that scrolls. */
  scroller: HTMLElement
  /** A child of the scroller with `position: relative`. The index chunks go here. */
  host: HTMLElement
  rowCount: number
  /** Row height in px. The index uses it as its line height, so a match lies on its row. */
  rowHeight: number
  /** Distance in px from the top of the host to the top of row 0 (for example a sticky header above the rows). Default 0. */
  rowTop?: number
  /** Width of one character of the transparent index font in px. Measured when not set. Only for `columns`. */
  charWidth?: number
  /** Distance between the tab stops of the transparent index in px. Smaller is more exact and costs more text. Default 20. */
  tabQuantum?: number
  /** `z-index` of the transparent index. It must lie over the cells that it covers. Default 1. */
  zIndex?: number
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

export type NativeFindOptions = NativeFindBase & NativeFindSource

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
  /** Characters of index text in the page (all rows, with the tabs of the transparent index). */
  readonly textLength: number
  /** Time in ms that the index took to build: row text, chunks and DOM. */
  readonly buildMs: number
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

/** Cell text with tabs and line breaks removed: a tab separates the cells in the index. */
export const cleanCell = (text: string): string => text.replace(/[\t\r\n]+/g, ' ')

const EPS = 1e-6

/** Font size in px of the transparent index (a monospace font). */
const baseFontSize = 12

/**
 * Index line for a row that draws its own text. The cells are written at the column positions, with tabs between them.
 * The index font is monospace, so the width of a text is `text.length * charWidth`. A tab moves to the next multiple of
 * `quantum`, so a cell lies at most half a quantum from its true place, unless the text of the cell before it is too long.
 * There is always at least one tab between two cells, so a match never spans two cells.
 *
 * A cell with several lines (an array) is not written in the line. Its lines are returned as overlays: text that the index
 * puts at an exact place (`x`, `dy`), so a line lies on the visible line. An overlay uses no width in the line, so it never
 * moves the next cell.
 */
export function layoutCells(
  cells: readonly NativeFindCell[],
  columns: readonly NativeFindColumn[],
  charWidth: number,
  quantum: number,
): { text: string; overlays: NativeFindOverlay[] } {
  let out = ''
  let pos = 0
  const overlays: NativeFindOverlay[] = []
  // A tab goes to the next tab stop. Browsers skip a stop that is closer than half a character (checked in Chromium 157 and Firefox 160).
  const minTab = charWidth / 2
  const tab = () => {
    out += '\t'
    const next = (Math.floor(pos / quantum + EPS) + 1) * quantum
    pos = next - pos < minTab - EPS ? next + quantum : next
  }
  for (let c = 0; c < cells.length; c++) {
    const cell = cells[c]
    const col = columns[Math.min(c, columns.length - 1)]
    if (c > 0) tab()
    if (typeof cell !== 'string') {
      cell.forEach((line, k) => {
        const own = typeof line === 'string' ? undefined : line
        const text = cleanCell(typeof line === 'string' ? line : line.text)
        const geometry = col?.lines?.[k]
        const base = col ? col.start + (own?.dx ?? geometry?.dx ?? 0) : pos
        const wanted = own?.charWidth ?? geometry?.charWidth
        const width = text.length * (wanted ?? charWidth)
        const x = col && col.align === 'end' ? Math.max(base, col.end - width) : base
        const overlay: NativeFindOverlay = { at: out.length, text, x, dy: own?.dy ?? geometry?.dy ?? 0 }
        // a monospace font is as wide as it is high: the font size gives the character width that the visible text has
        if (wanted && charWidth > 0) overlay.fontSize = Math.round((baseFontSize * wanted) / charWidth * 100) / 100
        overlays.push(overlay)
      })
      continue
    }
    const text = cleanCell(cell)
    const width = text.length * charWidth
    const want = col ? (col.align === 'end' ? Math.max(col.start, col.end - width) : col.start) : pos
    const target = Math.round(want / quantum) * quantum
    while (pos < target - minTab) tab() // closer than half a character: the browser would skip the stop, so the cell stays here
    out += text
    pos += width
  }
  return { text: out, overlays }
}

/** The row text of `layoutCells`, for callers that need no overlays. */
export function alignCells(
  cells: readonly NativeFindCell[],
  columns: readonly NativeFindColumn[],
  charWidth: number,
  quantum: number,
): string {
  return layoutCells(cells, columns, charWidth, quantum).text
}

/** Row that holds a node and an offset inside a chunk, when the chunk has overlays between its text nodes. Null when the node is not in the chunk. */
export function rowOfPoint(chunk: Element, node: Node, offset: number, firstRow: number): number | null {
  let top: Node | null = node
  while (top && top.parentNode !== chunk) top = top.parentNode
  if (!top) return null
  let row = firstRow
  for (let n = chunk.firstChild; n && n !== top; n = n.nextSibling) {
    if (n.nodeType === 3) row += countBreaks((n as Text).data, -1)
  }
  if (top === node && node.nodeType === 3) row += countBreaks((node as Text).data, offset)
  return row
}

function countBreaks(text: string, before: number): number {
  let count = 0
  let p = -1
  while ((p = text.indexOf('\n', p + 1)) >= 0 && (before < 0 || p < before)) count++
  return count
}

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

/** Width of one character of `font` in px. A monospace font has one width for every character. 0 when nothing is drawn (a test DOM). */
function measureCharWidth(host: HTMLElement, font: string): number {
  const probe = host.ownerDocument.createElement('span')
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${font}`
  probe.textContent = 'M'.repeat(200)
  host.append(probe)
  const width = probe.getBoundingClientRect().width / 200
  probe.remove()
  return width > 0 ? width : 7
}

export function createNativeFind(options: NativeFindOptions): NativeFind {
  const { scroller, host, rowCount, rowHeight, onActiveRow } = options
  const per = options.rowsPerChunk ?? DEFAULT_ROWS_PER_CHUNK
  const sparseMax = options.sparseMaxChunks ?? DEFAULT_SPARSE_MAX_CHUNKS
  const rowTop = options.rowTop ?? 0
  const quantum = options.tabQuantum ?? DEFAULT_TAB_QUANTUM
  const tabSize = options.columns ? quantum : (options.tabSize ?? 120)
  const indent = options.columns ? 0 : (options.indent ?? 8)
  const doc = host.ownerDocument
  const win = doc.defaultView as Window
  const startedAt = win.performance.now()
  const count = chunkCount(rowCount, per)
  const font = options.columns ? `${baseFontSize}px/${rowHeight}px monospace` : `inherit`
  const charWidth = options.columns ? (options.charWidth ?? measureCharWidth(host, font)) : 0

  // The texts of a row that the find bar can match, as the data holds them (tabs and line breaks removed). A multi-line cell gives one text per line.
  const cellsOf = (i: number): string[] =>
    options.columns
      ? options.getRowCells(i).flatMap((cell) =>
          typeof cell === 'string' ? [cleanCell(cell)] : cell.map((line) => cleanCell(typeof line === 'string' ? line : line.text)),
        )
      : cleanLine(options.getRowText(i)).split('\t')
  // The index of a row: the line of text, and the overlays (the lines of multi-line cells, at an exact place).
  const layoutOf = (i: number): { text: string; overlays: NativeFindOverlay[] } =>
    options.columns
      ? layoutCells(options.getRowCells(i), options.columns, charWidth, quantum)
      : { text: cleanLine(options.getRowText(i)), overlays: [] }
  let overlayChars = 0
  const lines = Array.from({ length: rowCount }, (_, i) => {
    const { text, overlays } = layoutOf(i)
    for (const o of overlays) overlayChars += o.text.length
    return text
  })
  let lower: string[] | null = null // built on the first query that the browser gives us (Firefox only)

  // The content of a chunk: one text node with one line per row and a tab between the cells. A row with a multi-line cell
  // adds one absolutely placed span per line of the cell, at the place of the cell in the document order.
  function fillChunk(d: HTMLElement, first: number, end: number) {
    let current = ''
    const flush = () => {
      if (current) d.append(doc.createTextNode(current))
      current = ''
    }
    for (let i = first; i < end; i++) {
      if (i > first) current += '\n'
      const line = lines[i]
      if (!options.columns) {
        current += line
        continue
      }
      const { overlays } = layoutOf(i)
      let p = 0
      for (const o of overlays) {
        current += line.slice(p, o.at)
        p = o.at
        flush()
        const span = doc.createElement('span')
        span.style.cssText = `position:absolute;left:${o.x}px;top:${(i - first) * rowHeight + o.dy}px${o.fontSize ? `;font-size:${o.fontSize}px` : ''}`
        span.textContent = o.text
        d.append(span)
      }
      current += line.slice(p)
    }
    flush()
  }

  // One hidden chunk per `per` rows: one text node, one line per row, a tab between the cells.
  const chunks: HTMLElement[] = []
  const fragment = doc.createDocumentFragment()
  for (let k = 0; k < count; k++) {
    const [first, end] = rowsOfChunk(k, rowCount, per)
    const d = doc.createElement('div')
    d.setAttribute(CHUNK_ATTR, String(k))
    d.setAttribute('hidden', 'until-found')
    d.style.cssText =
      `position:absolute;left:0;top:${rowTop + first * rowHeight}px;margin:0;padding:0 0 0 ${indent}px;white-space:pre;` +
      `tab-size:${tabSize}px;font:${font};line-height:${rowHeight}px;pointer-events:none;z-index:${options.zIndex ?? 1};` +
      (options.columns ? 'color:transparent' : 'color:inherit')
    if (options.columns) d.setAttribute('data-sp-layer', 'transparent')
    fillChunk(d, first, end)
    chunks.push(d)
    fragment.append(d)
  }
  host.append(fragment)
  const textLength = lines.reduce((n, l) => n + l.length + 1, 0) + overlayChars
  const buildMs = win.performance.now() - startedAt

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
    const a = Math.floor((scroller.scrollTop - rowTop) / span)
    const b = Math.floor((scroller.scrollTop + scroller.clientHeight - rowTop) / span)
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
    lower ??= lines.map((_, i) => cellsOf(i).join('\t').toLowerCase())
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
    const row = rowOfPoint(c, a, s.anchorOffset, Number(c.getAttribute(CHUNK_ATTR)) * per)
    if (row !== null) onActiveRow?.(row)
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
      for (const cell of cellsOf(i)) c += occurrences(cell.toLowerCase())
      if (c) {
        expected.set(i, c)
        expectedOccurrences += c
      }
    }
    const seen = new Map<number, number>()
    const other: string[] = []
    const corrupt: number[] = []
    let total = 0
    const audited = new Set<Element>()
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = (n as Text).parentElement
      // The browser find skips script, style, template and inert text (checked in Chromium and Firefox).
      if (!el || el.closest('script,style,template,[inert]')) continue
      const hid = el.closest('[hidden]')
      if (hid && hid.getAttribute('hidden') !== 'until-found') continue
      const text = (n as Text).data.toLowerCase()
      const ck = el.closest<HTMLElement>(`[${CHUNK_ATTR}]`)
      if (ck) {
        if (audited.has(ck)) continue
        audited.add(ck)
        const base = Number(ck.getAttribute(CHUNK_ATTR)) * per
        // The chunk is text nodes (the lines, one per row) with an absolutely placed span for each line of a multi-line cell.
        const flow: string[] = ['']
        const over: string[][] = [[]]
        for (let child = ck.firstChild; child; child = child.nextSibling) {
          if (child.nodeType === 3) {
            ;(child as Text).data.toLowerCase().split('\n').forEach((part, j) => {
              if (j > 0) {
                flow.push('')
                over.push([])
              }
              flow[flow.length - 1] += part
            })
          } else over[over.length - 1].push((child.textContent ?? '').toLowerCase())
        }
        for (let k = 0; k < flow.length; k++) {
          const row = base + k
          const wantOver = row < rowCount ? layoutOf(row).overlays.map((o) => o.text.toLowerCase()) : []
          if ((flow[k] !== lines[row]?.toLowerCase() || over[k].join('\n') !== wantOver.join('\n')) && corrupt.length < 5) corrupt.push(row)
          for (const piece of [...flow[k].split('\t'), ...over[k]]) {
            const c = occurrences(piece)
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
    textLength,
    buildMs,
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
