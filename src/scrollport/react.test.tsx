/// <reference types="vite/client" />
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CellText, NativeFindGrid } from './react'
import { mountScrollportNativeFind } from '../embed'
import gridStyles from './scrollport.css?raw'
import tableStyles from '../styles.css?raw'
import demoStyles from '../demo/demo.css?raw'

const row = (i: number) => [`id${i}`, i % 2 ? 'odd' : 'even']

it.each(Object.entries({ grid: gridStyles, table: tableStyles, demo: demoStyles }))(
  'keeps browser find paint out of %s',
  (_name, source) => {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toMatch(/::search-text\b/i)
    expect(css).not.toMatch(/(?:^|[{},])\s*(?:\*|html|body|:root)?::(?:-moz-)?selection\b|(?:\[data-sp-|\.sp-(?:grid|host|row))[^{}]*::(?:-moz-)?selection\b/i)
  },
)

describe('NativeFindGrid real text', () => {
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

  it('keeps every displayed row and cell in the DOM for browser Find', () => {
    render(<NativeFindGrid rowCount={500} columns={2} getRow={row} />)
    expect(el.querySelectorAll('.sp-cell')).toHaveLength(1000)
    expect(el.querySelectorAll('.sp-row-group')).toHaveLength(2)
    expect(el.querySelectorAll('.sp-row')).toHaveLength(0)
    expect(el.querySelectorAll('[data-sp-layer], .native-find-index, [data-find-index], [inert], [aria-hidden="true"]')).toHaveLength(0)
    expect([...el.querySelectorAll('.sp-cell')].slice(-2).map((cell) => cell.textContent)).toEqual(['id499', 'odd'])
    expect([...el.querySelectorAll('.sp-cell')].every((cell) => cell.childNodes.length === 1 && cell.firstChild?.nodeType === Node.TEXT_NODE)).toBe(true)
    expect(el.querySelectorAll('.native-find-index, [data-find-index], [inert]')).toHaveLength(0)
  })

  it('keeps repeated text as separate legitimate cells', () => {
    render(<NativeFindGrid rowCount={1} columns={2} getRow={() => ['repeated', 'repeated']} />)
    const cells = [...el.querySelectorAll('.sp-cell')].filter((cell) => cell.textContent === 'repeated')
    expect(cells).toHaveLength(2)
    expect(cells[0]).not.toBe(cells[1])
    expect(cells.every((cell) => cell.querySelectorAll('*').length === 0)).toBe(true)
    expect(cells.every((cell) => cell.firstChild?.nodeType === Node.TEXT_NODE)).toBe(true)
  })

  it('reveals only nearby groups as the real scroll container moves', () => {
    render(<NativeFindGrid rowCount={2000} columns={2} getRow={row} />)
    const scroller = el.querySelector<HTMLElement>('.sp-grid')!
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 600 })
    scroller.scrollTop = 35_000
    act(() => scroller.dispatchEvent(new Event('scroll')))
    const groups = [...el.querySelectorAll<HTMLElement>('.sp-row-group')]
    expect(groups[0].getAttribute('hidden')).toBe('until-found')
    expect(groups[4].hasAttribute('hidden')).toBe(false)
    expect(groups[7].getAttribute('hidden')).toBe('until-found')
    expect(groups[4].querySelectorAll('.sp-cell')).toHaveLength(500)
  })

  it('keeps the browser-revealed group visible until another match pins a group', () => {
    render(<NativeFindGrid rowCount={1251} columns={2} getRow={row} />)
    const scroller = el.querySelector<HTMLElement>('.sp-grid')!
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 600 })
    const groups = [...el.querySelectorAll<HTMLElement>('.sp-row-group')]
    const farGroup = groups[5]
    farGroup.dispatchEvent(new Event('beforematch', { bubbles: true }))
    farGroup.removeAttribute('hidden')

    scroller.scrollTop = 100
    act(() => scroller.dispatchEvent(new Event('scroll')))
    expect(farGroup.hasAttribute('hidden')).toBe(false)

    const nextGroup = groups[4]
    nextGroup.dispatchEvent(new Event('beforematch', { bubbles: true }))
    nextGroup.removeAttribute('hidden')
    scroller.scrollTop = 100
    act(() => scroller.dispatchEvent(new Event('scroll')))
    expect(farGroup.getAttribute('hidden')).toBe('until-found')
    expect(nextGroup.hasAttribute('hidden')).toBe(false)
  })

  it('mounts a direct grid entry with one visible text node per cell', async () => {
    el = document.createElement('div')
    document.body.append(el)
    await act(async () => {
      mountScrollportNativeFind(el, { gridRows: 4, includeTable: false })
    })
    expect(el.querySelectorAll('.sp-cell')).toHaveLength(24)
    expect([...el.querySelectorAll('.sp-cell')].some((cell) => cell.textContent?.includes('qx7r0000003'))).toBe(true)
    expect(el.querySelectorAll('[data-sp-layer], [inert], [aria-hidden="true"]')).toHaveLength(0)
  })

  it('renders CellText as ordinary selectable text without inert attributes', () => {
    render(<CellText text="visible text" />)
    const span = el.querySelector('span')!
    expect(span.textContent).toBe('visible text')
    expect(span.hasAttribute('inert')).toBe(false)
    expect(span.firstChild?.nodeType).toBe(Node.TEXT_NODE)
  })
})
