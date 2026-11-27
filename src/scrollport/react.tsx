import { useRef, type CSSProperties } from 'react'
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
  const scrollerRef = useRef<HTMLDivElement>(null)
  const rows = []
  for (let i = 0; i < rowCount; i++) {
    rows.push(
      <div
        key={i}
        data-row={i}
        className={`sp-row${i % 2 ? ' sp-row-odd' : ''}`}
        style={{ top: i * rowHeight, height: rowHeight, contentVisibility: 'auto', containIntrinsicSize: `${rowHeight}px` }}
      >
        {getRow(i).map((value, column) => <span key={column} className="sp-cell" style={{ left: indent + column * columnWidth, width: columnWidth }}>{value}</span>)}
      </div>,
    )
  }
  return (
    <div ref={scrollerRef} id={id} className={`sp-grid${className ? ` ${className}` : ''}`} style={{ height }}>
      <div className="sp-host" style={{ height: rowCount * rowHeight, minWidth: columns * columnWidth + indent }}>
        {rows}
      </div>
    </div>
  )
}

/** Renders ordinary text inside a cell. Native Find searches and paints this same text node. */
export function CellText({ text, className }: { text: string; className?: string }) {
  return <span className={className}>{text}</span>
}
