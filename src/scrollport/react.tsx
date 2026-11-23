import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createNativeFind, type NativeFind, type NativeFindOptions } from './core'
import './scrollport.css'

export type UseNativeFindOptions = Omit<NativeFindOptions, 'scroller' | 'host' | 'onActiveRow'> & {
  /** How long the active row stays marked, in ms. */
  activeRowMs?: number
  /** Called with the core object when it is ready, and with `null` when it is gone. Pass a stable function. */
  onFind?: (find: NativeFind | null) => void
}

type View = { first: number; end: number }

/**
 * Connects a scroller and a host element to the core. Pass a stable `getRowText` (for example from `useCallback`):
 * the index is built again when it changes. Returns the rows to draw and the row that the browser selected last.
 */
export function useNativeFind(options: UseNativeFindOptions) {
  const { rowCount, rowHeight, getRowText, rowsPerChunk, sparseMaxChunks, tabSize, indent, activeRowMs = 1500, onFind } = options
  const scrollerRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ first: 0, end: Math.min(rowCount, 40) })
  const [activeRow, setActiveRow] = useState(-1)

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

  // The native find index.
  useEffect(() => {
    const scroller = scrollerRef.current
    const host = hostRef.current
    if (!scroller || !host) return
    let timer = 0
    const find = createNativeFind({
      scroller,
      host,
      rowCount,
      rowHeight,
      getRowText,
      rowsPerChunk,
      sparseMaxChunks,
      tabSize,
      indent,
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
  }, [rowCount, rowHeight, getRowText, rowsPerChunk, sparseMaxChunks, tabSize, indent, activeRowMs, onFind])

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
