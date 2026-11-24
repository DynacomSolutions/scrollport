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

/**
 * A piece of the row text that the index draws away from its place in the flow: a line of a multi-line cell, or a text that
 * does not start at the start of its column. The piece stays in the row text. The index wraps it in an inline span with
 * `position: relative`, which moves the drawing and the find highlight but not the flow.
 */
export type NativeFindOverlay = {
  /** Offset of the piece in the row text. */
  at: number
  /** Length of the piece in characters. */
  length: number
  /** Distance in px to move the piece to the right (negative: to the left). */
  dx: number
  /** Distance in px to move the piece down (negative: up). */
  dy: number
  /** Font size in px of the piece, when it differs from the index font. */
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
 * A cell with several lines (an array) writes each line as a piece, in the document order of the cell. A piece that must
 * lie at an exact place (`dx`, `dy`, `charWidth`) is also returned as an overlay: the index moves its drawing with
 * `position: relative`. The flow does not change, and the text stays in one block with its row, which the browser find needs.
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
  let first = true
  // Writes one piece of text, as near as the tab stops allow to `want` (the left edge of the visible text), and returns the flow position of its start.
  const write = (text: string, width: number, want: number): number => {
    if (!first) tab()
    first = false
    const target = Math.round(want / quantum) * quantum
    while (pos < target - minTab) tab() // closer than half a character: the browser would skip the stop, so the text stays here
    const start = pos
    out += text
    pos += width
    return start
  }
  for (let c = 0; c < cells.length; c++) {
    const cell = cells[c]
    const col = columns[Math.min(c, columns.length - 1)]
    if (typeof cell === 'string') {
      const text = cleanCell(cell)
      const width = text.length * charWidth
      write(text, width, col ? (col.align === 'end' ? Math.max(col.start, col.end - width) : col.start) : pos)
      continue
    }
    cell.forEach((line, k) => {
      const own = typeof line === 'string' ? undefined : line
      const text = cleanCell(typeof line === 'string' ? line : line.text)
      const geometry = col?.lines?.[k]
      const wanted = own?.charWidth ?? geometry?.charWidth
      const width = text.length * (wanted ?? charWidth)
      const base = col ? col.start + (own?.dx ?? geometry?.dx ?? 0) : pos
      const want = col && col.align === 'end' ? Math.max(base, col.end - width) : base
      const startPos = write(text, width, want)
      const dy = own?.dy ?? geometry?.dy ?? 0
      const dx = want - startPos
      // a monospace font is as wide as it is high: the font size gives the character width that the visible text has
      const fontSize = wanted && charWidth > 0 ? Math.round(((baseFontSize * wanted) / charWidth) * 100) / 100 : undefined
      if (dy || fontSize || Math.abs(dx) > 0.25) {
        const overlay: NativeFindOverlay = { at: out.length - text.length, length: text.length, dx: Math.round(dx * 100) / 100, dy }
        if (fontSize) overlay.fontSize = fontSize
        overlays.push(overlay)
      }
    })
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

/** Row that holds a node and an offset inside a chunk. The text of a row may lie in spans (see `NativeFindOverlay`), so this counts the line breaks in all the text before the point. Null when the node is not in the chunk. */
export function rowOfPoint(chunk: Element, node: Node, offset: number, firstRow: number): number | null {
  if (!chunk.contains(node)) return null
  const range = chunk.ownerDocument.createRange()
  range.setStart(chunk, 0)
  range.setEnd(node, node.nodeType === 3 ? offset : Math.min(offset, node.childNodes.length))
  return firstRow + countBreaks(range.toString(), -1)
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
  const lines = Array.from({ length: rowCount }, (_, i) => layoutOf(i).text)
  let lower: string[] | null = null // built on the first query that the browser gives us (Firefox only)

  // The content of a chunk: one line of text per row, a tab between the cells. A piece that is drawn away from its place in the
  // flow (a line of a multi-line cell) is wrapped in an inline span with `position: relative`.
  function fillChunk(d: HTMLElement, first: number, end: number) {
    const append = (text: string) => {
      const last = d.lastChild
      if (last && last.nodeType === 3) (last as Text).data += text
      else d.append(doc.createTextNode(text))
    }
    for (let i = first; i < end; i++) {
      if (i > first) append('\n')
      const line = lines[i]
      if (!options.columns) {
        append(line)
        continue
      }
      let p = 0
      for (const o of layoutOf(i).overlays) {
        append(line.slice(p, o.at))
        const span = doc.createElement('span')
        span.style.cssText = `position:relative;line-height:0;left:${o.dx}px;top:${o.dy}px${o.fontSize ? `;font-size:${o.fontSize}px` : ''}`
        span.textContent = line.slice(o.at, o.at + o.length)
        d.append(span)
        p = o.at + o.length
      }
      append(line.slice(p))
    }
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
  const textLength = lines.reduce((n, l) => n + l.length + 1, 0)
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
        // The chunk text is one line per row. Spans (see `NativeFindOverlay`) lie inside the lines.
        const ls = (ck.textContent ?? '').toLowerCase().split('\n')
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
