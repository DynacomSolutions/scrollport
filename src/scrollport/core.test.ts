import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chunkCount,
  chunkOfRow,
  chunksOfQuery,
  cleanLine,
  createNativeFind,
  rowAtOffset,
  rowsOfChunk,
  type NativeFind,
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

  const make = (extra: Partial<Parameters<typeof createNativeFind>[0]> = {}) =>
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
})
