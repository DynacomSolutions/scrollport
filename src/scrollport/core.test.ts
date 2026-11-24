import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  alignCells,
  layoutCells,
  chunkCount,
  chunkOfRow,
  chunksOfQuery,
  cleanLine,
  createNativeFind,
  rowAtOffset,
  rowsOfChunk,
  type NativeFind,
  type NativeFindBase,
  type NativeFindColumn,
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

  it('gives a font size that makes a line as wide as the visible text', () => {
    // the index font is 12 px with a character width of 8 px here: a visible text of 6 px per character needs 9 px
    const c: NativeFindColumn[] = [{ start: 0, end: 200, lines: [{ charWidth: 6 }, {}] }]
    const { overlays } = layoutCells([['abcd', 'efgh']], c, 8, 20)
    expect(overlays[0].fontSize).toBe(9)
    expect(overlays.some((o) => o.fontSize === undefined && o.dy === 0 && Math.abs(o.dx) < 1e-6)).toBe(false)
  })

  it('uses the width of the visible text, not of the index, for a font size line in the flow', () => {
    const c: NativeFindColumn[] = [{ start: 0, end: 200, lines: [{ charWidth: 6 }] }]
    const { text, overlays } = layoutCells([['abcd'], 'x'], c, 8, 20)
    expect(text).toBe('\tabcd\tx'.replace('\tabcd', 'abcd'))
    expect(overlays[0].length).toBe(4)
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

describe('createNativeFind', () => {
  const ROWS = 1000
  const RH = 20
  const PER = 100
  const text = (i: number) => (i === 450 || i === 451 ? `row ${i}\tneedle` : `row ${i}\tplain`)
  let scroller: HTMLDivElement
  let host: HTMLDivElement
  let find: NativeFind
  let top = 0
  const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))
  const chunk = (k: number) => host.querySelector<HTMLElement>(`[data-sp-chunk="${k}"]`)
  const scrollTo = async (y: number) => {
    top = y
    scroller.dispatchEvent(new Event('scroll'))
    await frame()
    await frame()
  }
  const select = (k: number, needle: string) => {
    const node = chunk(k)!.firstChild as Text
    const at = node.data.indexOf(needle)
    document.getSelection()!.setBaseAndExtent(node, at, node, at + needle.length)
    document.dispatchEvent(new Event('selectionchange'))
  }

  beforeEach(() => {
    scroller = document.createElement('div')
    host = document.createElement('div')
    scroller.append(host)
    document.body.append(scroller)
    top = 0
    Object.defineProperty(scroller, 'scrollTop', { get: () => top })
    Object.defineProperty(scroller, 'clientHeight', { get: () => 100 })
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  })

  afterEach(() => {
    find?.destroy()
    scroller.remove()
    vi.restoreAllMocks()
  })

  const make = (extra: Partial<NativeFindBase> = {}) =>
    (find = createNativeFind({ scroller, host, rowCount: ROWS, rowHeight: RH, getRowText: text, rowsPerChunk: PER, ...extra }))

  it('puts the text of all rows in the DOM, one line per row', () => {
    make()
    expect(find.chunkCount).toBe(10)
    expect(find.attachedChunks).toBe(10)
    const c = chunk(4)!
    expect(c.firstChild?.nodeType).toBe(3)
    const lines = (c.firstChild as Text).data.split('\n')
    expect(lines).toHaveLength(100)
    expect(lines[0]).toBe('row 400\tplain')
    expect(lines[50]).toBe('row 450\tneedle')
  })

  it('shows only the chunks near the viewport and hides the others until found', async () => {
    make()
    expect(chunk(0)!.hasAttribute('hidden')).toBe(false)
    expect(chunk(1)!.getAttribute('hidden')).toBe('until-found')
    await scrollTo(5 * PER * RH)
    expect(chunk(5)!.hasAttribute('hidden')).toBe(false)
    expect(chunk(0)!.getAttribute('hidden')).toBe('until-found')
  })

  it('keeps the chunk of a find hit until the next hit on another chunk', async () => {
    make()
    const reveal = async (k: number) => {
      chunk(k)!.removeAttribute('hidden') // the browser shows the chunk before it fires beforematch
      chunk(k)!.dispatchEvent(new Event('beforematch', { bubbles: true }))
      await frame()
      await frame()
    }
    await reveal(7)
    await scrollTo(0)
    expect(chunk(7)!.hasAttribute('hidden')).toBe(false)
    await reveal(3)
    await scrollTo(0)
    expect(chunk(3)!.hasAttribute('hidden')).toBe(false)
    expect(chunk(7)!.getAttribute('hidden')).toBe('until-found')
  })

  describe('sparse mode', () => {
    it('switches when the browser gives a query that touches few chunks, and reports the row', () => {
      const onActiveRow = vi.fn()
      make({ onActiveRow })
      select(4, 'needle')
      expect(find.mode).toBe('sparse')
      expect(find.query).toBe('needle')
      expect(onActiveRow).toHaveBeenCalledWith(450)
      expect(find.attachedChunks).toBe(2) // the chunk with the match and the chunk in view
      expect(chunk(1)).toBeNull()
      expect(chunk(4)).not.toBeNull()
    })

    it('does not switch while the page has focus (the user types in the page)', () => {
      vi.spyOn(document, 'hasFocus').mockReturnValue(true)
      make()
      select(4, 'needle')
      expect(find.mode).toBe('full')
      expect(find.query).toBe('')
      expect(find.attachedChunks).toBe(10)
    })

    it('stays in full mode when the query touches more chunks than the limit', () => {
      make({ sparseMaxChunks: 3 })
      select(4, 'row 4')
      expect(find.mode).toBe('full')
      expect(find.attachedChunks).toBe(10)
    })

    it('stays in full mode for a query with a space', () => {
      make()
      select(4, 'row 450')
      expect(find.mode).toBe('full')
    })

    it('keeps the order of the chunks when they come back', () => {
      make()
      select(4, 'needle')
      find.reset()
      const order = [...host.querySelectorAll('[data-sp-chunk]')].map((e) => e.getAttribute('data-sp-chunk'))
      expect(order).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    })
  })

  describe('reset', () => {
    it('returns to full mode with reset()', () => {
      make()
      select(4, 'needle')
      find.reset()
      expect(find.mode).toBe('full')
      expect(find.query).toBe('')
      expect(find.attachedChunks).toBe(10)
    })

    it('returns to full mode on Escape', () => {
      make()
      select(4, 'needle')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(find.mode).toBe('full')
      expect(find.attachedChunks).toBe(10)
    })
  })

  describe('audit', () => {
    it('finds every row that has the query, once', () => {
      make()
      const a = find.audit('needle')
      expect(a).toMatchObject({ expected: 2, findable: 2, total: 2, missing: [], duplicates: [], extra: [], other: [], corrupt: [] })
    })

    it('counts the rows that native find can reach in sparse mode too', () => {
      make()
      select(4, 'needle')
      expect(find.audit('needle').findable).toBe(2)
    })

    it('does not count inert text, which the find bar skips, but counts other text of the page', () => {
      make()
      host.insertAdjacentHTML('beforeend', '<span inert>needle</span><span id="plain">needle</span>')
      const a = find.audit('needle')
      expect(a.other).toHaveLength(1)
      expect(a.other[0]).toContain('plain')
    })

    it('reports a chunk that no longer matches the data', () => {
      make()
      ;(chunk(4)!.firstChild as Text).data = 'changed'
      const a = find.audit('needle')
      expect(a.missing).toEqual([450, 451])
      expect(a.corrupt.length).toBeGreaterThan(0)
    })
  })

  it('removes its chunks and listeners on destroy', () => {
    make()
    const docOff = vi.spyOn(document, 'removeEventListener')
    const winOff = vi.spyOn(window, 'removeEventListener')
    const hostOff = vi.spyOn(host, 'removeEventListener')
    const scrollerOff = vi.spyOn(scroller, 'removeEventListener')
    find.destroy()
    expect(host.children).toHaveLength(0)
    expect(docOff).toHaveBeenCalledWith('selectionchange', expect.any(Function))
    expect(winOff).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    expect(hostOff).toHaveBeenCalledWith('beforematch', expect.any(Function))
    expect(scrollerOff).toHaveBeenCalledWith('scroll', expect.any(Function))
  })

  it('makes the index again for new data', () => {
    make()
    find.destroy()
    make({ rowCount: 250 })
    expect(find.chunkCount).toBe(3)
    expect(host.querySelectorAll('[data-sp-chunk]')).toHaveLength(3)
  })

  describe('columns (transparent index)', () => {
    const COLS: NativeFindColumn[] = [
      { start: 8, end: 108 },
      { start: 140, end: 240, align: 'end' },
    ]
    const names = ['ann', 'bob', 'cy']
    // 1000 rows. The row order is the order that a table shows after a sort or a filter.
    const cells = (order: readonly number[]) => (i: number) => [`id${order[i]}`, names[order[i] % 3]]
    const ident = Array.from({ length: ROWS }, (_, i) => i)
    const make2 = (order: readonly number[], extra: Partial<NativeFindBase> & { getRowCells?: (row: number) => readonly string[] } = {}) =>
      (find = createNativeFind({
        scroller,
        host,
        rowCount: order.length,
        rowHeight: RH,
        rowTop: 50,
        charWidth: 8,
        rowsPerChunk: PER,
        getRowCells: cells(order),
        columns: COLS,
        ...extra,
      }))

    it('makes a transparent layer that starts at the first row, one line per row', () => {
      make2(ident)
      const c = chunk(4)!
      expect(c.getAttribute('data-sp-layer')).toBe('transparent')
      expect(c.style.top).toBe(`${50 + 4 * PER * RH}px`)
      expect(c.style.color).toBe('transparent')
      const lines = (c.firstChild as Text).data.split('\n')
      expect(lines).toHaveLength(100)
      expect(lines[50].split(/\t+/)).toEqual(['id450', 'ann'])
    })

    it('maps a row to its chunk and its line, with a short last chunk', () => {
      make2(ident.slice(0, 250))
      expect(find.chunkCount).toBe(3)
      const last = (chunk(2)!.firstChild as Text).data.split('\n')
      expect(last).toHaveLength(50)
      expect(last[49].split(/\t+/)[0]).toBe('id249')
    })

    it('counts the offset of the rows from the top of the host when it shows the chunks near the view', async () => {
      make2(ident)
      expect(chunk(0)!.hasAttribute('hidden')).toBe(false) // scrollTop 0: the view reaches row (100 - 50) / 20
      await scrollTo(50 + 5 * PER * RH + 10)
      expect(chunk(5)!.hasAttribute('hidden')).toBe(false)
      expect(chunk(4)!.getAttribute('hidden')).toBe('until-found')
    })

    it('puts the index over the cells (z-index option)', () => {
      make2(ident, { zIndex: 26 })
      expect(chunk(1)!.style.zIndex).toBe('26')
    })

    it('audits against the cells, once per match', () => {
      make2(ident)
      expect(find.audit('id450')).toMatchObject({ expected: 1, findable: 1, total: 1, missing: [], duplicates: [], extra: [], corrupt: [] })
      expect(find.audit('ann').expected).toBe(334)
    })

    it('follows a new row order after a sort, a filter or a data change', () => {
      make2(ident)
      const before = find.audit('id450')
      expect(before.findable).toBe(1)
      find.destroy()
      expect(host.querySelectorAll('[data-sp-chunk]')).toHaveLength(0)

      // sort: reversed order, so row 450 is now row 549
      const reversed = [...ident].reverse()
      make2(reversed)
      expect((chunk(5)!.firstChild as Text).data.split('\n')[49].split(/\t+/)[0]).toBe('id450')
      expect(find.audit('id450')).toMatchObject({ expected: 1, findable: 1, missing: [], corrupt: [] })
      find.destroy()

      // filter: only the rows that end with 0, 250 rows left, 3 chunks
      const filtered = ident.filter((n) => n % 4 === 0)
      make2(filtered)
      expect(find.chunkCount).toBe(3)
      expect(find.audit('id450').findable).toBe(0)
      expect(find.audit('id448')).toMatchObject({ expected: 1, findable: 1 })
      find.destroy()

      // data change: new text in the same rows
      make2(ident, { getRowCells: (i) => [`new${i}`, 'zed'] })
      expect(find.audit('id450').findable).toBe(0)
      expect(find.audit('new450')).toMatchObject({ expected: 1, findable: 1, corrupt: [] })
      expect(find.audit('zed').findable).toBe(1000)
    })

    it('reports the row of a Firefox selection from the line, not from the tabs', () => {
      const onActiveRow = vi.fn()
      make2(ident, { onActiveRow })
      select(4, 'ann')
      // The first "ann" in chunk 4 is on row 402 (400 is bob, 401 is cy). The tabs between the cells do not count as rows.
      expect(onActiveRow).toHaveBeenCalledWith(402)
      expect(find.mode).toBe('sparse')
    })

    describe('multi-line cells', () => {
      const MCOLS: NativeFindColumn[] = [
        { start: 8, end: 108 },
        { start: 140, end: 300, lines: [{ dx: 30, dy: -7 }, { dx: 30, dy: 9 }] },
        { start: 320, end: 400 },
      ]
      // the middle column of every row is two lines: a handle and a name. Row 5 is a group row with a plain text.
      const mcells = (i: number): (string | string[])[] => [`id${i}`, i === 5 ? 'Group' : [`@user${i}`, `Name ${i}`], `mail${i}@x`]
      const make3 = (extra: Partial<NativeFindBase> = {}) =>
        (find = createNativeFind({ scroller, host, rowCount: 250, rowHeight: RH, rowTop: 50, charWidth: 8, rowsPerChunk: PER, getRowCells: mcells, columns: MCOLS, ...extra }))
      const spans = (k: number) => [...chunk(k)!.querySelectorAll<HTMLElement>(':scope > span')]

      it('wraps each moved line in an inline span with position relative, and keeps it in the row text', () => {
        make3()
        const s = spans(1) // rows 100 to 199
        expect(s).toHaveLength(200)
        expect(s[0].textContent).toBe('@user100')
        expect(s[0].style.position).toBe('relative')
        expect(s[0].style.top).toBe('-7px')
        expect(s[1].textContent).toBe('Name 100')
        expect(s[1].style.top).toBe('9px')
        expect(s[2].style.top).toBe('-7px') // the next row
        expect(chunk(1)!.textContent!.split('\n')[0].split(/\t+/).filter(Boolean)).toEqual(['id100', '@user100', 'Name 100', 'mail100@x'])
      })

      it('moves a span to the left edge of the visible text with its left offset', () => {
        make3()
        const line = chunk(1)!.textContent!.split('\n')[0]
        const starts = [...line.matchAll(/[^\t]+/g)].map((m) => m.index)
        expect(starts).toHaveLength(4)
        const s = spans(1)
        // flow position of the handle plus the left offset is column start 140 + dx 30
        let pos = 0
        let handleStart = -1
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '\t') {
            const next = (Math.floor(pos / 20 + 1e-6) + 1) * 20
            pos = next - pos < 4 - 1e-6 ? next + 20 : next
          } else {
            if (i === starts[1]) handleStart = pos
            pos += 8
          }
        }
        expect(handleStart + parseFloat(s[0].style.left)).toBeCloseTo(170, 1)
      })

      it('keeps one text line per row', () => {
        make3()
        expect(chunk(0)!.textContent!.split('\n')).toHaveLength(100)
      })

      it('writes a plain string in a multi-line column as a normal cell, with no span', () => {
        make3()
        const c = chunk(0)!
        expect([...c.querySelectorAll('span')].some((sp) => sp.textContent === 'Group')).toBe(false)
        expect((c.textContent ?? '').includes('Group')).toBe(true)
      })

      it('audits the lines of the cell: once per match, no match across two lines', () => {
        make3()
        expect(find.audit('@user150')).toMatchObject({ expected: 1, findable: 1, total: 1, missing: [], duplicates: [], extra: [], corrupt: [] })
        expect(find.audit('name 249')).toMatchObject({ expected: 1, findable: 1, corrupt: [] })
        expect(find.audit('Group').findable).toBe(1)
        expect(find.audit('user150name').expected).toBe(0)
        expect(find.audit('user150name').total).toBe(0)
      })

      it('reports a chunk whose text no longer matches the data', () => {
        make3()
        spans(2)[3].textContent = 'tampered'
        expect(find.audit('user').corrupt.length).toBeGreaterThan(0)
      })

      it('reports the row of a Firefox selection inside a span and after the spans', () => {
        const onActiveRow = vi.fn()
        make3({ onActiveRow })
        const sp = spans(1)[41] // the name line of row 120
        const node = sp.firstChild as Text
        document.getSelection()!.setBaseAndExtent(node, 0, node, 4)
        document.dispatchEvent(new Event('selectionchange'))
        expect(onActiveRow).toHaveBeenLastCalledWith(120)
        const walker = document.createTreeWalker(chunk(1)!, NodeFilter.SHOW_TEXT)
        let t: Text | null = null
        for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.includes('mail130')) t = n as Text
        const at = t!.data.indexOf('mail130')
        document.getSelection()!.setBaseAndExtent(t!, at, t!, at + 4)
        document.dispatchEvent(new Event('selectionchange'))
        expect(onActiveRow).toHaveBeenLastCalledWith(130)
      })

      it('switches to sparse mode for a query that only the lines of the cell hold', () => {
        make3()
        const node = spans(1)[100].firstChild as Text // the handle line of row 150
        expect(node.data).toBe('@user150')
        document.getSelection()!.setBaseAndExtent(node, 0, node, 8)
        document.dispatchEvent(new Event('selectionchange'))
        expect(find.mode).toBe('sparse')
      })
    })
  })
})
