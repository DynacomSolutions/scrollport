import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createNativeFind, type NativeFind, type NativeFindBase, type NativeFindCell, type NativeFindColumn, type NativeFindSource } from './core'
import './scrollport.css'

export type UseFindIndexOptions = Omit<NativeFindBase, 'scroller' | 'host' | 'onActiveRow'> & {
  /** Text of one row (visible index). Use this or `getRowCells` with `columns`. Pass a stable function. */
  getRowText?: (row: number) => string
  /** Text of the cells of one row (transparent index). Needs `columns`. Pass a stable function. */
  getRowCells?: (row: number) => readonly NativeFindCell[]
  /** Position of each column (transparent index). Pass a stable array: the index is built again when it changes. */
  columns?: readonly NativeFindColumn[]
  /** Build the index. Default true. Use false while the scroller is not in the page. */
  enabled?: boolean
  /** How long the active row stays marked, in ms. */
  activeRowMs?: number
  /** Called with the core object when it is ready, and with `null` when it is gone. Pass a stable function. */
  onFind?: (find: NativeFind | null) => void
}

/**
 * Builds the native find index inside a scroller and a host element that you render, and removes it again. The index is
 * built again when the row count or an accessor changes (sort, filter, new data). Returns the row that the browser
 * selected last (Firefox only).
 */
export function useFindIndex(scrollerRef: RefObject<HTMLElement>, hostRef: RefObject<HTMLElement>, options: UseFindIndexOptions) {
  const {
    rowCount,
    rowHeight,
    rowTop,
    charWidth,
    tabQuantum,
    zIndex,
    getRowText,
    getRowCells,
    columns,
    rowsPerChunk,
    sparseMaxChunks,
    tabSize,
    indent,
    enabled = true,
    activeRowMs = 1500,
    onFind,
  } = options
  const [activeRow, setActiveRow] = useState(-1)

  useEffect(() => {
    const scroller = scrollerRef.current
    const host = hostRef.current
    if (!enabled || !scroller || !host) return
    const source: NativeFindSource | null =
      getRowCells && columns ? { getRowCells, columns } : getRowText ? { getRowText } : null
    if (!source) return
    let timer = 0
    const find = createNativeFind({
      scroller,
      host,
      rowCount,
      rowHeight,
      rowTop,
      charWidth,
      tabQuantum,
      zIndex,
      rowsPerChunk,
      sparseMaxChunks,
      tabSize,
      indent,
      ...source,
      onActiveRow: (row) => {
        setActiveRow(row)
        clearTimeout(timer)
        timer = window.setTimeout(() => setActiveRow(-1), activeRowMs)
      },
    })
    onFind?.(find)
    return () => {
      clearTimeout(timer)
      find.destroy()
      onFind?.(null)
    }
  }, [
    scrollerRef,
    hostRef,
    enabled,
    rowCount,
    rowHeight,
    rowTop,
    charWidth,
    tabQuantum,
    zIndex,
    getRowText,
    getRowCells,
    columns,
    rowsPerChunk,
    sparseMaxChunks,
    tabSize,
    indent,
    activeRowMs,
    onFind,
  ])

  return { activeRow }
}

export type UseNativeFindOptions = Omit<UseFindIndexOptions, 'getRowCells' | 'columns' | 'enabled' | 'rowTop' | 'getRowText'> & {
  getRowText: (row: number) => string
}

type View = { first: number; end: number }

/**
 * Connects a scroller and a host element to the core, for a grid that draws only row backgrounds. Pass a stable
 * `getRowText` (for example from `useCallback`): the index is built again when it changes. Returns the rows to draw
 * and the row that the browser selected last.
 */
export function useNativeFind(options: UseNativeFindOptions) {
  const { rowCount, rowHeight } = options
  const scrollerRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ first: 0, end: Math.min(rowCount, 40) })

  // The rows in view, plus a few spare rows. The scroller is an external system, so this is an effect.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    let frame = 0
    const measure = () => {
      frame = 0
      const first = Math.max(0, Math.floor(scroller.scrollTop / rowHeight) - 1)
      const end = Math.min(rowCount, first + Math.ceil(scroller.clientHeight / rowHeight) + 3)
      setView((v) => (v.first === first && v.end === end ? v : { first, end }))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    scroller.addEventListener('scroll', schedule, { passive: true })
    const resize = new ResizeObserver(schedule)
    resize.observe(scroller)
    return () => {
      cancelAnimationFrame(frame)
      scroller.removeEventListener('scroll', schedule)
      resize.disconnect()
    }
  }, [rowCount, rowHeight])

  const { activeRow } = useFindIndex(scrollerRef, hostRef, options)
  return { scrollerRef, hostRef, first: view.first, end: view.end, activeRow }
}

export type NativeFindGridProps = {
  rowCount: number
  /** Number of cells in a row. */
  columns: number
  /** Cells of one row, as text. Pass a stable function (for example from `useCallback`). */
  getRow: (row: number) => readonly string[]
  rowHeight?: number
  columnWidth?: number
  height?: CSSProperties['height']
  id?: string
  className?: string
  /** Called with the core object when it is ready, and with `null` when it is gone. Pass a stable function. */
  onFind?: (find: NativeFind | null) => void
}

/** A virtual grid with native find. The grid draws only the row backgrounds. The text is the hidden index. */
export function NativeFindGrid(props: NativeFindGridProps) {
  const { rowCount, columns, getRow, rowHeight = 32, columnWidth = 120, height = 'min(960px, 60vh)', id, className, onFind } = props
  const indent = 8
  const getRowText = useCallback((row: number) => getRow(row).join('\t'), [getRow])
  const find = useNativeFind({ rowCount, rowHeight, getRowText, tabSize: columnWidth, indent, onFind })
  const rows = []
  for (let i = find.first; i < find.end; i++) {
    rows.push(
      <div
        key={i}
        data-row={i}
        className={`sp-row${i % 2 ? ' sp-row-odd' : ''}${i === find.activeRow ? ' sp-row-active' : ''}`}
        style={{ top: i * rowHeight, height: rowHeight }}
      />,
    )
  }
  return (
    <div ref={find.scrollerRef} id={id} className={`sp-grid${className ? ` ${className}` : ''}`} style={{ height }}>
      <div ref={find.hostRef} className="sp-host" style={{ height: rowCount * rowHeight, minWidth: columns * columnWidth + indent }}>
        {rows}
      </div>
    </div>
  )
}

/**
 * Text that the find bar cannot see, for the cells of a table with a transparent native find index. The index holds the
 * same text, so a row that is in view adds no second match. The element is `inert`: the browser skips its text in find
 * (checked in Chromium 157 and Firefox 160; CSS text from `::before` is skipped by Chromium but found by Firefox).
 * `inert` also stops text selection and hides the text from assistive technology.
 */
const INERT = { inert: '' } as object

export function IndexedText({ text, className, as: Tag = 'span' }: { text: string; className?: string; as?: 'span' | 'strong' | 'mark' }) {
  return (
    <Tag className={className} {...INERT}>
      {text}
    </Tag>
  )
}
