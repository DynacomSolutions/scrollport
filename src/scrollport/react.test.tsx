/// <reference types="vite/client" />
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CellText, NativeFindGrid } from './react'
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
    expect(el.querySelectorAll('.sp-row')).toHaveLength(500)
    expect(el.querySelectorAll('.sp-cell')).toHaveLength(1000)
    expect(el.querySelector('[data-row="499"]')?.textContent).toBe('id499odd')
    expect(el.querySelectorAll('.native-find-index, [data-find-index], [inert]')).toHaveLength(0)
  })

  it('keeps repeated text as separate legitimate cells', () => {
    render(<NativeFindGrid rowCount={1} columns={2} getRow={() => ['repeated', 'repeated']} />)
    const cells = [...el.querySelectorAll('.sp-cell')].filter((cell) => cell.textContent === 'repeated')
    expect(cells).toHaveLength(2)
    expect(cells[0]).not.toBe(cells[1])
  })

  it('renders CellText as ordinary selectable text without inert attributes', () => {
    render(<CellText text="visible text" />)
    const span = el.querySelector('span')!
    expect(span.textContent).toBe('visible text')
    expect(span.hasAttribute('inert')).toBe(false)
    expect(span.firstChild?.nodeType).toBe(Node.TEXT_NODE)
  })
})
