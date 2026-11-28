import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createNativeFind, type NativeFind, type NativeFindBase, type NativeFindCell, type NativeFindColumn, type NativeFindRichSource, type NativeFindSource } from './core'
import './scrollport.css'

export type UseFindIndexOptions = Omit<NativeFindBase, 'scroller' | 'host' | 'onActiveRow'> & {
  getRowText?: (row: number) => string
  getRowCells?: (row: number) => readonly string[]
  getRichRowCells?: (row: number) => readonly NativeFindCell[]
  columns?: readonly NativeFindColumn[]
  enabled?: boolean
  activeRowMs?: number
  /** Number of source rows in one rendered group. */
  rowsPerChunk?: number
  /**
   * Fill empty `.sp-row[data-row]` placeholders in the host with cell text from the source accessor.
   * Default `false`: the hook only observes text that the caller already renders. `useNativeFind` sets it to `true`.
   */
  materializeRows?: boolean
  /** Change this value to fill placeholder rows again, for example when a windowed grid shows other rows. */
  materializeKey?: string | number
  onFind?: (find: NativeFind | null) => void
}

/** Observe real text and report the controller lifecycle. */
export function useFindIndex(scrollerRef: RefObject<HTMLElement>, hostRef: RefObject<HTMLElement>, options: UseFindIndexOptions) {
  const { rowCount, rowHeight, getRowText, getRowCells, getRichRowCells, columns, enabled = true, activeRowMs = 1500, materializeRows = false, materializeKey, onFind, ...base } = options
  const tabSize = options.tabSize ?? 120
  const indent = options.indent ?? 8
  const [activeRow, setActiveRow] = useState(-1)
  useEffect(() => {
    const scroller = scrollerRef.current
    const host = hostRef.current
    if (!enabled || !scroller || !host) return
    const source: NativeFindSource | NativeFindRichSource | null = getRichRowCells
      ? { getRichRowCells, columns }
      : getRowCells && columns
        ? { getRowCells, columns }
        : getRowText
          ? { getRowText }
          : null
    if (!source) return
    let timer = 0
    const ownedCells: HTMLElement[] = []
    const rowStyles = new Map<HTMLElement, { display: string; gridTemplateColumns: string; paddingLeft: string; boxSizing: string; height: string }>()
    const placeholders = materializeRows ? host.querySelectorAll<HTMLElement>('.sp-row[data-row]') : []
    for (const row of placeholders) {
      if (row.childNodes.length) continue
      const rowIndex = Number(row.dataset.row)
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rowCount) continue
      const cells: readonly NativeFindCell[] = getRichRowCells
        ? getRichRowCells(rowIndex)
        : getRowCells
          ? getRowCells(rowIndex)
          : (getRowText?.(rowIndex) ?? '').split('\t')
      rowStyles.set(row, { display: row.style.display, gridTemplateColumns: row.style.gridTemplateColumns, paddingLeft: row.style.paddingLeft, boxSizing: row.style.boxSizing, height: row.style.height })
      row.style.display = 'grid'
      row.style.gridTemplateColumns = `repeat(${Math.max(1, cells.length)}, ${tabSize}px)`
      row.style.paddingLeft = `${indent}px`
      row.style.boxSizing = 'border-box'
      row.style.height = `${rowHeight}px`
      for (const value of cells) {
        const cell = host.ownerDocument.createElement('span')
        cell.className = 'sp-cell'
        cell.style.height = '100%'
        if (typeof value === 'string') {
          cell.textContent = value.replace(/[\t\r\n]+/g, ' ')
        } else {
          const lines = value.map((line) => typeof line === 'string' ? line : line.text)
          lines.forEach((line, index) => {
            if (index) cell.append(host.ownerDocument.createElement('br'))
            cell.append(host.ownerDocument.createTextNode(line))
          })
        }
        row.append(cell)
        ownedCells.push(cell)
      }
    }
    const find = createNativeFind({ scroller, host, rowCount, rowHeight, ...base, ...source, onActiveRow: (row) => {
      setActiveRow(row)
      clearTimeout(timer)
      timer = window.setTimeout(() => setActiveRow(-1), activeRowMs)
    } })
    onFind?.(find)
    return () => {
      clearTimeout(timer)
      find.destroy()
      for (const cell of ownedCells) cell.remove()
      for (const [row, style] of rowStyles) {
        row.style.display = style.display
        row.style.gridTemplateColumns = style.gridTemplateColumns
        row.style.paddingLeft = style.paddingLeft
        row.style.boxSizing = style.boxSizing
        row.style.height = style.height
      }
      onFind?.(null)
    }
  }, [scrollerRef, hostRef, rowCount, rowHeight, getRowText, getRowCells, columns, enabled, activeRowMs, onFind,
    base.rowTop, base.charWidth, base.font, base.baseline, base.tabQuantum, base.zIndex, base.rowsPerChunk,
    base.sparseMaxChunks, base.tabSize, base.indent, materializeRows, materializeKey, getRichRowCells])
  return { activeRow }
}

export type UseNativeFindOptions = Omit<UseFindIndexOptions, 'getRowCells' | 'getRichRowCells' | 'columns' | 'enabled' | 'rowTop' | 'getRowText' | 'materializeRows' | 'materializeKey'> & {
  getRowText: (row: number) => string
  /**
   * Render every row (`first` is 0 and `end` is `rowCount`) so that browser Find reaches all of them.
   * Default `false`: the hook returns a window of rows near the viewport, as before. Find then covers that window only.
   * With `true` the caller must accept one DOM row for each source row.
   */
  renderAllRows?: boolean
}

type View = { first: number; end: number }

/**
 * Provide scroller and host references, the rows to draw, and the row that the browser selected last.
 * The hook fills each `.sp-row[data-row]` placeholder in the window with real cell text.
 * Browser Find reaches the rows in the window only, unless `renderAllRows` is `true`.
 * For a grid of many rows that Find must reach, use `NativeFindGrid`.
 */
export function useNativeFind(options: UseNativeFindOptions) {
  const { rowCount, rowHeight, renderAllRows = false, ...rest } = options
  const scrollerRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ first: 0, end: Math.min(rowCount, 40) })

  // The rows in view, plus a few spare rows. The scroller is an external system, so this is an effect.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (renderAllRows || !scroller) return
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
  }, [rowCount, rowHeight, renderAllRows])

  const first = renderAllRows ? 0 : Math.min(view.first, rowCount)
  const end = renderAllRows ? rowCount : Math.min(view.end, rowCount)
  const { activeRow } = useFindIndex(scrollerRef, hostRef, { ...rest, rowCount, rowHeight, materializeRows: true, materializeKey: `${first}:${end}` })
  return { scrollerRef, hostRef, first, end, activeRow }
}

/** Render one ordinary text occurrence. */
export function IndexedText({ text, className, as: Tag = 'span' }: { text: string; className?: string; as?: 'span' | 'strong' | 'mark' }) {
  return <Tag className={className}>{text}</Tag>
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
  onFind?: (find: NativeFind | null) => void
}

/** A virtual grid with native find. Each searchable string is the text shown in its row. */
export function NativeFindGrid(props: NativeFindGridProps) {
  const { rowCount, columns, getRow, rowHeight = 32, columnWidth = 120, height = 'min(960px, 60vh)', id, className, onFind } = props
  const indent = 8
  const hostRef = useRef<HTMLDivElement>(null)
  const pinnedGroupRef = useRef<HTMLElement | null>(null)
  const rowsPerGroup = 250
  const scrollerRef = useRef<HTMLDivElement>(null)
  const getRowText = useCallback((row: number) => getRow(row).slice(0, columns).join('\t'), [columns, getRow])
  useFindIndex(scrollerRef, hostRef, { rowCount, rowHeight, rowsPerChunk: rowsPerGroup, getRowText, onFind, enabled: Boolean(onFind) })
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const fragment = document.createDocumentFragment()
    for (let start = 0; start < rowCount; start += rowsPerGroup) {
      const end = Math.min(start + rowsPerGroup, rowCount)
      const group = document.createElement('div')
      group.className = 'sp-row-group'
      group.dataset.groupStart = String(start)
      group.dataset.groupCount = String(end - start)
      group.style.display = 'grid'
      group.style.gridTemplateColumns = `repeat(${columns}, ${columnWidth}px)`
      group.style.gridAutoRows = `${rowHeight}px`
      group.style.paddingLeft = `${indent}px`
      group.style.width = 'max-content'
      group.style.minWidth = '100%'
      group.style.boxSizing = 'border-box'
      group.setAttribute('hidden', 'until-found')
      group.style.containIntrinsicSize = `${(end - start) * rowHeight}px`

      for (let i = start; i < end; i++) {
        const values = getRow(i)
        for (let column = 0; column < columns; column++) {
          const cell = document.createElement('span')
          cell.className = `sp-cell${i % 2 ? ' sp-cell-odd' : ''}`
          cell.dataset.row = String(i)
          cell.textContent = values[column] ?? ''
          group.append(cell)
        }
      }
      fragment.append(group)
    }
    host.append(fragment)
    pinnedGroupRef.current = null
    const pinRevealedGroup = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const group = target.closest<HTMLElement>('.sp-row-group')
      if (group && host.contains(group)) pinnedGroupRef.current = group
    }
    host.addEventListener('beforematch', pinRevealedGroup, true)
    const scroller = host.closest<HTMLElement>('.sp-grid')
    if (scroller) revealVisibleGroups(scroller, host, rowHeight, rowsPerGroup, pinnedGroupRef.current)

    return () => {
      host.removeEventListener('beforematch', pinRevealedGroup, true)
      pinnedGroupRef.current = null
      host.replaceChildren()
    }
  }, [columns, columnWidth, getRow, rowCount, rowHeight])
  return (
      <div ref={scrollerRef} id={id} className={`sp-grid${className ? ` ${className}` : ''}`} style={{ height }} onScroll={(event) => revealVisibleGroups(event.currentTarget, hostRef.current, rowHeight, rowsPerGroup, pinnedGroupRef.current)}>
      <div ref={hostRef} className="sp-host" style={{ minWidth: columns * columnWidth + indent }} />
    </div>
  )
}


function revealVisibleGroups(scroller: HTMLElement, host: HTMLElement | null, rowHeight: number, rowsPerGroup: number, pinnedGroup: HTMLElement | null = null) {
  if (!host) return
  const firstVisible = Math.max(0, scroller.scrollTop - rowsPerGroup * rowHeight)
  const lastVisible = scroller.scrollTop + scroller.clientHeight + rowsPerGroup * rowHeight
  for (const group of host.children) {
    if (!(group instanceof HTMLElement)) continue
    const firstRow = Number(group.dataset.groupStart)
    const groupTop = firstRow * rowHeight
    const groupBottom = groupTop + Number(group.dataset.groupCount) * rowHeight
    if (group === pinnedGroup) continue
    if (groupBottom >= firstVisible && groupTop <= lastVisible) group.removeAttribute('hidden')
    else group.setAttribute('hidden', 'until-found')
  }
}

/** Renders ordinary text inside a cell. Native Find searches and paints this same text node. */
export function CellText({ text, className }: { text: string; className?: string }) {
  return <span className={className}>{text}</span>
}
