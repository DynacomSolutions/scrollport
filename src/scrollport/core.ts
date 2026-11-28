/**
 * Pure layout helpers and inspection of real, displayed cell text.
 * The observer does not create index nodes or change browser Find behaviour.
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
  /** Font settings for pure layout helpers. The native observer does not draw text. */
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
 * Font settings for pure layout helpers. The native observer does not apply font metrics.
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
 * A placement result from the pure legacy layout helper. The observer does not apply this result to the DOM.
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
 * `getRowText` and `getRowCells` describe expected row text for an audit. They do not render or index text.
 */
/** The original string-only source contract. Keep this union discriminated. */
export type NativeFindSource =
  | {
      /** Expected text of one row. Separate cells with a tab. The observer reads the displayed DOM. */
      getRowText: (row: number) => string
      getRowCells?: never
      getRichRowCells?: never
      columns?: never
    }
  | {
      /** Expected text for plain-text cells of one row. */
      getRowCells: (row: number) => readonly string[]
      /** Position of each column for legacy callers. */
      columns: readonly NativeFindColumn[]
      getRichRowCells?: never
      getRowText?: never
    }

/** Rich text expectations use a separate source type so string callers keep their original narrowing. */
export type NativeFindRichSource = {
  /** Expected text for rich cells, including explicit line boundaries. */
  getRichRowCells: (row: number) => readonly NativeFindCell[]
  columns?: readonly NativeFindColumn[]
  getRowCells?: never
  getRowText?: never
}

export type NativeFindBase = {
  scroller: HTMLElement
  host: HTMLElement
  rowCount: number
  rowHeight: number
  /** Kept for source compatibility. Real-text mode does not position an overlay. */
  rowTop?: number
  /** Kept for source compatibility. Real-text mode uses the rendered cell font and baseline. */
  charWidth?: number
  font?: NativeFindFont
  baseline?: number
  /** Kept for source compatibility. Real-text mode does not create tab stops. */
  tabQuantum?: number
  zIndex?: number
  rowsPerChunk?: number
  sparseMaxChunks?: number
  tabSize?: number
  indent?: number
  onActiveRow?: (row: number) => void
}

/** Public string-only options retain the published discriminated source contract. */
export type NativeFindOptions = NativeFindBase & NativeFindSource

/** Rich implementation options use actual rendered cell text for audit expectations. */
export type NativeFindRichOptions = NativeFindBase & NativeFindRichSource

/** Options accepted by the real-DOM observer implementation. */
export type NativeFindImplementationOptions = NativeFindOptions | NativeFindRichOptions

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

/** Inspection of displayed text. Browser Find owns matching, query state, paint, and navigation. */
export type NativeFind = {
  readonly mode: NativeFindMode
  /**
   * @deprecated Browser Find keeps its own query and the page cannot read it. This value is always an empty string.
   * It stays so that code written for the earlier index still compiles.
   */
  readonly query: string
  /** Number of rendered row groups, or of rendered rows when the host has no groups. Read when asked. */
  readonly chunkCount: number
  /** Characters of displayed cell text in the host. Counted when this value is read, not at mount. */
  readonly textLength: number
  /** Time in ms that the observer took to attach. */
  readonly buildMs: number
  readonly attachedChunks: number
  /**
   * @deprecated The observer holds no query or sparse state, so there is nothing to reset. This function does nothing.
   * It stays so that code written for the earlier index still compiles.
   */
  reset: () => void
  /** Compare source data with real cell text in the host. */
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

/** Replace line breaks with spaces. */
export const cleanLine = (text: string): string => text.replace(/[\r\n]+/g, ' ')

/** Replace tabs and line breaks inside one cell with spaces. */
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

/**
 * Pure text layout for callers that need to calculate tab-separated cell positions. The observer does not use this output.
 * A tab moves to the next multiple of `quantum`. This helper creates text only and does not create browser Find content.
 *
 * Without `fonts` the index font is monospace, so the width of a text is `text.length * charWidth`, and a cell lies at most half a
 * quantum from its true place, unless the text of the cell before it is too long.
 *
 * With `fonts` the helper calculates row positions in the font of the visible text (`fonts.base`). A piece in that font lies in the row
 * text. A few spaces after the tabs bring its left edge to within 1 px of the visible text, and the tab after it is chosen so that a
 * small error of the measured width cannot move the next cell. A piece in another font, or on another line of its cell, gets an
 * overlay: the pure layout helper returns its position. The observer does not create a positioned span. The flow does not
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


function countOccurrences(text: string, query: string): number {
  if (!query) return 0
  let total = 0
  let from = 0
  while ((from = text.indexOf(query, from)) !== -1) {
    total++
    from += query.length
  }
  return total
}

function rowCells(row: HTMLElement): HTMLElement[] {
  const marked = [...row.querySelectorAll<HTMLElement>('.sp-cell, .td')]
    .filter((cell) => cell.closest('[data-row]') === row && !cell.closest('[inert]'))
  if (marked.length) return marked
  const children = [...row.children].filter((child): child is HTMLElement =>
    child instanceof HTMLElement && !child.matches('[inert], [hidden]:not([hidden="until-found"])') &&
    !child.closest('[inert], [hidden]:not([hidden="until-found"])'))
  return children.length ? children : row.textContent ? [row] : []
}

function actualRows(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('[data-row]')]
    .filter((row) => !row.matches('.sp-cell, .td') && !row.closest('[inert], [hidden]:not([hidden="until-found"])'))
}

function actualCells(host: HTMLElement): HTMLElement[] {
  const rows = actualRows(host)
  if (rows.length) return rows.flatMap(rowCells)
  return [...host.querySelectorAll<HTMLElement>('.sp-cell, .td')]
    .filter((cell) => !cell.closest('[inert], [hidden]:not([hidden="until-found"])'))
}

function visibleCellLines(cell: HTMLElement): string[] {
  const lines = ['']
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      lines[lines.length - 1] += node.textContent ?? ''
      return
    }
    if (!(node instanceof Element)) return
    if (node !== cell && (node.hasAttribute('inert') ||
      (node.hasAttribute('hidden') && node.getAttribute('hidden') !== 'until-found'))) return
    if (node.matches('br')) {
      lines.push('')
      return
    }
    const block = node !== cell && /^(ADDRESS|ARTICLE|BLOCKQUOTE|DIV|LI|P|PRE|SECTION)$/.test(node.tagName)
    if (block && lines[lines.length - 1]) lines.push('')
    for (const child of node.childNodes) visit(child)
    if (block && lines[lines.length - 1]) lines.push('')
  }
  visit(cell)
  return lines.map((line) => cleanCell(line)).filter((line, index) => line || index < lines.length - 1)
}

function expectedCellLines(cell: NativeFindCell): string[] {
  if (typeof cell === 'string') return [cleanCell(cell)]
  const out: string[] = []
  for (const item of cell) {
    const text = cleanCell(typeof item === 'string' ? item : item.text)
    const join = typeof item !== 'string' && item.gap !== undefined
    if (join && out.length) out[out.length - 1] += text
    else out.push(text)
  }
  return out
}

function lineOccurrences(lines: readonly string[], query: string): number {
  return lines.reduce((sum, line) => sum + countOccurrences(line.toLocaleLowerCase(), query), 0)
}

function renderedChunkCount(host: HTMLElement): number {
  const groups = host.querySelectorAll('.sp-row-group').length
  if (groups) return groups
  return actualRows(host).length
}

function actualRow(cell: HTMLElement): number | null {
  const row = cell.matches('[data-row]') ? cell : cell.closest<HTMLElement>('[data-row]')
  if (!row) return null
  const value = Number(row.dataset.row)
  return Number.isInteger(value) && value >= 0 ? value : null
}

/** True in development builds. Production builds stay silent. */
function isDevelopment(): boolean {
  const meta = (import.meta as unknown as { env?: { DEV?: boolean } }).env
  if (meta?.DEV !== undefined) return meta.DEV
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV
  return nodeEnv !== undefined && nodeEnv !== 'production'
}

const warnedHosts = new WeakSet<HTMLElement>()

/** Number of different source rows that have displayed text in the host. */
export function renderedRowCount(host: HTMLElement): number {
  const rows = new Set<string>()
  for (const element of host.querySelectorAll<HTMLElement>('[data-row]')) {
    if (element.closest('[inert], [hidden]:not([hidden="until-found"])')) continue
    if (element.dataset.row !== undefined) rows.add(element.dataset.row)
  }
  return rows.size
}

/** Inspect caller-rendered text. The host must own the displayed cells. */
export function createNativeFind(options: NativeFindImplementationOptions): NativeFind {
  const { host, rowCount, onActiveRow } = options
  const doc = host.ownerDocument
  const now = () => doc.defaultView?.performance.now() ?? 0
  const started = now()
  const expectedCells = (row: number): string[] => {
    if ('getRichRowCells' in options && options.getRichRowCells) {
      return options.getRichRowCells(row).map((cell) => cleanCell(plainCellText(cell)))
    }
    if ('getRowCells' in options && options.getRowCells) {
      return options.getRowCells(row).map(cleanCell)
    }
    const value = 'getRowText' in options && options.getRowText ? cleanLine(options.getRowText(row)) : ''
    return value.split('\t').map(cleanCell)
  }
  const buildMs = now() - started
  if (isDevelopment() && rowCount > 0 && !warnedHosts.has(host)) {
    const rendered = renderedRowCount(host)
    if (rendered < rowCount) {
      warnedHosts.add(host)
      console.warn(
        `scrollport: rowCount is ${rowCount}, but the host shows ${rendered} rows. Browser Find can reach only displayed rows. ` +
          'Render every row (NativeFindGrid does this), or accept that Find covers the rendered rows only.',
      )
    }
  }

  const onSelectionChange = () => {
    const selection = doc.getSelection()
    const node = selection?.anchorNode
    const selectedText = selection?.toString() ?? ''
    if (!selection || !node || !selectedText) return
    const element = node instanceof Element ? node : node.parentElement
    const cell = element?.closest<HTMLElement>('.sp-cell, .td, [data-row]')
    if (!cell || !host.contains(cell)) return
    const row = actualRow(cell)
    if (row !== null && row < rowCount) onActiveRow?.(row)
  }
  doc.addEventListener('selectionchange', onSelectionChange)
  let destroyed = false

  const sourceLines = (row: number): string[][] =>
    'getRichRowCells' in options && options.getRichRowCells
      ? options.getRichRowCells(row).map(expectedCellLines)
      : 'getRowCells' in options && options.getRowCells
        ? options.getRowCells(row).map((text) => [text])
        : expectedCells(row).map((text) => [text])

  const audit = (query: string): NativeFindAudit => {
    const needle = query.toLocaleLowerCase()
    const actualByRow = new Map<number, number>()
    const actualCellsByRow = new Map<number, string[]>()
    const countedCells = actualCells(host)
    const countedCellSet = new Set(countedCells)
    let total = 0
    for (const cell of countedCells) {
      const row = actualRow(cell)
      const lines = visibleCellLines(cell)
      const text = lines.join('\n').toLocaleLowerCase()
      const matches = lineOccurrences(lines, needle)
      total += matches
      if (row === null || row >= rowCount) continue
      if (matches) actualByRow.set(row, (actualByRow.get(row) ?? 0) + matches)
      const entries = actualCellsByRow.get(row) ?? []
      entries.push(text)
      actualCellsByRow.set(row, entries)
    }
    // One pass over the source rows: the accessor runs once for each row.
    const expectedByRow = new Map<number, number>()
    let expectedOccurrences = 0
    const corrupt: number[] = []
    for (let row = 0; row < rowCount; row++) {
      const cells = sourceLines(row)
      const matches = cells.reduce((sum, lines) => sum + lineOccurrences(lines, needle), 0)
      if (matches) {
        expectedByRow.set(row, matches)
        expectedOccurrences += matches
      }
      const actual = actualCellsByRow.get(row) ?? []
      if (cells.length !== actual.length || cells.some((lines, index) => lines.join('\n').toLocaleLowerCase() !== actual[index])) {
        corrupt.push(row)
      }
    }
    const other: string[] = []
    if (needle) {
      const walker = doc.createTreeWalker(doc.body, (doc.defaultView?.NodeFilter ?? NodeFilter).SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node as Text
        const parent = text.parentElement
        if (!parent || parent.closest('script,style,template,[inert]')) continue
        if (parent.closest('[hidden]:not([hidden="until-found"])')) continue
        let belongsToHostCell = false
        for (let ancestor: Element | null = parent; ancestor && host.contains(ancestor); ancestor = ancestor.parentElement) {
          if (countedCellSet.has(ancestor as HTMLElement)) {
            belongsToHostCell = true
            break
          }
        }
        if (belongsToHostCell) continue
        const occurrences = countOccurrences(text.data.toLocaleLowerCase(), needle)
        if (!occurrences) continue
        total += occurrences
        other.push(`${parent.id || parent.tagName.toLowerCase()} ${JSON.stringify(text.data.slice(0, 20))}`)
      }
    }
    return {
      expected: expectedByRow.size,
      expectedOccurrences,
      findable: actualByRow.size,
      total,
      missing: [...expectedByRow.keys()].filter((row) => !actualByRow.has(row)),
      duplicates: [...actualByRow].filter(([row, count]) => count > (expectedByRow.get(row) ?? 0)).map(([row]) => row),
      extra: [...actualByRow.keys()].filter((row) => !expectedByRow.has(row)),
      other,
      corrupt: corrupt.slice(0, 5),
    }
  }

  return {
    mode: 'full',
    query: '',
    get chunkCount() {
      return renderedChunkCount(host)
    },
    get textLength() {
      return actualCells(host).reduce((sum, cell) => sum + visibleCellLines(cell).join('\n').length, 0)
    },
    buildMs,
    get attachedChunks() {
      return renderedChunkCount(host)
    },
    reset() {},
    audit,
    destroy() {
      if (destroyed) return
      destroyed = true
      doc.removeEventListener('selectionchange', onSelectionChange)
    },
  }
}
