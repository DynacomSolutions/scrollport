import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ColumnDef } from '@tanstack/react-table'
import { VirtualGridTable } from './VirtualGridTable'

type Person = { id: number; name: string; city: string; score: number }

const data = (n: number): Person[] => Array.from({ length: n }, (_, i) => ({ id: i, name: `name${i}`, city: i % 2 ? 'Oslo' : 'Riga', score: i * 7 }))
const columns: ColumnDef<Person>[] = [
  { accessorKey: 'name', header: 'Name', size: 200, cell: ({ row }) => <span>{row.original.name}</span> },
  { accessorKey: 'score', header: 'Score', size: 100, cell: ({ row }) => <span>{row.original.score} pts</span> },
  { accessorKey: 'city', header: 'City', size: 140 },
]

describe('VirtualGridTable native Find DOM', () => {
  let root: Root | undefined
  let el: HTMLDivElement

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
    el.remove()
    window.localStorage.clear()
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  })

  const render = (node: React.ReactNode) => {
    el = document.createElement('div')
    document.body.append(el)
    root = createRoot(el)
    act(() => root!.render(node))
  }
  const table = (rows: Person[], nativeFind = true, extra: Partial<React.ComponentProps<typeof VirtualGridTable<Person>>> = {}) => (
    <VirtualGridTable<Person> tableId="t" data={rows} columns={columns} displayMode="table" nativeFind={nativeFind} {...extra} />
  )

  it('uses the displayed cell nodes for all rows without a proxy or inert duplicate', () => {
    render(table(data(250)))
    expect(el.querySelectorAll('.body-row')).toHaveLength(250)
    expect(el.querySelectorAll('.native-find-index, [data-find-index], [inert]')).toHaveLength(0)
    const last = el.querySelector('[data-row="249"] .td')!
    expect(last.textContent).toBe('name249')
    expect(last.querySelectorAll('[inert], [hidden], [data-find-index]').length).toBe(0)
    expect(last.querySelector('.sticky-surface')?.textContent).toBe('name249')
    expect(last.querySelector('.sticky-surface')?.childNodes[0]?.textContent).toBe('name249')
    expect(el.querySelectorAll('.td').length).toBe(250 * 3)
  })

  it('keeps repeated text as distinct native text occurrences in separate cells', () => {
    const repeated = [{ id: 1, name: 'matchword', city: 'matchword', score: 1 }]
    render(table(repeated))
    const cells = [...el.querySelectorAll('.td')].filter((cell) => cell.textContent === 'matchword')
    expect(cells).toHaveLength(2)
    expect(cells[0]).not.toBe(cells[1])
    expect(cells.every((cell) => cell.querySelectorAll('[inert]').length === 0)).toBe(true)
  })

  it('applies the native sticky class only when canSubheaderStick permits it', () => {
    type Group = { id: string; name: string; children?: Group[] }
    const groups: Group[] = [
      { id: 'stick', name: 'Stick group', children: [{ id: 'stick-child', name: 'Child A' }] },
      { id: 'no-stick', name: 'No stick group', children: [{ id: 'no-stick-child', name: 'Child B' }] },
    ]
    const groupColumns: ColumnDef<Group>[] = [{ accessorKey: 'name', header: 'Name' }]
    const groupTable = (nativeFind: boolean) => (
      <VirtualGridTable<Group>
        tableId="sticky-predicate"
        data={groups}
        columns={groupColumns}
        displayMode="table"
        nativeFind={nativeFind}
        defaultExpanded={false}
        getSubRows={(row) => row.children}
        isSubheaderRow={(row) => row.depth === 0}
        canSubheaderStick={(row) => row.original.id === 'stick'}
      />
    )

    render(groupTable(true))
    const nativeRows = [...el.querySelectorAll<HTMLElement>('.body-row.row-department')]
    expect(nativeRows.map((row) => row.textContent)).toEqual(['Stick group', 'No stick group'])
    expect(nativeRows.map((row) => row.classList.contains('native-find-sticky-subheader'))).toEqual([true, false])
    expect(el.querySelectorAll('.department-sticky-overlay')).toHaveLength(0)

    render(groupTable(false))
    const scroller = el.querySelector<HTMLElement>('.table-wrap')!
    scroller.scrollTop = 92
    act(() => scroller.dispatchEvent(new Event('scroll')))
    expect(el.querySelectorAll('.department-sticky-overlay')).toHaveLength(1)
  })

  it('keeps normal virtual rendering when native Find is off', () => {
    render(table(data(250), false))
    expect(el.querySelectorAll('.body-row').length).toBeLessThan(250)
    expect(el.querySelectorAll('.native-find-index, [data-find-index], [inert]')).toHaveLength(0)
  })

  it('keeps the complete real-text table in auto mode on a narrow viewport', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    render(table(data(10), true, { displayMode: 'auto' }))
    expect(el.querySelector('.table-inner.native-find')).not.toBeNull()
    expect(el.querySelectorAll('.body-row')).toHaveLength(10)
    expect(el.querySelector('[data-row="9"] .td')?.textContent).toBe('name9')
    expect(el.querySelectorAll('.native-find-index, [data-find-index], [inert]')).toHaveLength(0)
  })

  it('preserves rich displayed cell content and its interaction nodes', () => {
    const rich: ColumnDef<Person>[] = [
      { accessorKey: 'name', header: 'Name', cell: () => <a href="/person/1"><strong>First line</strong><span>Second line</span></a> },
      { accessorKey: 'city', header: 'City', cell: () => <button type="button" onClick={() => {}}>Open</button> },
    ]
    render(<VirtualGridTable<Person> tableId="rich" data={data(1)} columns={rich} displayMode="table" nativeFind />)
    const row = el.querySelector('.body-row')!
    expect(row.querySelector('a[href="/person/1"]')?.textContent).toBe('First lineSecond line')
    expect(row.querySelector('button')?.textContent).toBe('Open')
    expect(row.querySelector('[inert]')).toBeNull()
  })

  it('keeps native cell text in sorted order and updates it when data is filtered', () => {
    const people = data(4)
    const sorted = table(people, true, { sorting: [{ id: 'name', desc: true }] })
    render(sorted)
    const names = [...el.querySelectorAll('.body-row')].map((row) => row.querySelector('.td')?.textContent)
    expect(names).toEqual(['name3', 'name2', 'name1', 'name0'])

    act(() => root!.render(table(people.filter((person) => person.city === 'Oslo'), true, { sorting: [{ id: 'name', desc: true }] })))
    expect([...el.querySelectorAll('.body-row')].map((row) => row.querySelector('.td')?.textContent)).toEqual(['name3', 'name1'])
    expect(el.querySelectorAll('.native-find-index, [data-find-index], [inert]')).toHaveLength(0)
  })
})
