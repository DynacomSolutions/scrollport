import { act, useCallback, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { IndexedText, NativeFindGrid, useFindIndex, useNativeFind } from './react'
import type { NativeFind } from './core'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
})

afterEach(() => document.body.replaceChildren())

describe('NativeFindGrid compatibility observer', () => {
  it('reports the real-text controller on mount, data update, and unmount', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root: Root = createRoot(element)
    const events: (string | null)[] = []
    const controllers: NativeFind[] = []
    const onFind = (find: NativeFind | null) => {
      events.push(find ? find.mode : null)
      if (find) controllers.push(find)
    }
    const render = (word: string) => <NativeFindGrid rowCount={1} columns={1} getRow={() => [word]} onFind={onFind} />

    act(() => root.render(render('first')))
    expect(events).toEqual(['full'])
    expect(element.querySelector('.sp-cell')?.textContent).toBe('first')
    expect(controllers[controllers.length - 1]?.audit('first')).toMatchObject({ expected: 1, findable: 1, total: 1 })
    act(() => root.render(render('second')))
    expect(events).toEqual(['full', null, 'full'])
    expect(element.querySelector('.sp-cell')?.textContent).toBe('second')
    act(() => root.unmount())
    expect(events).toEqual(['full', null, 'full', null])
  })

  it('reports the actual 250-row grouping', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root = createRoot(element)
    const observed: { value: NativeFind | null } = { value: null }
    act(() => root.render(<NativeFindGrid rowCount={251} columns={1} getRow={(row) => [`row${row}`]} onFind={(find) => { observed.value = find }} />))
    expect(observed.value?.chunkCount).toBe(2)
    expect(observed.value?.attachedChunks).toBe(2)
    act(() => root.unmount())
  })

  it('counts a second grid instance as one other document occurrence', () => {
    const firstElement = document.createElement('div')
    const secondElement = document.createElement('div')
    document.body.append(firstElement, secondElement)
    const firstRoot = createRoot(firstElement)
    const secondRoot = createRoot(secondElement)
    const controller: { value: NativeFind | null } = { value: null }
    act(() => firstRoot.render(<NativeFindGrid rowCount={1} columns={1} getRow={() => ['needle']} onFind={(find) => { controller.value = find }} />))
    act(() => secondRoot.render(<NativeFindGrid rowCount={1} columns={1} getRow={() => ['needle']} />))
    expect(controller.value?.audit('needle')).toMatchObject({ findable: 1, total: 2, other: [expect.any(String)] })
    act(() => firstRoot.unmount())
    act(() => secondRoot.unmount())
  })

  it('does not create a controller when no consumer requests one', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root = createRoot(element)
    const addListener = vi.spyOn(document, 'addEventListener')
    act(() => root.render(<NativeFindGrid rowCount={20} columns={1} getRow={(row) => [`row ${row}`]} />))
    expect(element.querySelectorAll('.sp-cell')).toHaveLength(20)
    expect(element.querySelectorAll('.native-find-index, [data-find-index]')).toHaveLength(0)
    expect(addListener).not.toHaveBeenCalledWith('selectionchange', expect.any(Function))
    addListener.mockRestore()
    act(() => root.unmount())
  })

  it('refreshes a grid observer when the visible column count changes', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root = createRoot(element)
    const getRow = () => ['one', 'two']
    const latest: { value: NativeFind | null } = { value: null }
    const track = (find: NativeFind | null) => { latest.value = find }
    act(() => root.render(<NativeFindGrid rowCount={1} columns={1} getRow={getRow} onFind={track} />))
    expect(latest.value?.audit('two')).toMatchObject({ expectedOccurrences: 0, findable: 0, total: 0 })
    act(() => root.render(<NativeFindGrid rowCount={1} columns={2} getRow={getRow} onFind={track} />))
    expect(latest.value?.audit('two')).toMatchObject({ expectedOccurrences: 1, findable: 1, total: 1, corrupt: [] })
    expect(element.querySelectorAll('.sp-cell')).toHaveLength(2)
    act(() => root.unmount())
  })

  it('keeps useFindIndex lifecycle and audits caller-rendered rows', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root = createRoot(element)
    const events: (string | null)[] = []
    const onFind = (find: NativeFind | null) => events.push(find ? find.mode : null)
    function Harness({ word }: { word: string }) {
      const scrollerRef = useRef<HTMLDivElement>(null)
      const hostRef = useRef<HTMLDivElement>(null)
      useFindIndex(scrollerRef, hostRef, { rowCount: 1, rowHeight: 30, getRowText: () => word, onFind })
      return <div ref={scrollerRef}><div ref={hostRef}><div data-row="0"><IndexedText text={word} /></div></div></div>
    }
    act(() => root.render(<Harness word="first" />))
    expect(events).toEqual(['full'])
    expect(element.querySelector('[data-row="0"]')?.textContent).toBe('first')
    act(() => root.render(<Harness word="second" />))
    expect(events).toEqual(['full', null, 'full'])
    expect(element.querySelector('[data-row="0"]')?.textContent).toBe('second')
    act(() => root.unmount())
    expect(events).toEqual(['full', null, 'full', null])
  })

  it('replaces useNativeFind-owned displayed cells when the source accessor changes', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root = createRoot(element)
    const events: (NativeFind | null)[] = []
    function Harness({ word }: { word: string }) {
      const getRowText = useCallback(() => word, [word])
      const { scrollerRef, hostRef } = useNativeFind({ rowCount: 1, rowHeight: 32, getRowText, onFind: (find) => events.push(find) })
      return <div ref={scrollerRef}><div ref={hostRef}><div className="sp-row" data-row="0" style={{ height: 32 }} /></div></div>
    }
    act(() => root.render(<Harness word="alpha" />))
    expect(element.querySelector('.sp-cell')?.textContent).toBe('alpha')
    act(() => root.render(<Harness word="beta" />))
    expect(element.querySelector('.sp-cell')?.textContent).toBe('beta')
    expect(element.textContent).not.toContain('alpha')
    act(() => root.unmount())
    expect(element.querySelector('.sp-cell')).toBeNull()
  })

  it('uses tabSize and indent for a real two-column row', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root = createRoot(element)
    function Harness() {
      const { scrollerRef, hostRef } = useNativeFind({ rowCount: 1, rowHeight: 32, getRowText: () => 'one\ttwo', tabSize: 120, indent: 8 })
      return <div ref={scrollerRef}><div ref={hostRef}><div className="sp-row" data-row="0" style={{ height: 32 }} /></div></div>
    }
    act(() => root.render(<Harness />))
    const row = element.querySelector<HTMLElement>('.sp-row')!
    expect(row.style.display).toBe('grid')
    expect(row.style.gridTemplateColumns).toBe('repeat(2, 120px)')
    expect(row.style.paddingLeft).toBe('8px')
    expect(row.style.height).toBe('32px')
    expect([...row.querySelectorAll('.sp-cell')].map((cell) => cell.textContent)).toEqual(['one', 'two'])
    act(() => root.unmount())
    expect(row.children).toHaveLength(0)
    expect(row.style.display).toBe('')
  })

  it('leaves generic hook hosts empty when source data has rows', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root = createRoot(element)
    const latest: { value: NativeFind | null } = { value: null }
    function Harness() {
      const scrollerRef = useRef<HTMLDivElement>(null)
      const hostRef = useRef<HTMLDivElement>(null)
      useFindIndex(scrollerRef, hostRef, { rowCount: 1, rowHeight: 32, getRowText: () => 'source-only', onFind: (find) => { latest.value = find } })
      return <div ref={scrollerRef}><div ref={hostRef} /></div>
    }
    act(() => root.render(<Harness />))
    expect(element.querySelector('[data-row], .sp-cell')).toBeNull()
    expect(latest.value?.audit('source-only')).toMatchObject({ expected: 1, findable: 0, total: 0 })
    act(() => root.unmount())
  })

  it('useNativeFind returns a window of rows by default, not every row', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root = createRoot(element)
    const seen: { first: number; end: number }[] = []
    function Harness({ all }: { all: boolean }) {
      const find = useNativeFind({ rowCount: 100_000, rowHeight: 32, getRowText: () => 'x', renderAllRows: all })
      seen.push({ first: find.first, end: find.end })
      return <div ref={find.scrollerRef}><div ref={find.hostRef} /></div>
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    act(() => root.render(<Harness all={false} />))
    expect(seen[seen.length - 1].first).toBe(0)
    expect(seen[seen.length - 1].end).toBeLessThanOrEqual(40)
    act(() => root.render(<Harness all={true} />))
    expect(seen[seen.length - 1]).toEqual({ first: 0, end: 100_000 })
    warn.mockRestore()
    act(() => root.unmount())
  })

  it('fills the placeholders again when the row window changes', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root = createRoot(element)
    function Harness({ first }: { first: number }) {
      const scrollerRef = useRef<HTMLDivElement>(null)
      const hostRef = useRef<HTMLDivElement>(null)
      const getRowText = useCallback((row: number) => `row ${row}`, [])
      useFindIndex(scrollerRef, hostRef, { rowCount: 10, rowHeight: 32, getRowText, materializeRows: true, materializeKey: first })
      return <div ref={scrollerRef}><div ref={hostRef}><div className="sp-row" key={first} data-row={first} /></div></div>
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    act(() => root.render(<Harness first={2} />))
    expect(element.querySelector('.sp-cell')?.textContent).toBe('row 2')
    act(() => root.render(<Harness first={5} />))
    expect(element.querySelectorAll('.sp-cell')).toHaveLength(1)
    expect(element.querySelector('.sp-cell')?.textContent).toBe('row 5')
    warn.mockRestore()
    act(() => root.unmount())
  })

  describe('a row window that moves', () => {
    type Seen = { activeRow: number }
    function setup(events: (NativeFind | null)[], seen: Seen) {
      function Harness({ first }: { first: number }) {
        const scrollerRef = useRef<HTMLDivElement>(null)
        const hostRef = useRef<HTMLDivElement>(null)
        const getRowText = useCallback((row: number) => `row ${row}`, [])
        const { activeRow } = useFindIndex(scrollerRef, hostRef, {
          rowCount: 20, rowHeight: 32, getRowText, materializeRows: true, materializeKey: first, activeRowMs: 1000,
          onFind: (find) => events.push(find),
        })
        seen.activeRow = activeRow
        return (
          <div ref={scrollerRef}>
            <div ref={hostRef}>
              {[0, 1, 2].map((i) => <div className="sp-row" key={first + i} data-row={first + i} />)}
            </div>
          </div>
        )
      }
      const element = document.createElement('div')
      document.body.append(element)
      const root = createRoot(element)
      return { element, root, Harness }
    }

    it('keeps the text node and the selection of a row that stays in view', () => {
      const events: (NativeFind | null)[] = []
      const { element, root, Harness } = setup(events, { activeRow: -1 })
      act(() => root.render(<Harness first={0} />))
      const cell = element.querySelector('[data-row="1"] .sp-cell') as HTMLElement
      const text = cell.firstChild as Text
      const range = document.createRange()
      range.selectNodeContents(text)
      document.getSelection()?.removeAllRanges()
      document.getSelection()?.addRange(range)
      act(() => root.render(<Harness first={1} />))
      const after = element.querySelector('[data-row="1"] .sp-cell') as HTMLElement
      expect(after).toBe(cell)
      expect(after.firstChild).toBe(text)
      expect(text.isConnected).toBe(true)
      expect(document.getSelection()?.toString()).toBe('row 1')
      // The new row is filled and the row that left leaves no cell behind.
      expect(element.querySelector('[data-row="3"] .sp-cell')?.textContent).toBe('row 3')
      expect(element.querySelector('[data-row="0"]')).toBeNull()
      expect(element.querySelectorAll('.sp-cell')).toHaveLength(3)
      act(() => root.unmount())
    })

    it('calls onFind once per real change, not on each window move', () => {
      const events: (NativeFind | null)[] = []
      const { root, Harness } = setup(events, { activeRow: -1 })
      act(() => root.render(<Harness first={0} />))
      expect(events).toHaveLength(1)
      expect(events[0]).not.toBeNull()
      for (const first of [1, 2, 3, 4]) act(() => root.render(<Harness first={first} />))
      expect(events).toHaveLength(1)
      act(() => root.unmount())
      expect(events).toHaveLength(2)
      expect(events[1]).toBeNull()
    })

    it('resets activeRow after its timeout, also when the window moves meanwhile', () => {
      vi.useFakeTimers()
      try {
        const seen: Seen = { activeRow: -1 }
        const { element, root, Harness } = setup([], seen)
        act(() => root.render(<Harness first={0} />))
        const text = (element.querySelector('[data-row="1"] .sp-cell') as HTMLElement).firstChild as Text
        const range = document.createRange()
        range.selectNodeContents(text)
        document.getSelection()?.removeAllRanges()
        document.getSelection()?.addRange(range)
        act(() => { document.dispatchEvent(new Event('selectionchange')) })
        expect(seen.activeRow).toBe(1)
        act(() => { vi.advanceTimersByTime(400) })
        act(() => root.render(<Harness first={1} />))
        act(() => { vi.advanceTimersByTime(400) })
        act(() => root.render(<Harness first={2} />))
        expect(seen.activeRow).toBe(1)
        act(() => { vi.advanceTimersByTime(400) })
        expect(seen.activeRow).toBe(-1)
        act(() => root.unmount())
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
