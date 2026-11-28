import type { RefObject } from 'react'
import type { NativeFindOptions, NativeFindSource } from './scrollport/core'
import type { Row } from '@tanstack/react-table'
import { createNativeFind, type NativeFind } from './scrollport/core'
import { IndexedText, NativeFindGrid, useFindIndex, useNativeFind, type UseFindIndexOptions } from './scrollport/react'
import { VirtualGridTable, type ColumnMeta } from './components/VirtualGridTable'

type RowData = { id: string }
export const meta: ColumnMeta<RowData> = { findText: row => row.original.id }
export const observeFind = (find: NativeFind | null) => find?.audit('needle')
/** Deprecated members stay in the type. This line fails to compile when one is removed. */
export const readDeprecated = (find: NativeFind): string => {
  find.reset()
  return find.query
}
export const createFind = (scroller: HTMLElement, host: HTMLElement) =>
  createNativeFind({ scroller, host, rowCount: 1, rowHeight: 32, getRowText: () => 'needle' })
export const sampleHooks = (scroller: RefObject<HTMLElement>, host: RefObject<HTMLElement>) => ({
  grid: useNativeFind({ rowCount: 1, rowHeight: 32, getRowText: () => 'needle', onFind: observeFind }),
  local: useFindIndex(scroller, host, { rowCount: 1, rowHeight: 32, getRowText: () => 'needle', onFind: observeFind }),
})
export const grid = <NativeFindGrid rowCount={1} columns={1} getRow={() => ['needle']} onFind={observeFind} />
export const cell = <IndexedText text="needle" as="strong" />
export const table = <VirtualGridTable<RowData> tableId="sample" data={[{ id: 'needle' }]} columns={[]} nativeFind onFind={observeFind} />

export function readFirstSourceCell(source: NativeFindSource) {
  if (!source.getRowCells) return source.getRowText(0)
  return source.getRowCells(0)[0]?.trim()
}

export function readFirstColumn(source: NativeFindSource) {
  if (source.getRowCells) return source.columns[0].start
  return undefined
}

export function readComposedOptions(options: NativeFindOptions) {
  if (options.getRowCells) return options.columns[0].start + options.getRowCells(0)[0].trim().length
  return options.getRowText(0).length
}

export function readHookOptions(options: UseFindIndexOptions) {
  return options.getRowCells?.(0)[0].trim()
}

export function formatMetaText(meta: ColumnMeta<RowData>, row: Row<RowData>) {
  return meta.findText?.(row).toLowerCase()
}
