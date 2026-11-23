import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { IndexedText } from '../scrollport/react'
import type { NativeFind } from '../scrollport/core'
import { VirtualGridTable, type ColumnMeta } from './VirtualGridTable'

type Person = { id: number; name: string; city: string; score: number; sub?: Person[] }

const people = (n: number, from = 0): Person[] =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, name: `name${from + i}`, city: i % 2 ? 'Oslo' : 'Riga', score: (i * 7) % 50 }))

const columns: ColumnDef<Person>[] = [
  { accessorKey: 'name', header: 'Name', size: 200, meta: { fixed: true } as ColumnMeta<Person>, cell: ({ row }) => <IndexedText text={row.original.name} /> },
  {
    accessorKey: 'score',
    header: 'Score',
    size: 100,
    meta: { numeric: true, findText: (row) => `${row.original.score} pts` } as ColumnMeta<Person>,
    cell: ({ row }) => <IndexedText text={`${row.original.score} pts`} />,
  },
  { accessorKey: 'city', header: 'City', size: 140 }, // no findText: the index uses the plain value
]

describe('VirtualGridTable with native find', () => {
  let root: Root | undefined
  let el: HTMLDivElement

  beforeAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  })

  afterEach(() => {
    act(() => root?.unmount())
    el.remove()
    window.localStorage.clear()
  })

  const render = (node: React.ReactNode) => {
    el = document.createElement('div')
    document.body.append(el)
    root = createRoot(el)
    act(() => root!.render(node))
  }
  const table = (data: Person[], extra: Partial<React.ComponentProps<typeof VirtualGridTable<Person>>> = {}) => (
    <VirtualGridTable<Person> tableId="t" data={data} columns={columns} displayMode="table" nativeFind {...extra} />
  )
  const lines = (k = 0) => (el.querySelector(`[data-sp-chunk="${k}"]`)!.firstChild as Text).data.split('\n').map((l) => l.split(/\t+/).filter(Boolean))

  it('holds the cell text of every row, in the order of the table, one chunk per 100 rows', () => {
    render(table(people(250)))
    expect(el.querySelectorAll('[data-sp-chunk]')).toHaveLength(3)
    expect(lines(0)[0]).toEqual(['name0', '0 pts', 'Riga'])
    expect(lines(2)[49]).toEqual(['name249', `${(249 * 7) % 50} pts`, 'Oslo'])
  })

  it('puts the first row below the header', () => {
    render(table(people(10)))
    expect(el.querySelector<HTMLElement>('[data-sp-chunk]')!.style.top).toBe('46px')
  })

  it('draws no index when native find is off or in card mode', () => {
    render(table(people(10), { nativeFind: false }))
    expect(el.querySelectorAll('[data-sp-chunk]')).toHaveLength(0)
    act(() => root!.unmount())
    el.remove()
    render(table(people(10), { displayMode: 'card' }))
    expect(el.querySelectorAll('[data-sp-chunk]')).toHaveLength(0)
  })

  it('builds the index again, in the new order, after a sort', () => {
    const sorted: SortingState = [{ id: 'score', desc: true }]
    render(table(people(250), { sorting: [] }))
    const before = lines(0)[0][0]
    act(() => root!.render(table(people(250), { sorting: sorted, onSortingChange: () => {} })))
    expect(lines(0)[0][0]).not.toBe(before)
    const scores = lines(0).map((l) => Number(l[1].split(' ')[0]))
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('builds the index again for a filter or new data', () => {
    let find: NativeFind | null = null
    const onFind = (f: NativeFind | null) => (find = f)
    render(table(people(250), { onFind }))
    expect(find!.chunkCount).toBe(3)
    act(() => root!.render(table(people(250).filter((p) => p.city === 'Oslo'), { onFind })))
    expect(find!.chunkCount).toBe(2) // 125 rows left
    expect(lines(0).every((l) => l[2] === 'Oslo')).toBe(true)
    act(() => root!.render(table(people(30, 1000), { onFind })))
    expect(lines(0)[0][0]).toBe('name1000')
  })

  it('follows the expanded rows of a tree, with the group row in its place', () => {
    const tree: Person[] = [{ id: 1, name: 'group', city: '', score: 1, sub: people(150, 10) }]
    render(
      table(tree, {
        getSubRows: (row) => row.sub,
        defaultExpanded: true,
        getRowId: (row) => String(row.id) + row.name,
      }),
    )
    expect(el.querySelectorAll('[data-sp-chunk]')).toHaveLength(2) // 151 rows
    expect(lines(0)[0][0]).toBe('group')
    expect(lines(0)[1][0]).toBe('name10')
    act(() => root!.unmount())
    el.remove()
    window.localStorage.clear() // the first table saved its expanded state
    render(table(tree, { getSubRows: (row) => row.sub, defaultExpanded: false, getRowId: (row) => String(row.id) + row.name }))
    expect(el.querySelectorAll('[data-sp-chunk]')).toHaveLength(1) // the group row alone
  })

  it('puts the right-aligned column text inside its own cell', () => {
    render(table(people(5)))
    // columns: name 200 px (0..200), score 100 px (200..300), city 140 px. Padding is 1.25rem = 20 px. The tab stop is 10 px.
    const line = (el.querySelector('[data-sp-chunk="0"]')!.firstChild as Text).data.split('\n')[1]
    const cw = 7 // the test DOM draws nothing: the core falls back to 7 px per character
    const starts: number[] = []
    let pos = 0
    let inText = false
    for (const ch of line) {
      if (ch === '\t') {
        const before = pos
        pos = (Math.floor(pos / 10 + 1e-6) + 1) * 10
        if (pos - before < cw / 2 - 1e-6) pos += 10 // browsers skip a tab stop closer than half a character
        inText = false
      } else {
        if (!inText) starts.push(pos)
        inText = true
        pos += cw
      }
    }
    expect(line.split(/\t+/).filter(Boolean)).toEqual(['name1', '7 pts', 'Oslo'])
    expect(starts[1]).toBeGreaterThan(200)
    expect(starts[1] + 5 * cw).toBeLessThanOrEqual(300 + 5) // ends at the right edge of the score cell, within half a tab stop
    expect(starts[2]).toBeGreaterThanOrEqual(300 + 20 - 5) // the city cell starts after the score cell
  })

  it('indexes a cell with several lines as placed spans and moves no other cell', () => {
    const two: ColumnDef<Person>[] = [
      {
        accessorKey: 'name',
        header: 'Name',
        size: 200,
        meta: {
          fixed: true,
          findText: (row) => [`@${row.original.name}`, `Name of ${row.original.id}`],
          findLines: [
            { dx: 30, dy: -7 },
            { dx: 30, dy: 9 },
          ],
        } as ColumnMeta<Person>,
        cell: ({ row }) => <IndexedText text={row.original.name} />,
      },
      columns[2],
    ]
    render(<VirtualGridTable<Person> tableId="t2" data={people(5)} columns={two} displayMode="table" nativeFind />)
    const chunk = el.querySelector('[data-sp-chunk="0"]')!
    const spans = [...chunk.querySelectorAll<HTMLElement>(':scope > span')]
    expect(spans.map((sp) => sp.textContent).slice(0, 4)).toEqual(['@name0', 'Name of 0', '@name1', 'Name of 1'])
    expect(spans[0].style.left).toBe('50px') // cell padding 20 px + dx 30
    expect(spans[0].style.top).toBe('-7px')
    expect(spans[3].style.top).toBe(`${46 + 9}px`) // the second row of the chunk
    const text = [...chunk.childNodes].filter((n) => n.nodeType === 3).map((n) => (n as Text).data).join('')
    expect(text.split('\n')[1].split(/\t+/).filter(Boolean)).toEqual(['Oslo']) // the lines are not in the row text
  })
})
