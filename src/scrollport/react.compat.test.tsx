import { act, useCallback, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { IndexedText, NativeFindGrid, useFindIndex, useNativeFind } from './react'
import type { NativeFind } from './core'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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
    const events: (string | null)[] = []
    const onFind = (find: NativeFind | null) => events.push(find ? find.mode : null)
    const getRow = () => ['one', 'two']
    act(() => root.render(<NativeFindGrid rowCount={1} columns={1} getRow={getRow} onFind={onFind} />))
    const first: { value: NativeFind | null } = { value: null }
    const readFirst = (find: NativeFind | null) => { first.value = find }
    act(() => root.render(<NativeFindGrid rowCount={1} columns={1} getRow={getRow} onFind={readFirst} />))
    expect(first.value?.audit('two')).toMatchObject({ expectedOccurrences: 0, findable: 0, total: 0 })
    const latest: { value: NativeFind | null } = { value: null }
    act(() => root.render(<NativeFindGrid rowCount={1} columns={2} getRow={getRow} onFind={(find) => { latest.value = find }} />))
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

})
