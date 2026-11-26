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
  /** Left edge of the text area of the column in px, from the left edge of the host. */
  start: number
  /** Right edge of the text area of the column in px. */
  end: number
  /** Where the cell draws its text. Default `'start'`. */
  align?: 'start' | 'end'
  /** The font of the visible text of the column. Without it the index draws the text in its own monospace font. */
  font?: NativeFindFont
  /** Distance in px from the centre of the row to the baseline of the visible text of the column, when it differs from `NativeFindBase.baseline`. */
  baseline?: number
  /**
   * Where the lines of a multi-line cell lie. A cell that shows several lines (a handle and a name) gives its text as an
   * array of lines. Line `k` uses `lines[k]`: `dx` is the distance in px from `start` to the text of the line (default 0),
   * `dy` is the distance in px from the centre of the row to the centre of the line (negative is up, default 0), `font` is
   * the font of the line (default: the font of the column), `baseline` is the distance from the centre of the row to the
   * baseline of the visible text (it replaces `dy`; measure it on the real cell with `readNativeFindBaseline`).
   * A line without an entry lies at the start of the column and at the centre of the row.
   */
  lines?: readonly NativeFindLine[]
}

/**
 * The font of a visible text. The index draws the text in this font, so the find highlight has the width of the real text
 * (the index font is monospace, the cells are not). The values are the computed style of the cell (`readNativeFindFont`).
 */
export type NativeFindFont = {
  /** The `font-family` list. */
  family: string
  /** Font size in px. */
  size: number
  /** The `font-weight`, for example `'400'`. */
  weight?: string
  /** The `font-style`, for example `'italic'`. */
  style?: string
  /** The `letter-spacing` in px. */
  letterSpacing?: number
  /** The `font-variant-numeric`, for example `'tabular-nums'`. */
  numeric?: string
}

/** Where one line of a multi-line cell lies. See `NativeFindColumn.lines`. */
export type NativeFindLine = {
  dx?: number
  dy?: number
  baseline?: number
  font?: NativeFindFont
  /**
   * The line follows the line before it in the same cell, `gap` px after its end (the end is measured). The index writes it right
   * after that line, without a tab, so a match can run over both lines. Start the text with a space for that. `dx` is then not used.
   */
  gap?: number
}

/** One line of a multi-line cell with its own place. `dx`, `dy` and `font` replace the values of `NativeFindColumn.lines` for this line. */
export type NativeFindPlacedLine = {
  text: string
  dx?: number
  dy?: number
  baseline?: number
  font?: NativeFindFont
  gap?: number
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
  /** The font of the visible text. The span draws the piece in this font. */
  font?: NativeFindFont
  /** Space in px after the piece. It puts the end of the piece between two tab stops, so a small error of the measured width cannot move the next cell by one tab stop. */
  margin?: number
}

/**
 * What `layoutCells` needs to know about fonts. `createNativeFind` measures them in the page.
 */
export type NativeFindFontMetrics = {
  /** The font of the row text (the chunk). A piece in another font gets its own span. */
  base?: NativeFindFont
  /** Width in px of `text` drawn in `font`. */
  width: (font: NativeFindFont, text: string) => number
  /** Distance in px from the centre of a line box to the baseline of the text. `undefined`: the font of the row text. */
  baseline: (font?: NativeFindFont) => number
  /** Distance in px from the centre of the row to the baseline of the row text (the chunk). Default: `baseline()`. */
  rowBaseline?: number
  /** Called when the layout of all rows is done: takes away what the measures put in the page. */
  release?: () => void
  /** Width in px of one space in `font`, as the page lays it out. */
  space: (font: NativeFindFont) => number
  /** Width in px of the digit 0 in `font` (`1ch`), as the page lays it out. */
  zero: (font: NativeFindFont) => number
  /**
   * How far in px the page moves the character `ch` to the left when a space comes before it (kerning). A canvas measure does not
   * show it, so the page measures it with a probe.
   */
  kernAfterSpace: (font: NativeFindFont, ch: string) => number
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
  /** Width of one character of the transparent index font in px. Measured when not set. Only for `columns`. With `font` it is the width of one space. */
  charWidth?: number
  /**
   * Distance in px from the centre of a row to the baseline of the visible text of most cells (`readNativeFindBaseline`). The index
   * moves its text so that its baseline lies there. Default: the baseline that the index font gives.
   */
  baseline?: number
  /**
   * The font of the transparent index (`columns`), in px: the font of the visible text of most cells (`readNativeFindFont`).
   * The index draws its text in this font, so a find highlight has the width of the real text. Default: a monospace font.
   */
  font?: NativeFindFont
  /** Distance between the tab stops of the transparent index in px. Smaller needs fewer spaces to place a text exactly and costs more tabs. Default 20 (the table uses 10). */
  tabQuantum?: number
  /** `z-index` of the transparent index. It must lie over the cells that it covers. Default 1. */
  zIndex?: number
  rowsPerChunk?: number
  /** Deprecated. The native index keeps all chunks attached for every browser. */
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
  /** Chunks that are in the DOM now. Every chunk stays in the DOM. */
  readonly attachedChunks: number
  /** Forget the query. Escape does the same. */
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
type FlowPlan = { tabs: number; spaces: number; kern: number; trail: number }
/** Most error in px of the left edge of a piece in the font of the row text (see `layoutCells`). */
const FLOW_ERROR = 1.0
/** Most spaces after the tabs of a piece in the font of the row text. */
const MAX_FINE_SPACES = 14
/** Most spaces after the text of a piece in the font of the row text: they move its end away from the edge of the skip rule, so the piece needs no span. */
const MAX_TRAIL_SPACES = 2
/** Distance in px between the end of a piece and a change of its next tab stop that is safe for a small error of the measured width. */
const SAFE_SLACK = 0.6

/** Font size in px of the transparent index (a monospace font). */
const baseFontSize = 12

/**
 * Index line for a row that draws its own text. The cells are written at the column positions, with tabs between them.
 * A tab moves to the next multiple of `quantum`. There is always at least one tab between two cells, so a match never spans two cells.
 *
 * Without `fonts` the index font is monospace, so the width of a text is `text.length * charWidth`, and a cell lies at most half a
 * quantum from its true place, unless the text of the cell before it is too long.
 *
 * With `fonts` the index draws the row text in the font of the visible text (`fonts.base`). A piece in that font lies in the row
 * text. A few spaces after the tabs bring its left edge to within 1 px of the visible text, and the tab after it is chosen so that a
 * small error of the measured width cannot move the next cell. A piece in another font, or on another line of its cell, gets an
 * overlay: the index wraps it in an inline span with `position: relative`, in its own font, at its exact place. The flow does not
 * change, and the text stays in one block with its row, which the browser find needs.
 */
export function layoutCells(
  cells: readonly NativeFindCell[],
  columns: readonly NativeFindColumn[],
  charWidth: number,
  quantum: number,
  fonts?: NativeFindFontMetrics,
  rowTextBaseline = 0,
): { text: string; overlays: NativeFindOverlay[] } {
  let out = ''
  let pos = 0
  const overlays: NativeFindOverlay[] = []
  const base = fonts?.base
  const spaceWidth = base && fonts ? fonts.space(base) : 0
  // A tab goes to the next tab stop, but a stop that is too close is skipped. How close is too close depends on the browser:
  // Chromium 157 skips a stop closer than half a space, Firefox 160 a stop closer than half of `1ch` (the width of a 0, as the CSS
  // text specification says). The index never ends a piece in between: it ends it where the two browsers agree (`slack`).
  const skipBelow = base && fonts ? spaceWidth / 2 : charWidth / 2 // the smaller limit
  const skipAbove = base && fonts ? Math.max(skipBelow, fonts.zero(base) / 2) : skipBelow // the larger limit
  const stopAfter = (p: number): number => {
    const next = (Math.floor(p / quantum + EPS) + 1) * quantum
    return next - p < (skipBelow + skipAbove) / 2 ? next + quantum : next
  }
  const tab = () => {
    out += '\t'
    pos = stopAfter(pos)
  }
  let first = true
  // The tab after a text that ends at `end` goes to the next stop, or to the one after it when the next is closer than `skipBelow` (Chromium)
  // or `skipAbove` (Firefox). How far the distance to the next stop is from the two limits in px: the measured width may be wrong by
  // this much before the browsers disagree, or the next cell moves by one stop. Negative when the end lies between the limits.
  const slack = (end: number): number => {
    const gap = quantum - ((((end % quantum) + quantum) % quantum) % quantum)
    return gap < skipBelow ? skipBelow - gap : gap - skipAbove
  }
  // The tabs and spaces that bring a piece in the font of the row text to within `FLOW_ERROR` of `want`, with room for a small error of
  // the measured width at its end. Null when no count of spaces does it: the piece then gets a span (an overlay).
  const planFlow = (text: string, width: number, want: number, hadTab: boolean, maxTrail: number): FlowPlan | null => {
    const from = hadTab ? stopAfter(pos) : pos
    // a space and the first character of the text can kern: the text then starts a little before the end of the spaces
    const kern = base && fonts && text ? fonts.kernAfterSpace(base, text[0]) : 0
    let best: FlowPlan | null = null
    let bestErr = Infinity
    for (let b = 0; b <= MAX_FINE_SPACES; b++) {
      const tabs = Math.max(0, Math.round((want - b * spaceWidth - (b ? kern : 0) - from) / quantum))
      const start = from + tabs * quantum + b * spaceWidth + (b ? kern : 0)
      const err = Math.abs(start - want)
      if (err > FLOW_ERROR) continue
      // spaces after the text move its end away from the edge of the skip rule (the fewest that do it)
      let trail = -1
      for (let t = 0; t <= maxTrail; t++) {
        if (slack(start + width + t * spaceWidth) >= SAFE_SLACK) {
          trail = t
          break
        }
      }
      if (trail < 0) continue
      const cost = tabs + b + trail
      if (err < bestErr - 0.05 || (Math.abs(err - bestErr) <= 0.05 && best && cost < best.tabs + best.spaces + best.trail)) {
        best = { tabs, spaces: b, kern, trail }
        bestErr = err
      }
      if (err < 0.3 && trail === 0) break // good enough: no need to try more
    }
    return best
  }
  // Writes a piece of the row text and returns the flow position of its start.
  // - `join`: right after the piece before it, no tab.
  // - `flow` (a piece in the font of the row text): the tabs and spaces of `plan`.
  // - `near`: the start lies at the tab stop near `want`; the overlay moves the piece the rest.
  const write = (text: string, width: number, want: number, how: 'join' | 'flow' | 'near', plan: FlowPlan | null): number => {
    if (how !== 'join') {
      if (!first) tab()
      if (how === 'flow' && plan) {
        for (let t = 0; t < plan.tabs; t++) tab()
        out += ' '.repeat(plan.spaces)
        pos += plan.spaces * spaceWidth + (plan.spaces ? plan.kern : 0)
      } else {
        const target = Math.round(want / quantum) * quantum
        while (pos < target - skipAbove) tab() // closer than half a space: the browser would skip the stop, so the text stays here
      }
    }
    first = false
    const start = pos
    out += text
    pos += width
    if (how === 'flow' && plan && plan.trail) {
      out += ' '.repeat(plan.trail)
      pos += plan.trail * spaceWidth
    }
    return start
  }
  // The tab after a piece goes to the stop above its end. When the measured end lies near the edge of that choice, a small error
  // of the measure would move the next cell by one stop. Space after the piece (a margin) puts it in the middle of the choice.
  const margin = (): number => {
    if (slack(pos) >= SAFE_SLACK) return 0
    // move the end to the middle of the distances where no browser skips the next stop
    const gap = quantum - ((((pos % quantum) + quantum) % quantum) % quantum)
    const want = skipAbove + (quantum - skipAbove) / 2
    const space = (((gap - want) % quantum) + quantum) % quantum
    pos += space
    return space
  }
  for (let c = 0; c < cells.length; c++) {
    const cell = cells[c]
    const col = columns[Math.min(c, columns.length - 1)]
    const lines = typeof cell === 'string' ? [cell] : cell
    let previousEnd = 0 // where the line before ended, in px from the left edge of the host
    lines.forEach((line, k) => {
      const own = typeof line === 'string' ? undefined : line
      const text = cleanCell(typeof line === 'string' ? line : line.text)
      const geometry = typeof cell === 'string' ? undefined : col?.lines?.[k]
      const font = fonts && base ? (own?.font ?? geometry?.font ?? col?.font ?? base) : undefined
      const width = font && fonts ? fonts.width(font, text) : text.length * charWidth
      const gap = own?.gap ?? geometry?.gap
      const join = gap !== undefined && k > 0 && font !== undefined
      const next = lines[k + 1]
      const joinNext = next !== undefined && typeof next !== 'string' && (next.gap ?? col?.lines?.[k + 1]?.gap) !== undefined
      // a joined line starts with a space that lies in the gap: the visible text starts `gap` px after the end of the line before
      const lead = join && font && fonts ? fonts.width(font, text.slice(0, text.length - text.trimStart().length)) : 0
      const from = join ? previousEnd + (gap as number) - lead : col ? col.start + (own?.dx ?? geometry?.dx ?? 0) : pos
      const want = col && col.align === 'end' && !join ? Math.max(from, col.end - width) : from
      previousEnd = want + width
      const dy = own?.dy ?? geometry?.dy ?? 0
      const given = own?.baseline ?? geometry?.baseline ?? col?.baseline
      const rowBase = fonts?.rowBaseline ?? fonts?.baseline() ?? 0
      const other = font !== undefined && font !== base && fontCss(font) !== fontCss(base as NativeFindFont)
      // how far the baseline of the visible text lies under the baseline of the row text
      const top = !fonts || !font ? (given !== undefined ? given - rowTextBaseline : dy) : given !== undefined ? given - rowBase : dy + (other || dy ? fonts.baseline(font) - fonts.baseline() : 0)
      let how: 'join' | 'flow' | 'near' = join ? 'join' : 'near'
      let plan: FlowPlan | null = null
      if (!join && font !== undefined && !other && Math.abs(top) < 0.25) {
        plan = planFlow(text, width, want, !first, joinNext ? 0 : MAX_TRAIL_SPACES)
        if (plan) how = 'flow'
      }
      const start = write(text, width, want, how, plan)
      const space = font && !joinNext && how !== 'flow' ? margin() : 0
      const dx = want - start
      // a plain cell of the monospace index stays in the flow (it lies within half a tab stop of its place)
      if (how !== 'flow' && (other || space || Math.abs(top) >= 0.25 || (Math.abs(dx) > 0.25 && (font !== undefined || typeof cell !== 'string')))) {
        const overlay: NativeFindOverlay = {
          at: out.length - text.length,
          length: text.length,
          dx: Math.round(dx * 100) / 100,
          dy: Math.round(top * 100) / 100,
        }
        if (other) overlay.font = font
        if (space) overlay.margin = Math.round(space * 100) / 100
        overlays.push(overlay)
      }
    })
  }
  return { text: out, overlays }
}

/**
 * The plain text of a cell that has lines: the texts of the lines in one string, with a space between two lines. A line that starts
 * with a space (a joined line) gets no extra space. Use it for an index that is not font based (a monospace index has one line per cell).
 */
export function plainCellText(cell: NativeFindCell): string {
  if (typeof cell === 'string') return cell
  let out = ''
  for (const line of cell) {
    const text = typeof line === 'string' ? line : line.text
    out += out && !text.startsWith(' ') ? ' ' + text : text
  }
  return out
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

function measureLineBaseline(host: HTMLElement, font: string, rowHeight: number): number {
  const container = host.ownerDocument.createElement('div')
  container.style.cssText = `position:absolute;left:0;top:0;width:1px;height:${rowHeight}px;overflow:hidden;visibility:hidden;white-space:pre;font:${font};line-height:${rowHeight}px`
  const leaf = host.ownerDocument.createElement('span')
  container.append(leaf)
  host.append(container)
  const baseline = readNativeFindBaseline(container, leaf).baseline
  container.remove()
  return baseline
}

type FontMeasure = { context: CanvasRenderingContext2D | null; chars: Float64Array; pairs: Map<number, number> }
const measures = new WeakMap<NativeFindFont, FontMeasure>()
let noCanvas = false // a test DOM has no canvas: ask once

function measureOf(doc: Document, font: NativeFindFont): FontMeasure {
  let m = measures.get(font)
  if (!m) {
    // one canvas context for each font: setting the font of a context again and again is slow
    let context: CanvasRenderingContext2D | null = null
    if (!noCanvas) {
      try {
        context = doc.createElement('canvas').getContext('2d')
        if (context) context.font = `${font.style ?? 'normal'} ${font.weight ?? '400'} ${font.size}px ${font.family}`
      } catch {
        context = null
      }
      noCanvas = context === null
    }
    measures.set(font, (m = { context, chars: new Float64Array(0x10000).fill(-1), pairs: new Map() }))
  }
  return m
}

/**
 * Width in px of `text` drawn in `font`, from canvas measures. It is the sum of the widths of the characters and of the kerning of
 * each pair of characters, which the canvas gives once for each pair. That is exact for kerning by pairs, and about 3 times faster
 * than a canvas measure of each text. A test DOM has no canvas: the width is then a guess.
 */
export function measureNativeFindText(doc: Document, font: NativeFindFont, text: string): number {
  const m = measureOf(doc, font)
  const ctx = m.context
  if (!ctx) return text.length * font.size * 0.55
  const chars = m.chars
  const advance = (code: number): number => {
    let w = chars[code]
    if (w < 0) chars[code] = w = ctx.measureText(String.fromCharCode(code)).width
    return w
  }
  if (text.length === 0) return 0
  let previous = text.charCodeAt(0)
  let width = advance(previous)
  for (let i = 1; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const key = previous * 0x10000 + code
    let kern = m.pairs.get(key)
    if (kern === undefined) {
      kern = ctx.measureText(String.fromCharCode(previous, code)).width - advance(previous) - advance(code)
      m.pairs.set(key, kern)
    }
    width += advance(code) + kern
    previous = code
  }
  return width + (font.letterSpacing ?? 0) * text.length
}

/** The CSS of a `NativeFindFont`, for the style of a piece and for the font probes. */
const cssCache = new WeakMap<NativeFindFont, string>()
export function fontCss(font: NativeFindFont): string {
  let css = cssCache.get(font)
  if (css === undefined) {
    css =
      `font-family:${font.family};font-size:${font.size}px;font-weight:${font.weight ?? '400'};font-style:${font.style ?? 'normal'};` +
      `letter-spacing:${font.letterSpacing ?? 0}px;font-variant-numeric:${font.numeric ?? 'normal'}`
    cssCache.set(font, css)
  }
  return css
}

/**
 * The distance in px from the centre of `container` (a cell of the height of a row) to the baseline of the text in `leaf`, which lies
 * in `container`. The index needs it to put its text on the baseline of the visible text. It replaces the content of `leaf` with a
 * text, so call it on a copy of the cell that is not on screen, and read the font before.
 */
export function readNativeFindBaseline(container: Element, leaf: Element): { baseline: number; left: number } {
  const doc = leaf.ownerDocument
  const text = doc.createElement('span')
  const mark = doc.createElement('span')
  mark.style.cssText = 'display:inline-block;width:0;height:0'
  text.append('Hxg', mark)
  leaf.replaceChildren(text)
  const c = container.getBoundingClientRect()
  return { baseline: mark.getBoundingClientRect().bottom - (c.top + c.height / 2), left: text.getBoundingClientRect().left - c.left }
}

/** The font of the text in `element`, as the browser computes it. Use it on an element that draws the visible text of a cell. */
export function readNativeFindFont(element: Element): NativeFindFont {
  const style = (element.ownerDocument.defaultView as Window).getComputedStyle(element)
  const letterSpacing = parseFloat(style.letterSpacing)
  const font: NativeFindFont = { family: style.fontFamily, size: parseFloat(style.fontSize) || 16 }
  if (style.fontWeight && style.fontWeight !== '400') font.weight = style.fontWeight
  if (style.fontStyle && style.fontStyle !== 'normal') font.style = style.fontStyle
  if (letterSpacing) font.letterSpacing = letterSpacing
  if (style.fontVariantNumeric && style.fontVariantNumeric !== 'normal') font.numeric = style.fontVariantNumeric
  return font
}

/**
 * Measures widths (canvas) and baselines (a probe line in the page) of fonts. A width is an estimate: the index needs it to choose
 * the tab stop after a piece (see `layoutCells`), and the piece draws in the real font, so the highlight has the real width.
 */
type FontLab = { space: number; zero: number; kern: Map<string, number> }
const labs = new WeakMap<NativeFindFont, FontLab>() // kept between builds (a sort or a filter builds again)
const baselineCache = new Map<string, number>()

function createFontMetrics(host: HTMLElement, indexFont: string, base: NativeFindFont): NativeFindFontMetrics {
  const doc = host.ownerDocument
  // A place that is not on screen, and that the layout of the page does not touch: a measure here does not lay out the table.
  const lab = doc.createElement('div')
  lab.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;contain:strict'
  lab.setAttribute('aria-hidden', 'true')
  let attached = false
  const measure = (css: string, content: (probe: HTMLElement) => void, read: (probe: HTMLElement) => number): number => {
    if (!attached) {
      doc.body.append(lab)
      attached = true
    }
    const probe = doc.createElement('span')
    probe.style.cssText = `position:absolute;left:0;top:0;white-space:pre;${css}`
    content(probe)
    lab.append(probe)
    const value = read(probe)
    probe.remove()
    return value
  }
  const textWidth = (font: NativeFindFont, text: string): number =>
    measure(fontCss(font), (p) => (p.textContent = text), (p) => p.getBoundingClientRect().width)
  const labOf = (font: NativeFindFont): FontLab => {
    let e = labs.get(font)
    if (!e) {
      e = { space: textWidth(font, ' '.repeat(100)) / 100, zero: textWidth(font, '0'.repeat(100)) / 100, kern: new Map() }
      labs.set(font, e)
    }
    return e
  }
  const baselineOf = (css: string): number =>
    measure(
      `${css};line-height:40px;display:block`,
      (p) => {
        p.append('Hxg')
        const mark = doc.createElement('span')
        mark.style.cssText = 'display:inline-block;width:0;height:0'
        p.append(mark)
      },
      (p) => (p.getBoundingClientRect().height ? (p.lastChild as HTMLElement).getBoundingClientRect().bottom - p.getBoundingClientRect().top - 20 : 0), // 0: a test DOM draws nothing
    )
  const metrics: NativeFindFontMetrics = {
    base,
    width: (font, text) => measureNativeFindText(doc, font, text),
    space: (font) => labOf(font).space,
    zero: (font) => labOf(font).zero,
    kernAfterSpace(font, ch) {
      const e = labOf(font)
      let k = e.kern.get(ch)
      if (k === undefined) {
        k = Math.round((textWidth(font, ' ' + ch) - e.space - textWidth(font, ch)) * 1000) / 1000
        e.kern.set(ch, k)
      }
      return k
    },
    baseline(font) {
      const css = font ? fontCss(font) : indexFont
      let b = baselineCache.get(css)
      if (b === undefined) baselineCache.set(css, (b = baselineOf(css)))
      return b
    },
  }
  metrics.release = () => lab.remove()
  return metrics
}

let nextIndexId = 0

export function createNativeFind(options: NativeFindOptions): NativeFind {
  const { scroller, host, rowCount, rowHeight, onActiveRow } = options
  const per = options.rowsPerChunk ?? DEFAULT_ROWS_PER_CHUNK
  const rowTop = options.rowTop ?? 0
  const quantum = options.tabQuantum ?? DEFAULT_TAB_QUANTUM
  const tabSize = options.columns ? quantum : (options.tabSize ?? 120)
  const indent = options.columns ? 0 : (options.indent ?? 8)
  const doc = host.ownerDocument
  const win = doc.defaultView as Window
  const startedAt = win.performance.now()
  const count = chunkCount(rowCount, per)
  const font = options.columns ? `${baseFontSize}px/${rowHeight}px monospace` : `inherit`
  const baseFont = options.columns ? options.font : undefined
  // the font of the chunks: the font of the visible text, or a monospace font
  const chunkFont = baseFont ? `${fontCss(baseFont)};line-height:${rowHeight}px` : `font:${font}`
  const fonts = baseFont ? createFontMetrics(host, chunkFont, baseFont) : undefined
  const hasPlacedBaselines = options.columns?.some((column) => column.baseline !== undefined || column.lines?.some((line) => line.baseline !== undefined))
  const rowTextBaseline = !fonts && hasPlacedBaselines ? measureLineBaseline(host, font, rowHeight) : 0
  // the width of one character: of the monospace font, or of a space in the font of the text (a tab stop closer than half of it is skipped)
  const charWidth = options.columns ? (options.charWidth ?? (baseFont && fonts ? fonts.space(baseFont) : measureCharWidth(host, font))) : 0

  // The texts of a row that the find bar can match, as the data holds them (tabs and line breaks removed). A multi-line cell gives one text per line.
  const cellsOf = (i: number): string[] =>
    options.columns
      ? options.getRowCells(i).flatMap((cell) =>
          typeof cell === 'string' ? [cleanCell(cell)] : cell.map((line) => cleanCell(typeof line === 'string' ? line : line.text)),
        )
      : cleanLine(options.getRowText(i)).split('\t')
  // The baseline of the row text lies where the visible text has its baseline: the chunks move by the difference.
  const chunkShift = fonts && options.baseline !== undefined ? Math.round((options.baseline - fonts.baseline()) * 100) / 100 : 0
  if (fonts) fonts.rowBaseline = fonts.baseline() + chunkShift
  // The index of a row: the line of text, and the overlays (the pieces that the index draws away from their place in the flow).
  const layoutOf = (i: number): { text: string; overlays: NativeFindOverlay[] } =>
    options.columns
      ? layoutCells(options.getRowCells(i), options.columns, charWidth, quantum, fonts, rowTextBaseline)
      : { text: cleanLine(options.getRowText(i)), overlays: [] }
  let textLength = 0

  // The content of a chunk: one line of text per row, a tab between the cells. A piece that the index draws in the font of its
  // cell or away from its place in the flow is wrapped in an inline span with `position: relative`.
  // The style of the spans that hold a moved piece. Many spans share one class (the offsets are rounded to 0.1 px): an inline style on
  // each span costs a style declaration for each, which made Firefox slow and large with 600000 spans.
  const spanClasses = new Map<string, string>()
  const spanPrefix = `sp-s${nextIndexId++}-`
  let spanSheet: CSSStyleSheet | null = null
  let spanStyle: HTMLStyleElement | null = null
  const round1 = (n: number) => Math.round(n * 10) / 10
  const classOf = (o: NativeFindOverlay): string => {
    const dx = round1(o.dx)
    const dy = round1(o.dy)
    const margin = o.margin ? round1(o.margin) : 0
    const font = o.font ? fontCss(o.font) : ''
    const key = `${dx}|${dy}|${margin}|${font}`
    let name = spanClasses.get(key)
    if (name === undefined) {
      if (!spanSheet) {
        const style = doc.createElement('style')
        style.setAttribute('data-sp-style', '')
        host.append(style)
        spanStyle = style
        spanSheet = style.sheet
      }
      name = `${spanPrefix}${spanClasses.size}`
      spanClasses.set(key, name)
      const rule = `.${name}{position:relative;line-height:0;left:${dx}px;top:${dy}px${margin ? `;margin-right:${margin}px` : ''}${font ? ';' + font : ''}}`
      try {
        spanSheet?.insertRule(rule, spanSheet.cssRules.length)
      } catch {
        // a page that does not allow a style sheet of its own: the span gets no offset (the highlight is then off its place)
      }
    }
    return name
  }
  function fillChunk(d: HTMLElement, first: number, end: number) {
    // The text between two spans is collected in a string and becomes one text node: a text node that grows by `data +=` copies its text each time.
    let buf = ''
    const flush = () => {
      if (buf) d.append(doc.createTextNode(buf))
      buf = ''
    }
    for (let i = first; i < end; i++) {
      if (i > first) buf += '\n'
      const { text: line, overlays } = layoutOf(i)
      textLength += line.length + 1
      let p = 0
      for (const o of overlays) {
        buf += line.slice(p, o.at)
        flush()
        const span = doc.createElement('span')
        span.className = classOf(o)
        span.textContent = line.slice(o.at, o.at + o.length)
        d.append(span)
        p = o.at + o.length
      }
      buf += line.slice(p)
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
      `position:absolute;left:0;top:${rowTop + first * rowHeight + chunkShift}px;margin:0;padding:0 0 0 ${indent}px;white-space:pre;` +
      `tab-size:${tabSize}px;${chunkFont};line-height:${rowHeight}px;pointer-events:none;z-index:${options.zIndex ?? 1};` +
      (options.columns ? 'color:transparent' : 'color:inherit')
    if (options.columns) d.setAttribute('data-sp-layer', 'transparent')
    fillChunk(d, first, end)
    chunks.push(d)
    fragment.append(d)
  }
  host.append(fragment)
  fonts?.release?.()
  const buildMs = win.performance.now() - startedAt

  // Keep every chunk in the page. A browser can change the query before it exposes a selection to the page.
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
      if (!attached) {
        // Keep the chunk order equal to the row order if another system removed one.
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

  function reset() {
    query = ''
    pinned = null
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
      query = text.toLowerCase()
    }
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && query) reset()
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
          if (ls[k] !== layoutOf(row).text.toLowerCase() && corrupt.length < 5) corrupt.push(row)
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
      return 'full' as const
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
      spanStyle?.remove()
    },
  }
}
