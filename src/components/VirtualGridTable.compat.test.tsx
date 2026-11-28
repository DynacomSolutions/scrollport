import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ColumnDef } from '@tanstack/react-table'
import { NativeFindTableDemo } from '../App'
import { VirtualGridTable } from './VirtualGridTable'
import type { NativeFind } from '../scrollport/core'
import type { ColumnMeta } from './VirtualGridTable'

type Person = { id: number; name: string; city: string }
const columnMeta: ColumnMeta<Person> = { findText: (row) => `${row.original.name} shown` }
const columns: ColumnDef<Person>[] = [
  { accessorKey: 'name', header: 'Name', meta: columnMeta, cell: ({ row }) => <span><strong>{row.original.name}</strong><em> shown</em></span> },
  { accessorKey: 'city', header: 'City' },
]

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
  window.localStorage.clear()
})

describe('VirtualGridTable compatibility observer', () => {
  it('reports real table text on mount, data update, and unmount', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root: Root = createRoot(element)
    const events: (string | null)[] = []
    const controllers: NativeFind[] = []
    const onFind = (find: NativeFind | null) => {
      events.push(find ? find.mode : null)
      if (find) controllers.push(find)
    }
    const render = (data: Person[]) => (
      <VirtualGridTable<Person> tableId="compat" data={data} columns={columns} nativeFind displayMode="table" onFind={onFind} />
    )

    act(() => root.render(render([{ id: 1, name: 'First', city: 'Oslo' }])))
    expect(events).toEqual(['full'])
    expect(element.querySelector('[data-row="0"] .td')?.textContent).toBe('First shown')
    expect(controllers[0].audit('First')).toMatchObject({ expected: 1, findable: 1, total: 1, corrupt: [] })
    act(() => root.render(render([{ id: 2, name: 'Second', city: 'Riga' }])))
    expect(events).toEqual(['full', null, 'full'])
    expect(element.querySelector('[data-row="0"] .td')?.textContent).toBe('Second shown')
    act(() => root.unmount())
    expect(events).toEqual(['full', null, 'full', null])
    element.remove()
  })

  it('rebuilds its observer when visible columns change with stable data and callback', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root: Root = createRoot(element)
    const events: (string | null)[] = []
    const onFind = (find: NativeFind | null) => events.push(find ? find.mode : null)
    const rows = [{ id: 1, name: 'nameword', city: 'tagword' }]
    const firstColumns: ColumnDef<Person>[] = [{ accessorKey: 'name', header: 'Name' }]
    const nextColumns: ColumnDef<Person>[] = [{ accessorKey: 'city', header: 'Tag' }]
    const latest: { value: NativeFind | null } = { value: null }
    const observe = (find: NativeFind | null) => { latest.value = find; onFind(find) }
    act(() => root.render(<VirtualGridTable<Person> tableId="column-update" data={rows} columns={firstColumns} nativeFind displayMode="table" onFind={observe} />))
    expect(latest.value?.audit('nameword')).toMatchObject({ expectedOccurrences: 1, total: 1 })
    act(() => root.render(<VirtualGridTable<Person> tableId="column-update" data={rows} columns={nextColumns} nativeFind displayMode="table" onFind={observe} />))
    expect(events).toEqual(['full', null, 'full'])
    expect(latest.value?.audit('tagword')).toMatchObject({ expectedOccurrences: 1, total: 1, corrupt: [] })
    act(() => root.unmount())
    element.remove()
  })

  it('reports one rendered table row per attached chunk', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root = createRoot(element)
    const observed: { value: NativeFind | null } = { value: null }
    const rows = [1, 2, 3].map((id) => ({ id, name: `name${id}`, city: `city${id}` }))
    act(() => root.render(<VirtualGridTable<Person> tableId="row-count" data={rows} columns={columns} nativeFind displayMode="table" onFind={(find) => { observed.value = find }} />))
    expect(observed.value?.chunkCount).toBe(3)
    expect(observed.value?.attachedChunks).toBe(3)
    act(() => root.unmount())
    element.remove()
  })

  it('audits App cells against their formatted displayed text', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const root: Root = createRoot(element)
    const latest: { value: NativeFind | null } = { value: null }
    act(() => root.render(<NativeFindTableDemo rowCount={100} onFind={(find) => { latest.value = find }} />))
    expect(latest.value?.audit('Open profile')).toMatchObject({ expectedOccurrences: 100, total: 100, corrupt: [] })
    act(() => root.unmount())
    element.remove()
  })

})
