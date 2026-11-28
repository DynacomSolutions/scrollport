import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import styles from './styles.css?raw'
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

  describe('highlighted text for native Find', () => {
    const search = (value: string) => {
      render()
      const input = host.querySelector<HTMLInputElement>('.omni-input')!
      act(() => {
        input.focus()
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        setValue.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    }

    it('keeps the text pieces and the marks of a cell in one inline element', () => {
      search('a')
      const marks = [...host.querySelectorAll<HTMLElement>('mark.cell-highlight')]
      expect(marks.length).toBeGreaterThan(0)
      for (const mark of marks) {
        const wrapper = mark.parentElement!
        expect(wrapper.matches('span.cell-text')).toBe(true)
        expect([...wrapper.childNodes].every((node) => node.nodeType === Node.TEXT_NODE || (node as Element).matches('mark.cell-highlight'))).toBe(true)
        // the wrapper is the only child of its parent, so the parent has one flex item and no mark is a flex item
        expect(wrapper.parentElement!.childNodes).toHaveLength(1)
      }
    })

    it('keeps an email cell as one contiguous text run when only a part of it is highlighted', () => {
      search('northwind')
      const cell = [...host.querySelectorAll<HTMLElement>('.td')].find((item) => /@northwind\.app$/.test(item.textContent ?? ''))
      expect(cell).toBeDefined()
      const wrapper = cell!.querySelector<HTMLElement>('.cell-text')!
      expect(wrapper.textContent).toBe(cell!.textContent)
      expect(wrapper.querySelectorAll('mark.cell-highlight')).toHaveLength(1)
      expect(wrapper.childNodes.length).toBeGreaterThanOrEqual(3)
    })

    it('does not make the highlight or its wrapper a block or a flex container', () => {
      // jsdom does not resolve this stylesheet (container queries), so the rules are read from its source
      const rule = (selector: string) => [...styles.matchAll(new RegExp(`(?:^|\\}|\\*/)\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g'))].map((match) => match[1]).join(';')
      expect(rule('.cell-highlight')).toMatch(/background/)
      expect(rule('.cell-text')).toMatch(/min-width/)
      expect(rule('.cell-highlight')).not.toMatch(/display\s*:/)
      expect(rule('.cell-text')).not.toMatch(/display\s*:\s*(?:flex|inline-flex|grid|inline-grid)/)
    })
  })
})
