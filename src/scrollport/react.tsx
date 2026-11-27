import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import './scrollport.css'

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
}

/** A virtual grid with native find. Each searchable string is the text shown in its row. */
export function NativeFindGrid(props: NativeFindGridProps) {
  const { rowCount, columns, getRow, rowHeight = 32, columnWidth = 120, height = 'min(960px, 60vh)', id, className } = props
  const indent = 8
  const hostRef = useRef<HTMLDivElement>(null)
  const pinnedGroupRef = useRef<HTMLElement | null>(null)
  const rowsPerGroup = 250
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
      group.style.contentVisibility = 'auto'
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
      <div id={id} className={`sp-grid${className ? ` ${className}` : ''}`} style={{ height }} onScroll={(event) => revealVisibleGroups(event.currentTarget, hostRef.current, rowHeight, rowsPerGroup, pinnedGroupRef.current)}>
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
