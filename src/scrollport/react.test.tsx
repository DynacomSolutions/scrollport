import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { NativeFindGrid } from './react'
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
})
