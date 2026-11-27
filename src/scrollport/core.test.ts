import { describe, expect, it, vi } from 'vitest'
import { createFind } from '../legacy-consumer.compat.fixture'
import {
  alignCells,
  layoutCells,
  type NativeFindFont,
  type NativeFindFontMetrics,
  chunkCount,
  chunkOfRow,
  chunksOfQuery,
  cleanLine,
  rowAtOffset,
  rowsOfChunk,
  type NativeFindColumn,
  createNativeFind,
} from './core'

describe('chunk maths', () => {
  it('counts chunks, with a short last chunk', () => {
    expect(chunkCount(100_000, 100)).toBe(1000)
    expect(chunkCount(101, 100)).toBe(2)
    expect(chunkCount(0, 100)).toBe(0)
  })

  it('maps a row to its chunk', () => {
    expect(chunkOfRow(0, 100)).toBe(0)
    expect(chunkOfRow(99, 100)).toBe(0)
    expect(chunkOfRow(100, 100)).toBe(1)
    expect(chunkOfRow(99_999, 100)).toBe(999)
  })

  it('gives the rows of a chunk', () => {
    expect(rowsOfChunk(0, 100_000, 100)).toEqual([0, 100])
    expect(rowsOfChunk(999, 100_000, 100)).toEqual([99_900, 100_000])
    expect(rowsOfChunk(2, 250, 100)).toEqual([200, 250])
  })

  it('finds the row of a text offset by counting line breaks', () => {
    const text = 'a\tb\nccc\tdd\neee'
    expect(rowAtOffset(text, 0, 300)).toBe(300)
    expect(rowAtOffset(text, 4, 300)).toBe(301)
    expect(rowAtOffset(text, 12, 300)).toBe(302)
  })

  it('removes line breaks from row text', () => {
    expect(cleanLine('a\r\nb\nc')).toBe('a b c')
  })
})

/** Where each cell of an index line starts, in px, for a monospace font and tab stops of `q` px. */
function cellStarts(line: string, cw: number, q: number): number[] {
  const out: number[] = []
  let pos = 0
  let start = -1
  for (const ch of line) {
    if (ch === '\t') {
      start = -1
      const before = pos
      pos = (Math.floor(pos / q + 1e-6) + 1) * q
      // browsers skip a tab stop that is closer than half a character (checked in Chromium 157 and Firefox 160)
      if (pos - before < cw / 2 - 1e-6) pos += q
    } else {
      if (start < 0) {
        start = pos
        out.push(start)
      }
      pos += cw
    }
  }
  return out
}

/**
 * Where each piece of a laid out line starts in px (the cells, in order), when the pieces with a font are as wide as `width` says
 * and the rest is monospace. A piece that follows another one without a tab is not a cell of its own: use `posAt` for it.
 */
function flowStarts(
  text: string,
  overlays: { at: number; length: number; font?: NativeFindFont; margin?: number }[],
  cw: number,
  q: number,
  width: (font: NativeFindFont, piece: string) => number,
  spaceFont?: NativeFindFont,
  skip?: number,
): number[] {
  const out: number[] = []
  let start = -1
  walk(text, overlays, cw, q, width, spaceFont, (_i, pos, isText) => {
    if (!isText) start = -1
    else if (start < 0) {
      start = pos
      out.push(start)
    }
  }, skip)
  return out
}

/** The flow position in px of the character at `at`. */
function posAt(text: string, overlays: { at: number; length: number; font?: NativeFindFont; margin?: number }[], cw: number, q: number, width: (font: NativeFindFont, piece: string) => number, at: number, spaceFont?: NativeFindFont): number {
  let found = NaN
  walk(text, overlays, cw, q, width, spaceFont, (i, pos) => {
    if (i === at) found = pos
  })
  return found
}

function walk(
  text: string,
  overlays: { at: number; length: number; font?: NativeFindFont; margin?: number }[],
  cw: number,
  q: number,
  width: (font: NativeFindFont, piece: string) => number,
  spaceFont: NativeFindFont | undefined,
  visit: (index: number, pos: number, isText: boolean) => void,
  skip = cw / 2,
) {
  let pos = 0
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\t') {
      visit(i, pos, false)
      const before = pos
      pos = (Math.floor(pos / q + 1e-6) + 1) * q
      if (pos - before < skip - 1e-6) pos += q
      i++
      continue
    }
    const o = overlays.find((x) => x.at === i && x.font)
    visit(i, pos, true)
    if (o && o.font) {
      pos += width(o.font, text.slice(i, i + o.length)) + (o.margin ?? 0)
      i += o.length
    } else {
      pos += ch === ' ' && spaceFont ? width(spaceFont, ' ') : cw
      i++
    }
  }
}

describe('alignCells', () => {
  const cols: NativeFindColumn[] = [
    { start: 8, end: 108 },
    { start: 120, end: 300, align: 'end' },
    { start: 320, end: 400 },
  ]

  it('puts every cell within half a tab stop of its column edge', () => {
    const line = alignCells(['ab', 'cd', 'ef'], cols, 8, 20)
    expect(line.replace(/\t/g, '')).toBe('abcdef')
    const [a, b, c] = cellStarts(line, 8, 20)
    expect(Math.abs(a - 8)).toBeLessThanOrEqual(10)
    expect(Math.abs(b - (300 - 16))).toBeLessThanOrEqual(10) // right aligned: the text ends at the right edge
    expect(Math.abs(c - 320)).toBeLessThanOrEqual(10)
  })

  it('follows the browser rule that a tab stop closer than half a character is skipped', () => {
    // 11 characters of 7 px end at 77 px: the stop at 80 px is 3 px away, less than 3.5 px, so the browser tabs on to 100 px
    const c: NativeFindColumn[] = [{ start: 0, end: 150 }, { start: 160, end: 300 }]
    const line = alignCells(['x'.repeat(11), 'ab'], c, 7, 20)
    expect(line.match(/\t/g)).toHaveLength(4) // 100, 120, 140, 160
    expect(cellStarts(line, 7, 20)).toEqual([0, 160])
  })

  it('keeps at least one tab between cells, also when a text is too long', () => {
    const line = alignCells(['x'.repeat(40), 'cd', 'ef'], cols, 8, 20)
    const parts = line.split(/\t+/)
    expect(parts).toEqual(['x'.repeat(40), 'cd', 'ef'])
    expect(line).toContain('\t')
  })

  it('removes tabs and line breaks inside a cell, so a match cannot span two cells', () => {
    const line = alignCells(['a\tb', 'c\nd'], cols, 8, 20)
    expect(line.split(/\t+/)).toEqual(['a b', 'c d'])
  })

  it('writes an empty cell as tabs only', () => {
    const line = alignCells(['a', '', 'z'], cols, 8, 20)
    expect(line.split(/\t+/)).toEqual(['a', 'z'])
  })
})

describe('layoutCells (multi-line cells)', () => {
  const cols: NativeFindColumn[] = [
    { start: 8, end: 108 },
    { start: 120, end: 300, lines: [{ dx: 30, dy: -7 }, { dx: 30, dy: 9 }] },
    { start: 320, end: 400 },
  ]
  const pieces = (text: string) => text.split(/\t+/)

  it('writes the lines of a multi-line cell into the row text, in the order of the cell', () => {
    const { text } = layoutCells(['ab', ['@ann', 'Ann Lee'], 'ef'], cols, 8, 20)
    expect(pieces(text)).toEqual(['ab', '@ann', 'Ann Lee', 'ef'])
  })

  it('returns an overlay for each line that must lie away from its place in the flow', () => {
    const { text, overlays } = layoutCells(['ab', ['@ann', 'Ann Lee'], 'ef'], cols, 8, 20)
    expect(overlays).toHaveLength(2)
    expect(overlays.map((o) => text.slice(o.at, o.at + o.length))).toEqual(['@ann', 'Ann Lee'])
    expect(overlays.map((o) => o.dy)).toEqual([-7, 9])
  })

  it('places a supplied baseline relative to the measured row-text baseline', () => {
    const c: NativeFindColumn[] = [{ start: 8, end: 108, lines: [{ baseline: 12 }] }]
    const { text, overlays } = layoutCells([['name']], c, 8, 20, undefined, 5)
    expect(overlays.map((overlay) => [text.slice(overlay.at, overlay.at + overlay.length), overlay.dy])).toEqual([['name', 7]])
  })

  it('moves a line to the exact left edge of its visible text', () => {
    // the first line wants x 150 (column start 120 + dx 30): the flow puts it at a tab stop, the overlay moves it the rest
    const { text, overlays } = layoutCells(['ab', ['@ann', 'Ann Lee'], 'ef'], cols, 8, 20)
    const starts = cellStarts(text, 8, 20)
    expect(starts[1] + overlays[0].dx).toBeCloseTo(150, 1)
    expect(starts[2] + overlays[1].dx).toBeCloseTo(150, 1) // the second line comes after the first in the flow and is moved back
  })

  it('does not change where the next cell starts compared with the lines in the flow', () => {
    const { text } = layoutCells(['ab', ['one', 'two'], 'ef'], cols, 8, 20)
    const starts = cellStarts(text, 8, 20)
    expect(Math.abs(starts[3] - 320)).toBeLessThanOrEqual(10)
  })

  it('right aligns a line at the end of the cell', () => {
    const c: NativeFindColumn[] = [{ start: 100, end: 300, align: 'end', lines: [{ dy: -5 }, { dy: 5 }] }]
    const { text, overlays } = layoutCells([['ab', 'abcd']], c, 8, 20)
    const starts = cellStarts(text, 8, 20)
    expect(starts[0] + (overlays[0]?.dx ?? 0)).toBeCloseTo(300 - 16, 1)
    expect(starts[1] + (overlays[1]?.dx ?? 0)).toBeCloseTo(300 - 32, 1)
  })

  it('lets a line give its own place, for a text that does not start at the start of the cell', () => {
    const c: NativeFindColumn[] = [{ start: 100, end: 300, lines: [{ dx: 10, dy: -4 }] }]
    const { text, overlays } = layoutCells([[{ text: 'a', dx: 18 }, { text: 'b', dy: 6 }, 'c']], c, 8, 20)
    const starts = cellStarts(text, 8, 20)
    expect(overlays.map((o) => [text.slice(o.at, o.at + o.length), o.dy])).toEqual([
      ['a', -4], // own dx, dy of the column line 0
      ['b', 6], // own dy, no dx
      ['c', 0], // no geometry: the start of the column, moved back from its place after 'b'
    ])
    expect(starts[0] + overlays[0].dx).toBeCloseTo(118, 1)
    expect(starts[1] + overlays[1].dx).toBeCloseTo(100, 1)
    expect(starts[2] + overlays[2].dx).toBeCloseTo(100, 1)
  })

  // Fake font metrics: a character of font size `size` is `size / 2` px wide, the baseline lies 0.3 of the size under the centre.
  const f12: NativeFindFont = { family: 'x', size: 12 }
  const metrics: NativeFindFontMetrics = {
    base: f12,
    width: (font, text) => text.length * font.size * 0.5,
    baseline: (font) => (font ? font.size * 0.3 : 3.6),
    space: (font) => font.size / 2,
    zero: (font) => font.size * 0.6,
    kernAfterSpace: () => 0,
  }
  const f16: NativeFindFont = { family: 'x', size: 16 }
  const f10: NativeFindFont = { family: 'x', size: 10 }

  it('gives the font of the visible text to each piece, so the highlight has the real width', () => {
    const c: NativeFindColumn[] = [{ start: 0, end: 300, lines: [{ font: f16, dy: -7 }, { font: f10, dy: 9 }] }]
    const { overlays } = layoutCells([['abcd', 'efgh']], c, 8, 20, metrics)
    expect(overlays.map((o) => o.font)).toEqual([f16, f10])
  })

  it('moves a piece so that its baseline lies on the baseline of the visible line', () => {
    // font 16: the baseline is 4.8 under the line centre, the row text baseline is 3.6: the piece moves 1.2 down (and dy)
    const c: NativeFindColumn[] = [{ start: 0, end: 300, lines: [{ font: f16, dy: -7 }, { font: f10, dy: 9 }] }]
    const { overlays } = layoutCells([['abcd', 'efgh']], c, 8, 20, metrics)
    expect(overlays.map((o) => o.dy)).toEqual([-5.8, 8.4]) // -7 + 4.8 - 3.6, 9 + 3 - 3.6
  })

  it('takes the font of the column for a plain cell and keeps its place at the start of the column', () => {
    const c: NativeFindColumn[] = [{ start: 100, end: 300, font: f16 }]
    const { text, overlays } = layoutCells(['hello'], c, 8, 20, metrics)
    const starts = flowStarts(text, overlays, 8, 20, metrics.width)
    expect(overlays).toHaveLength(1)
    expect(overlays[0].font).toBe(f16)
    expect(starts[0] + overlays[0].dx).toBeCloseTo(100, 1)
  })

  it('right aligns a text by its measured width, not by the index width', () => {
    const c: NativeFindColumn[] = [{ start: 100, end: 300, align: 'end', font: f10 }]
    const { text, overlays } = layoutCells(['12345'], c, 8, 20, metrics)
    const starts = flowStarts(text, overlays, 8, 20, metrics.width)
    expect(starts[0] + overlays[0].dx).toBeCloseTo(300 - 25, 1) // 5 characters of 5 px
  })

  it('puts a line after the line before it with a gap, by the measured width', () => {
    const c: NativeFindColumn[] = [{ start: 100, end: 400 }]
    const { text, overlays } = layoutCells([[{ text: 'abcd', dx: 10, font: f16 }, { text: 'xy', gap: 8, font: f10 }]], c, 8, 20, metrics)
    const at = (k: number) => posAt(text, overlays, 8, 20, metrics.width, overlays[k].at)
    expect(at(0) + overlays[0].dx).toBeCloseTo(110, 1)
    expect(at(1) + overlays[1].dx).toBeCloseTo(110 + 32 + 8, 1) // 4 characters of 8 px, then the gap
    expect(text.slice(text.indexOf('abcd'))).toBe('abcdxy') // no tab between the two lines: a match can run over both
  })

  it('keeps the next cell on its tab stop when the real width differs a little from the measured width, in both browsers', () => {
    const c: NativeFindColumn[] = [{ start: 0, end: 200, font: f16 }, { start: 200, end: 400, font: f16 }]
    const q = 10
    // Chromium skips a stop closer than half a space (3 px here), Firefox a stop closer than half of 1ch (3.6 px here)
    for (const skip of [3, 3.6]) {
      for (const word of ['abcdefg', 'abcdefgh', 'abcdefghi', 'abc', 'abcd', 'abcde']) {
        const laid = layoutCells([word, 'z'], c, 6, q, metrics)
        const second = (delta: number) =>
          flowStarts(laid.text, laid.overlays, 6, q, (f, t) => metrics.width(f, t) + delta, f12, skip)[1]
        for (const delta of [-0.5, 0, 0.5]) expect(second(delta)).toBe(second(0))
        expect(second(0)).toBeGreaterThanOrEqual(200 - 1)
      }
    }
  })

  it('puts a piece in the font of the row text within 1 px of the left edge of the visible text, with tabs and spaces', () => {
    const c: NativeFindColumn[] = [{ start: 103, end: 300, font: f12 }]
    const laid = layoutCells(['hello'], c, 6, 10, metrics)
    expect(laid.overlays).toEqual([]) // no span: the text lies in the row text
    const start = posAt(laid.text, laid.overlays, 6, 10, metrics.width, laid.text.indexOf('hello'), f12)
    expect(Math.abs(start - 103)).toBeLessThanOrEqual(1)
    expect(laid.text).toMatch(/^\t+ *hello$/)
  })

  it('keeps a piece in the row text, with spaces after it, when its end lies near the edge of the skip rule', () => {
    const c: NativeFindColumn[] = [{ start: 103, end: 300, font: f12 }, { start: 320, end: 400, font: f12 }]
    for (let n = 1; n <= 24; n++) {
      const word = 'x'.repeat(n)
      const laid = layoutCells([word, 'z'], c, 6, 10, metrics)
      expect(laid.overlays).toEqual([]) // no span for any width
      expect(laid.text).toMatch(/^\t+ *x+ {0,2}\t+ *z {0,2}$/)
    }
  })

  it('writes a plain string in a multi-line column as a normal cell', () => {
    const { text, overlays } = layoutCells(['ab', 'Department Summary', 'ef'], cols, 8, 20)
    expect(overlays).toEqual([])
    expect(pieces(text)).toEqual(['ab', 'Department Summary', 'ef'])
  })

  it('removes tabs and line breaks inside a line', () => {
    const { text } = layoutCells([['a\tb', 'c\nd', 'third']], [{ start: 10, end: 100, lines: [{ dy: -3 }] }], 8, 20)
    expect(pieces(text).filter(Boolean)).toEqual(['a b', 'c d', 'third'])
  })
})

describe('chunksOfQuery', () => {
  const lines = Array.from({ length: 300 }, (_, i) => `row${i}\t${i === 5 || i === 250 ? 'needle' : 'plain'}`)

  it('returns the chunks that hold the query', () => {
    expect(chunksOfQuery(lines, 'needle', 100, 100)).toEqual(new Set([0, 2]))
  })

  it('returns null for an empty query or a query with a space', () => {
    expect(chunksOfQuery(lines, '', 100, 100)).toBeNull()
    expect(chunksOfQuery(lines, 'a b', 100, 100)).toBeNull()
  })

  it('returns null when the query touches too many chunks', () => {
    expect(chunksOfQuery(lines, 'row', 100, 2)).toBeNull()
    expect(chunksOfQuery(lines, 'row', 100, 3)?.size).toBe(3)
  })
})



describe('createNativeFind real DOM inspection', () => {
  it('keeps createNativeFind passive when source data has no displayed rows', () => {
    const scroller = document.createElement('div')
    const host = document.createElement('div')
    scroller.append(host)
    const find = createFind(scroller, host)
    expect(find.audit('needle')).toMatchObject({ expected: 1, expectedOccurrences: 1, findable: 0, total: 0, missing: [0] })
    expect(host.querySelectorAll('[data-row], .sp-cell')).toHaveLength(0)
    find.destroy()
  })

  it('observes the caller-rendered getRowCells and columns shape without adding duplicate text', () => {
    const scroller = document.createElement('div')
    const host = document.createElement('div')
    scroller.append(host)
    const find = createNativeFind({
      scroller,
      host,
      rowCount: 1,
      rowHeight: 32,
      columns: [{ start: 0, end: 100 }],
      getRowCells: () => ['needle'],
    })

    expect(host.textContent).toBe('')
    expect(find.audit('needle')).toMatchObject({ expectedOccurrences: 1, findable: 0, total: 0 })
    host.innerHTML = '<div data-row="0"><a>needle</a></div>'
    expect(host.textContent).toBe('needle')
    expect(find.audit('needle')).toMatchObject({ expectedOccurrences: 1, findable: 1, total: 1, corrupt: [] })
    find.destroy()
  })

  it('inspects ordinary data rows and preserves inline text while separating explicit lines', () => {
    const scroller = document.createElement('div')
    const host = document.createElement('div')
    scroller.append(host)
    host.innerHTML = '<section data-row="0"><span><strong>new</strong><em> york</em></span><span><strong>needle</strong><br>tail</span></section>'
    const find = createNativeFind({
      scroller, host, rowCount: 1, rowHeight: 32,
      getRichRowCells: () => ['new york', ['needle', 'tail']],
      columns: [{ start: 0, end: 100 }, { start: 100, end: 200 }],
    })

    expect(find.audit('new york')).toMatchObject({ expected: 1, expectedOccurrences: 1, findable: 1, total: 1, corrupt: [] })
    expect(find.audit('needle')).toMatchObject({ expected: 1, expectedOccurrences: 1, findable: 1, total: 1, corrupt: [] })
    expect(find.audit('needletail')).toMatchObject({ expected: 0, expectedOccurrences: 0, findable: 0, total: 0, corrupt: [] })
    find.destroy()
  })

  it('reports the selected real row without capturing browser Find query state', () => {
    const scroller = document.createElement('div')
    const host = document.createElement('div')
    scroller.append(host)
    document.body.append(scroller)
    host.innerHTML = '<div data-row="0"><span>Needle text</span></div>'
    const activeRow = vi.fn()
    const find = createNativeFind({ scroller, host, rowCount: 1, rowHeight: 32, getRowText: () => 'Needle text', onActiveRow: activeRow })
    const text = host.querySelector('span')!.firstChild!
    const selection = document.getSelection()!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 6)
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    expect(activeRow).toHaveBeenLastCalledWith(0)
    find.destroy()
    scroller.remove()
  })

  it('counts visible host and document text, but skips hidden and inert siblings', () => {
    const scroller = document.createElement('div')
    const host = document.createElement('div')
    scroller.append(host)
    document.body.append(scroller)
    host.innerHTML = '<div data-row="0"><span class="sp-cell">needle</span></div><footer>needle</footer>'
    const outside = document.createElement('div')
    outside.innerHTML = '<b>needle</b><span hidden>needle</span><span inert>needle</span><span aria-hidden="true">needle</span>'
    document.body.append(outside)
    const find = createNativeFind({ scroller, host, rowCount: 1, rowHeight: 24, getRowText: () => 'needle' })
    expect(find.audit('needle')).toMatchObject({ expected: 1, expectedOccurrences: 1, findable: 1, total: 4, other: expect.arrayContaining([expect.stringContaining('footer'), expect.stringContaining('b')]) })
    find.destroy()
    outside.remove()
    scroller.remove()
  })

  it('counts plain row text without child elements', () => {
    const scroller = document.createElement('div')
    const host = document.createElement('div')
    scroller.append(host)
    host.innerHTML = '<div data-row="0">needle</div>'
    const find = createNativeFind({ scroller, host, rowCount: 1, rowHeight: 24, getRowText: () => 'needle' })
    expect(find.audit('needle')).toMatchObject({ expected: 1, findable: 1, total: 1, corrupt: [] })
    find.destroy()
  })

  it('counts hidden until-found text as browser-searchable', () => {
    const scroller = document.createElement('div')
    const host = document.createElement('div')
    scroller.append(host)
    document.body.append(scroller)
    host.innerHTML = '<div data-row="0"><span class="sp-cell">needle</span></div>'
    const untilFound = document.createElement('div')
    untilFound.setAttribute('hidden', 'until-found')
    untilFound.textContent = 'needle'
    document.body.append(untilFound)
    const find = createNativeFind({ scroller, host, rowCount: 1, rowHeight: 24, getRowText: () => 'needle' })
    expect(find.audit('needle').total).toBe(2)
    find.destroy()
    untilFound.remove()
    scroller.remove()
  })

  it('reports zero rendered chunks for an empty observer host', () => {
    const scroller = document.createElement('div')
    const host = document.createElement('div')
    scroller.append(host)
    const find = createNativeFind({ scroller, host, rowCount: 2, rowHeight: 24, getRowText: (row) => `row${row}` })
    expect(find.chunkCount).toBe(0)
    expect(find.attachedChunks).toBe(0)
    find.destroy()
  })

})
