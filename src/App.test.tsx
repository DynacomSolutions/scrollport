import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { generateData } from './data'
import NativeFindTableDemo, { recordIdValue, toTableRows } from './App'

describe('table demo row model', () => {
  it('uses generated records directly as subrows and keeps their numeric ids', () => {
    const records = generateData(30)
    const groups = toTableRows(records)
    const subrows = groups.flatMap((group) => group.subRows ?? [])

    expect(subrows).toHaveLength(records.length)
    expect(subrows.some((row) => row === records[0])).toBe(true)
    expect(subrows.every((row) => typeof row.id === 'number')).toBe(true)
    expect(subrows.every((row) => row.recordId === undefined && row.rowType === undefined)).toBe(true)
    expect(groups.every((row) => typeof row.id === 'string' && row.rowType === 'department')).toBe(true)
    expect(recordIdValue(records[0])).toBe(records[0].id)
    expect(recordIdValue(groups[0])).toBeUndefined()

    const selected = [records[9], records[2], records[19]].map(recordIdValue).sort((left, right) => (left ?? 0) - (right ?? 0))
    expect(selected).toEqual([3, 10, 20])
  })
})

describe('OmniSearch visible match highlighting', () => {
  let root: Root | undefined
  let host: HTMLDivElement

  beforeAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      } satisfies Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'>,
    })
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  })

  afterEach(() => {
    act(() => root?.unmount())
    host.remove()
    window.history.replaceState(null, '', '/')
    window.localStorage.clear()
  })

  const render = () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<NativeFindTableDemo rowCount={100} nativeFind />))
  }

  it('highlights the typed raw filter without duplicating the visible email text', () => {
    render()
    const search = host.querySelector<HTMLInputElement>('.omni-input')!
    expect(host.querySelectorAll('mark.cell-highlight')).toHaveLength(0)

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }))
    })
    expect(host.querySelectorAll('mark.cell-highlight')).toHaveLength(0)

    act(() => {
      search.focus()
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setValue.call(search, 'isabella.kelly674@acme.io')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))

    expect(host.querySelector('.users-title')?.textContent).toBe('Users (1 / 100)')
    expect(new URLSearchParams(window.location.search).get('users.search')).toBe('isabella.kelly674@acme.io')
    expect(document.activeElement).toBe(search)
    const emailCell = [...host.querySelectorAll<HTMLElement>('.td')].find((cell) => cell.textContent === 'isabella.kelly674@acme.io')
    expect(emailCell?.querySelectorAll('mark.cell-highlight')).toHaveLength(1)
    expect(emailCell?.textContent).toBe('isabella.kelly674@acme.io')
    expect(emailCell?.textContent?.match(/isabella\.kelly674@acme\.io/gi)).toHaveLength(1)
  })

  it('highlights multiple case-insensitive occurrences in one cell', () => {
    render()
    const search = host.querySelector<HTMLInputElement>('.omni-input')!
    act(() => {
      search.focus()
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setValue.call(search, 'L')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))

    const emailCell = [...host.querySelectorAll<HTMLElement>('.td')].find((cell) => cell.textContent === 'isabella.kelly674@acme.io')
    expect(emailCell).toBeDefined()
    expect(emailCell?.querySelectorAll('mark.cell-highlight')).toHaveLength(4)
    expect(emailCell?.textContent).toBe('isabella.kelly674@acme.io')
  })
})
