import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useCallback, useRef } from 'react'
import { IndexedText, NativeFindGrid, useFindIndex } from './react'
import type { NativeFindColumn } from './core'
import type { NativeFind } from './core'

const row = (i: number) => [`id${i}`, 'x']

describe('NativeFindGrid', () => {
  let root: Root | undefined
  let el: HTMLDivElement

  beforeAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  })

  afterEach(() => {
    act(() => root?.unmount())
    el.remove()
  })

  const render = (node: React.ReactNode) => {
    el = document.createElement('div')
    document.body.append(el)
    root = createRoot(el)
    act(() => root!.render(node))
  }

  it('draws a few rows and holds the text of all rows in the index', () => {
    let find: NativeFind | null = null
    render(<NativeFindGrid rowCount={500} columns={2} getRow={row} onFind={(f) => (find = f)} />)
    expect(el.querySelectorAll('.sp-row').length).toBeGreaterThan(0)
    expect(el.querySelectorAll('.sp-row').length).toBeLessThan(60)
    expect(el.querySelectorAll('[data-sp-chunk]')).toHaveLength(5)
    expect(el.querySelector('[data-sp-chunk="4"]')?.textContent?.split('\n')[99]).toBe('id499\tx')
    expect(find!.audit('id499')).toMatchObject({ expected: 1, findable: 1, missing: [] })
  })

  it('removes the index when it unmounts', () => {
    let find: NativeFind | null = null
    render(<NativeFindGrid rowCount={500} columns={2} getRow={row} onFind={(f) => (find = f)} />)
    expect(find).not.toBeNull()
    act(() => root!.unmount())
    expect(find).toBeNull()
    expect(document.querySelectorAll('[data-sp-chunk]')).toHaveLength(0)
    root = undefined
  })

  describe('useFindIndex (a table that draws its own rows)', () => {
    const COLS: NativeFindColumn[] = [
      { start: 8, end: 100 },
      { start: 120, end: 200 },
    ]
    const cells = (order: readonly number[]) => (i: number) => [`id${order[i]}`, order[i] % 2 ? 'odd' : 'even']

    function Table({ order, enabled = true, onFind }: { order: readonly number[]; enabled?: boolean; onFind?: (f: NativeFind | null) => void }) {
      const scroller = useRef<HTMLDivElement>(null)
      const host = useRef<HTMLDivElement>(null)
      const getRowCells = useCallback(cells(order), [order])
      useFindIndex(scroller, host, { enabled, rowCount: order.length, rowHeight: 20, rowTop: 40, getRowCells, columns: COLS, onFind })
      return (
        <div ref={scroller}>
          <div ref={host} style={{ position: 'relative' }}>
            <div className="header">header</div>
            <IndexedText text="shown" />
          </div>
        </div>
      )
    }

    const order = (n: number) => Array.from({ length: n }, (_, i) => i)
    const lineOf = (row: number) => (el.querySelector('[data-sp-chunk="0"]')!.firstChild as Text).data.split('\n')[row].split(/\t+/)

    it('builds the index inside the host, next to the rows that the table draws', () => {
      render(<Table order={order(50)} />)
      expect(el.querySelectorAll('[data-sp-chunk]')).toHaveLength(1)
      expect(el.querySelector<HTMLElement>('[data-sp-chunk]')!.style.top).toBe('40px')
      expect(el.querySelector('.header')).not.toBeNull() // the rows of the table are not touched
      expect(lineOf(7)).toEqual(['id7', 'odd'])
    })

    it('builds the index again, with the new row order, when the rows change', () => {
      render(<Table order={order(50)} />)
      const reversed = order(50).reverse()
      act(() => root!.render(<Table order={reversed} />))
      expect(el.querySelectorAll('[data-sp-chunk]')).toHaveLength(1) // the old chunks are gone
      expect(lineOf(0)).toEqual(['id49', 'odd'])
      const filtered = order(50).filter((n) => n % 10 === 0)
      act(() => root!.render(<Table order={filtered} />))
      expect((el.querySelector('[data-sp-chunk="0"]')!.firstChild as Text).data.split('\n')).toHaveLength(5)
    })

    it('reports each build and each removal through onFind', () => {
      const onFind = vi.fn()
      render(<Table order={order(50)} onFind={onFind} />)
      expect(onFind).toHaveBeenLastCalledWith(expect.objectContaining({ chunkCount: 1 }))
      act(() => root!.render(<Table order={order(250)} onFind={onFind} />))
      expect(onFind).toHaveBeenCalledWith(null)
      expect(onFind).toHaveBeenLastCalledWith(expect.objectContaining({ chunkCount: 3 }))
    })

    it('builds nothing while it is not enabled', () => {
      render(<Table order={order(50)} enabled={false} />)
      expect(el.querySelectorAll('[data-sp-chunk]')).toHaveLength(0)
    })
  })

  describe('IndexedText', () => {
    it('keeps the text in the page, but inert, so the find bar skips it', () => {
      render(<IndexedText text="Ada" className="x" />)
      const span = el.querySelector('span')!
      expect(span.textContent).toBe('Ada')
      expect(span.hasAttribute('inert')).toBe(true)
      expect(span.className).toBe('x')
    })

    it('can be a mark or strong element', () => {
      render(<IndexedText text="Ada" as="mark" />)
      expect(el.querySelector('mark[inert]')).not.toBeNull()
    })
  })
})
