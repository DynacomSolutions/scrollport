import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
  type Cell,
  type Column,
  type ColumnDef,
  type ColumnSizingState,
  type ExpandedState,
  type OnChangeFn,
  type Row,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { createNativeFind, type NativeFind, type NativeFindCell } from '../scrollport/core'

export type ColumnMeta<TData extends object = object> = {
  fixed?: boolean
  minPx?: number
  numeric?: boolean
  sticky?: boolean
  /** Data description for audits. Browser Find still searches the rendered cell text. */
  findText?: (row: Row<TData>) => string
  /** Rich searchable text with explicit lines. */
  findCellText?: (row: Row<TData>) => NativeFindCell

}

/** Default row height in px. */
export const DEFAULT_ROW_HEIGHT = 46

export type TableDisplayMode = 'table' | 'card' | 'auto'

export type VirtualGridColumn<TData extends object> = ColumnDef<TData> & {
  /** A pure function that returns the displayed cell content for native Find. */
  renderNativeCell?: (row: Row<TData>) => ReactNode
}

/** One rendered column of the table: everything a row needs, so that a row can be memoised. */
type CellSpec<TData extends object> = {
  index: number
  /** An empty track of the width of the skipped columns comes before this cell. */
  gap: boolean
  column: Column<TData, unknown>
  /** Class suffix for numeric, sticky and shadow state. */
  className: string
  style: CSSProperties
  renderNativeCell?: (row: Row<TData>) => ReactNode
}

type RowLayout<TData extends object> = {
  gridTemplateColumns: string
  cells: CellSpec<TData>[]
}

type BodyRowProps<TData extends object> = {
  row: Row<TData>
  rowIndex: number
  isLast: boolean
  isSubheader: boolean
  nativeStickySubheader: boolean
  underOverlay: boolean
  /** Not read in the render. A change of the expanded state must render a memoised group row again. */
  isExpanded: boolean
  findEnabled: boolean
  rowHeight: number
  layout: RowLayout<TData>
}

function BodyRowImpl<TData extends object>({
  row,
  rowIndex,
  isLast,
  isSubheader,
  nativeStickySubheader,
  underOverlay,
  findEnabled,
  rowHeight,
  layout,
}: BodyRowProps<TData>) {
  let cellsByColumnId: Map<string, Cell<TData, unknown>> | undefined
  return (
    <div
      data-row={rowIndex}
      className={`grid-row body-row${isSubheader ? ' row-department' : ' row-user'}${
        nativeStickySubheader ? ' native-find-sticky-subheader' : ''
      }${underOverlay ? ' source-under-sticky-overlay' : ''}${isLast ? ' is-last-row' : ''}`}
      style={{
        gridTemplateColumns: layout.gridTemplateColumns,
        ...(findEnabled ? { contentVisibility: 'auto', containIntrinsicSize: `${rowHeight}px` } : {}),
      }}
    >
      <div className="edge-col edge-start sticky-edge sticky-edge-start" aria-hidden="true" />
      <div aria-hidden="true" />

      {layout.cells.flatMap((spec) => {
        const { column, renderNativeCell } = spec
        if (!renderNativeCell) {
          cellsByColumnId ??= new Map(row.getVisibleCells().map((cell) => [cell.column.id, cell]))
        }
        const cell = renderNativeCell ? undefined : cellsByColumnId?.get(column.id)
        const gap = spec.gap ? [<div key={`gap-${spec.index}`} aria-hidden="true" />] : []

        if (!cell && !renderNativeCell) {
          return [
            ...gap,
            <div
              key={`missing-${row.id}-${column.id}`}
              className={`td${spec.className}`}
              data-col={column.id}
              style={spec.style}
              aria-hidden="true"
            />,
          ]
        }

        return [
          ...gap,
          <div key={cell?.id ?? `${row.id}_${column.id}`} className={`td${spec.className}`} data-col={column.id} style={spec.style}>
            <span className="sticky-surface">
              {renderNativeCell ? renderNativeCell(row) : cell && flexRender(cell.column.columnDef.cell, cell.getContext())}
            </span>
          </div>,
        ]
      })}

      <div aria-hidden="true" />
      <div className="edge-col edge-end sticky-edge sticky-edge-end" aria-hidden="true" />
    </div>
  )
}

/** A table row that renders again only when its own props change. Hover and resize state of the table do not reach it. */
const BodyRow = memo(BodyRowImpl) as typeof BodyRowImpl

/** Escape a value for a double-quoted CSS string. */
const cssString = (value: string): string => value.replace(/[\\"]/g, '\\$&').replace(/\n/g, '\\a ')

type VirtualGridTableProps<TData extends object> = {
  tableId: string
  data: TData[]
  columns: VirtualGridColumn<TData>[]
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string
  getSubRows?: (row: TData) => TData[] | undefined
  storageKey?: string
  rowHeight?: number
  edgeGutter?: number
  isSubheaderRow?: (row: Row<TData>) => boolean
  canSubheaderStick?: (row: Row<TData>) => boolean
  autoExpandedRowIds?: string[]
  displayMode?: TableDisplayMode
  mobileBreakpoint?: number
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  autoScrollX?: 'left' | 'right' | 'off'
  /**
   * Native find renders the real table rows in the DOM. Browser Find searches and paints their displayed text.
   */
  nativeFind?: boolean
  /** Reports a passive observer for real table cells. */
  onFind?: (find: NativeFind | null) => void
  /** Start with every group row expanded when the user has no saved state. */
  defaultExpanded?: boolean
}

export function VirtualGridTable<TData extends object>({
  tableId,
  data,
  columns,
  getRowId,
  getSubRows,
  storageKey,
  rowHeight = DEFAULT_ROW_HEIGHT,
  edgeGutter = 0,
  isSubheaderRow,
  canSubheaderStick,
  autoExpandedRowIds,
  displayMode = 'auto',
  mobileBreakpoint = 900,
  sorting: controlledSorting,
  onSortingChange,
  autoScrollX = 'off',
  nativeFind = false,
  onFind,
  defaultExpanded = false,
}: VirtualGridTableProps<TData>) {
  const instanceId = useId()
  const effectiveStorageKey = storageKey ?? `table.${tableId}.column-sizing`
  const expandedStorageKey = `table.${tableId}.expanded`
  const [expanded, setExpanded] = useState<ExpandedState>(() => {
    try {
      const raw = window.localStorage.getItem(expandedStorageKey)
      if (!raw) {
        return defaultExpanded ? true : {}
      }
      const parsed = JSON.parse(raw)
      if (parsed === true) {
        return true
      }
      return typeof parsed === 'object' && parsed !== null ? (parsed as ExpandedState) : {}
    } catch {
      return {}
    }
  })
  const [scrollLeft, setScrollLeft] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [hoveredResizeColumnId, setHoveredResizeColumnId] = useState<string | null>(null)
  const [hoveredSortColumnId, setHoveredSortColumnId] = useState<string | null>(null)
  const [isShiftPressed, setIsShiftPressed] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    try {
      const raw = window.localStorage.getItem(effectiveStorageKey)
      if (!raw) {
        return {}
      }
      const parsed = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null ? (parsed as ColumnSizingState) : {}
    } catch {
      return {}
    }
  })

  const tableContainerRef = useRef<HTMLDivElement>(null)
  const tableInnerRef = useRef<HTMLDivElement>(null)
  const hasAppliedInitialAutoScrollRef = useRef(false)
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia(`(max-width: ${mobileBreakpoint}px)`).matches)
  const resolvedDisplayMode: Exclude<TableDisplayMode, 'auto'> =
    displayMode === 'auto' ? (nativeFind || !isMobileViewport ? 'table' : 'card') : displayMode
  const isNativeFindTable = nativeFind && resolvedDisplayMode === 'table'
  const effectiveSorting = controlledSorting ?? sorting
  const effectiveExpanded = useMemo<ExpandedState>(() => {
    if (!autoExpandedRowIds || autoExpandedRowIds.length === 0) {
      return expanded
    }
    if (expanded === true) {
      return true
    }
    const base = expanded ?? {}
    const next: Record<string, boolean> = { ...base }
    for (const rowId of autoExpandedRowIds) {
      next[rowId] = true
    }
    return next
  }, [autoExpandedRowIds, expanded])

  const table = useReactTable({
    data,
    columns,
    state: { expanded: effectiveExpanded, columnSizing, sorting: effectiveSorting },
    onExpandedChange: setExpanded,
    onColumnSizingChange: setColumnSizing,
    onSortingChange: onSortingChange ?? setSorting,
    getRowId,
    getSubRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    enableSorting: true,
    enableMultiSort: true,
    // Native Find renders every row. A drag would resize all of them on each pointer move, so it applies at the end.
    columnResizeMode: isNativeFindTable ? 'onEnd' : 'onChange',
    defaultColumn: {
      minSize: 90,
      size: 140,
      maxSize: 560,
    },
  })

  useEffect(() => {
    window.localStorage.setItem(effectiveStorageKey, JSON.stringify(columnSizing))
  }, [columnSizing, effectiveStorageKey])

  useEffect(() => {
    window.localStorage.setItem(expandedStorageKey, JSON.stringify(expanded))
  }, [expanded, expandedStorageKey])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setIsShiftPressed(true)
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setIsShiftPressed(false)
      }
    }
    const onBlur = () => {
      setIsShiftPressed(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${mobileBreakpoint}px)`)
    const onChange = () => {
      setIsMobileViewport(media.matches)
    }
    onChange()
    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [mobileBreakpoint])

  useEffect(() => {
    const scrollEl = tableContainerRef.current
    if (!scrollEl) {
      return
    }

    const onScroll = () => {
      if (isNativeFindTable) {
        // Native Find mode needs only "scrolled or not" for the header shadow. The state changes at the edge only.
        setScrollLeft(0)
        setScrollTop(scrollEl.scrollTop > 0 ? 1 : 0)
        return
      }
      setScrollLeft(scrollEl.scrollLeft)
      setScrollTop(scrollEl.scrollTop)
    }

    onScroll()
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
    }
  }, [isNativeFindTable])

  const rows = table.getRowModel().rows
  const sortedGroupRows = table.getSortedRowModel().rows
  const visibleColumns = table.getVisibleLeafColumns()
  const getFindRowCells = useCallback((rowIndex: number): readonly NativeFindCell[] => {
    const row = rows[rowIndex]
    if (!row) return []
    return row.getVisibleCells().map((cell) => {
      const meta = (cell.column.columnDef.meta ?? {}) as ColumnMeta<TData>
      return meta.findCellText ? meta.findCellText(row) : meta.findText ? meta.findText(row) : String(cell.getValue() ?? '')
    })
  }, [rows, visibleColumns, columns])
  useEffect(() => {
    const scroller = tableContainerRef.current
    const host = tableInnerRef.current
    if (!nativeFind || !isNativeFindTable || !onFind || !scroller || !host) return
    const find = createNativeFind({ scroller, host, rowCount: rows.length, rowHeight, getRichRowCells: getFindRowCells })
    onFind(find)
    return () => {
      find.destroy()
      onFind(null)
    }
  }, [nativeFind, isNativeFindTable, onFind, rows.length, rowHeight, getFindRowCells, columns, visibleColumns])
  const resizingColumnId = visibleColumns.find((column) => column.getIsResizing())?.id ?? null
  const highlightedResizeColumnId = resizingColumnId ?? hoveredResizeColumnId

  const colStarts: number[] = []
  let runningStart = 0
  for (const column of visibleColumns) {
    colStarts.push(runningStart)
    runningStart += column.getSize()
  }
  const totalColWidth = runningStart

  const stickyLeftById = new Map<string, number>()
  let stickyRunningLeft = 0
  for (const column of visibleColumns) {
    const meta = (column.columnDef.meta ?? {}) as ColumnMeta
    if (meta.sticky) {
      stickyLeftById.set(column.id, stickyRunningLeft)
      stickyRunningLeft += column.getSize()
    }
  }

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: visibleColumns.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (index) => visibleColumns[index]?.getSize() ?? 140,
    overscan: 4,
    enabled: !isNativeFindTable,
  })

  const findEnabled = isNativeFindTable && resolvedDisplayMode === 'table'
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: findEnabled ? 0 : 12,
    enabled: !findEnabled,
  })

  const cardGroupVirtualizer = useVirtualizer({
    count: sortedGroupRows.length,
    getScrollElement: () => tableContainerRef.current,
    enabled: resolvedDisplayMode === 'card',
    estimateSize: (index) => {
      const groupRow = sortedGroupRows[index]
      if (!groupRow) {
        return 320
      }
      const expandedSubrows = groupRow.getIsExpanded() ? groupRow.subRows.length : 0
      return 260 + expandedSubrows * 240
    },
    overscan: 3,
  })

  const allColumnItems = useMemo(() => visibleColumns.map((_, index) => ({ index })), [visibleColumns])
  const virtualColumns = findEnabled ? allColumnItems : columnVirtualizer.getVirtualItems()
  const nativeCellRenderers = findEnabled
    ? visibleColumns.map((column) => (column.columnDef as VirtualGridColumn<TData>).renderNativeCell)
    : []
  const virtualRows = rowVirtualizer.getVirtualItems()
  const findRowIndices = useMemo(() => (findEnabled ? rows.map((_, index) => index) : []), [findEnabled, rows])
  const rowIndices = findEnabled ? findRowIndices : virtualRows.map((item) => item.index)

  const stickyIndices = visibleColumns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => ((column.columnDef.meta ?? {}) as ColumnMeta).sticky)
    .map(({ index }) => index)

  const stickyActiveThresholdByIndex = new Map<number, number>()
  for (const index of stickyIndices) {
    const column = visibleColumns[index]
    const stickyLeft = stickyLeftById.get(column.id) ?? edgeGutter
    const naturalLeft = edgeGutter + (colStarts[index] ?? 0)
    stickyActiveThresholdByIndex.set(index, Math.max(0, naturalLeft - stickyLeft))
  }

  const activeStickyIndices = stickyIndices.filter(
    (index) => scrollLeft > (stickyActiveThresholdByIndex.get(index) ?? Number.POSITIVE_INFINITY),
  )
  const lastLeftStickyIndex = findEnabled ? (stickyIndices[stickyIndices.length - 1] ?? -1) : activeStickyIndices.length > 0 ? activeStickyIndices[activeStickyIndices.length - 1] : -1

  // Native Find sticks the real rows with CSS, so the overlay lists are not needed and the rows are not scanned.
  const stickableSubheaders = useMemo(
    () =>
      findEnabled
        ? []
        : rows
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => (isSubheaderRow ? isSubheaderRow(row) : false))
            .filter(({ row }) => (canSubheaderStick ? canSubheaderStick(row) : true)),
    [findEnabled, rows, isSubheaderRow, canSubheaderStick],
  )
  const candidateSubheaders = stickableSubheaders.filter(({ index }) => index * rowHeight <= scrollTop)

  const activeStickySubheader = candidateSubheaders.length > 0 ? candidateSubheaders[candidateSubheaders.length - 1] : null
  const activeStickySubheaderRow = activeStickySubheader?.row ?? null
  const activeStickySubheaderId = activeStickySubheaderRow?.id ?? null
  const showStickySubheaderOverlay = !findEnabled && activeStickySubheader !== null && scrollTop > activeStickySubheader.index * rowHeight
  const hasActiveStickySubheader = showStickySubheaderOverlay && activeStickySubheaderRow !== null

  const renderIndexSet = new Set<number>([...stickyIndices, ...virtualColumns.map((item) => item.index)])
  const renderIndices = Array.from(renderIndexSet).sort((a, b) => a - b)

  const firstRenderIndex = renderIndices[0] ?? 0
  const lastRenderIndex = renderIndices[renderIndices.length - 1] ?? -1

  const leftPad = colStarts[firstRenderIndex] ?? 0
  const rightPad =
    lastRenderIndex >= 0
      ? totalColWidth - (colStarts[lastRenderIndex] + (visibleColumns[lastRenderIndex]?.getSize() ?? 0))
      : 0

  const topSpacer = findEnabled ? 0 : virtualRows.length > 0 ? virtualRows[0].start : 0
  const bottomSpacer =
    findEnabled ? 0 : virtualRows.length > 0 ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0

  const trackForIndex = (index: number): string => {
    const column = visibleColumns[index]
    const meta = (column.columnDef.meta ?? {}) as ColumnMeta
    const size = column.getSize()
    const minPx = Math.max(meta.minPx ?? column.columnDef.minSize ?? 90, 70)
    const wasResized = Object.prototype.hasOwnProperty.call(columnSizing, column.id)

    if (meta.fixed || wasResized || nativeFind) {
      return `${size}px`
    }

    return `minmax(${minPx}px, 1fr)`
  }

  // A column that is not rendered (it lies between two rendered columns, for example under the sticky columns) leaves a gap: an empty
  // track of its width keeps the columns on their places, so the cells stay where the native find index expects them.
  const gapBefore = (position: number): number => {
    if (position === 0) return 0
    const previous = renderIndices[position - 1]
    return Math.max(0, colStarts[renderIndices[position]] - (colStarts[previous] + (visibleColumns[previous]?.getSize() ?? 0)))
  }
  const renderedTracks = renderIndices.flatMap((index, position) => {
    const gap = gapBefore(position)
    return gap > 0 ? [`${gap}px`, trackForIndex(index)] : [trackForIndex(index)]
  })
  const renderCells = (render: (index: number) => ReactNode): ReactNode[] =>
    renderIndices.flatMap((index, position) => (gapBefore(position) > 0 ? [<div key={`gap-${index}`} aria-hidden="true" />, render(index)] : [render(index)]))
  const gridTemplateColumns = `${edgeGutter}px ${leftPad}px ${renderedTracks.join(' ')} ${rightPad}px ${edgeGutter}px`
  const stickyStyle = (stickyLeft: number): CSSProperties =>
    ({ '--sticky-left': `${edgeGutter + stickyLeft}px` }) as CSSProperties

  // The layout object keeps its identity while nothing about the columns changes, so a memoised row can skip its render.
  const layoutKey = `${gridTemplateColumns}|${lastLeftStickyIndex}|${renderIndices.join(',')}`
  const rowLayout = useMemo<RowLayout<TData>>(
    () => ({
      gridTemplateColumns,
      cells: renderIndices.map((index, position) => {
        const column = visibleColumns[index]
        const meta = (column.columnDef.meta ?? {}) as ColumnMeta
        return {
          index,
          gap: gapBefore(position) > 0,
          column,
          className: `${meta.numeric ? ' cell-numeric' : ''}${meta.sticky ? ' sticky-col' : ''}${
            meta.sticky && index === lastLeftStickyIndex ? ' sticky-col-shadow-left' : ''
          }`,
          style: stickyStyle(stickyLeftById.get(column.id) ?? 0),
          renderNativeCell: nativeCellRenderers[index],
        }
      }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey, visibleColumns, columns],
  )

  useEffect(() => {
    if (resolvedDisplayMode !== 'table' || autoScrollX === 'off' || hasAppliedInitialAutoScrollRef.current) {
      return
    }
    const scrollEl = tableContainerRef.current
    if (!scrollEl) {
      return
    }
    if (autoScrollX === 'left') {
      scrollEl.scrollTo({ left: 0 })
      hasAppliedInitialAutoScrollRef.current = true
      return
    }
    const maxLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth)
    scrollEl.scrollTo({ left: maxLeft })
    hasAppliedInitialAutoScrollRef.current = true
  }, [autoScrollX, resolvedDisplayMode])

  if (resolvedDisplayMode === 'card') {
    const hasActualValue = (row: Row<TData>, columnId: string): boolean => {
      const original = row.original as Record<string, unknown>
      if (!(columnId in original)) {
        return true
      }
      const value = original[columnId]
      if (value === null || value === undefined) {
        return false
      }
      if (typeof value === 'string') {
        return value.trim().length > 0
      }
      return true
    }

    const renderCardFields = (row: Row<TData>, keyPrefix: string) => {
      const cellsByColumnId = new Map(row.getVisibleCells().map((cell) => [cell.column.id, cell]))

      return (
        <div className="card-details">
          {visibleColumns.map((column) => {
            const cell = cellsByColumnId.get(column.id)
            if (!cell || !hasActualValue(row, column.id)) {
              return null
            }
            const meta = (column.columnDef.meta ?? {}) as ColumnMeta

            return (
              <div key={`${keyPrefix}-${cell.id}`} className={`card-field${meta.numeric ? ' card-field-numeric' : ''}`}>
                <span className="card-field-label">{String(column.columnDef.header)}</span>
                <span className="card-field-value">{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
              </div>
            )
          })}
        </div>
      )
    }

    return (
      <div className="card-wrap" ref={tableContainerRef}>
        <div className="card-groups-virtual" style={{ height: `${cardGroupVirtualizer.getTotalSize()}px` }}>
          {cardGroupVirtualizer.getVirtualItems().map((virtualGroup) => {
            const groupRow = sortedGroupRows[virtualGroup.index]
            if (!groupRow) {
              return null
            }

            return (
              <article
                key={`group-card-${groupRow.id}`}
                ref={cardGroupVirtualizer.measureElement}
                data-index={virtualGroup.index}
                className="card-group-card card-group-virtual-item"
                style={{ transform: `translateY(${virtualGroup.start}px)` }}
              >
                {renderCardFields(groupRow, 'group-card-field')}

                {groupRow.getIsExpanded() && groupRow.subRows.length > 0 ? (
                  <div className="card-subcards">
                    {groupRow.subRows.map((subRow) => {
                      return (
                        <div key={`sub-card-${subRow.id}`} className="card-subcard">
                          {renderCardFields(subRow, 'sub-card-field')}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="table-wrap" ref={tableContainerRef} data-vgt={instanceId}>
      {highlightedResizeColumnId ? (
        // One rule for the whole table: a hover or resize does not touch the class of any cell.
        <style>{`[data-vgt="${cssString(instanceId)}"] [data-col="${cssString(highlightedResizeColumnId)}"] { box-shadow: inset -2px 0 0 #2f60d8; }`}</style>
      ) : null}
      <div
        className={`table-inner${findEnabled ? ' native-find' : ''}`}
        ref={tableInnerRef}
        style={
          {
            width: `max(${totalColWidth + edgeGutter * 2}px, 100%)`,
            '--vgt-row-height': `${rowHeight}px`,
            '--vgt-header-height': `${rowHeight * table.getHeaderGroups().length}px`,
          } as CSSProperties
        }
      >
        {table.getHeaderGroups().map((headerGroup) => (
          <div
            key={headerGroup.id}
            className={`grid-row header-row${scrollTop > 0 ? ' is-vertically-sticky' : ''}${
              !hasActiveStickySubheader && scrollTop > 0 ? ' top-sticky-shadow' : ''
            }`}
            style={{ gridTemplateColumns }}
          >
            <div className="edge-col edge-start sticky-edge sticky-edge-start" aria-hidden="true" />
            <div aria-hidden="true" />

            {renderCells((index) => {
              const column = visibleColumns[index]
              const header = headerGroup.headers[column.getIndex()]
              const meta = (column.columnDef.meta ?? {}) as ColumnMeta
              const numericClass = meta.numeric ? ' cell-numeric' : ''
              const stickyClass = meta.sticky ? ' sticky-col' : ''
              const leftShadowClass = meta.sticky && index === lastLeftStickyIndex ? ' sticky-col-shadow-left' : ''
              const stickyLeft = stickyLeftById.get(column.id) ?? 0

              const sorted = header.column.getIsSorted()
              const sortSymbol = sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : ''
              const isSortHovered = hoveredSortColumnId === column.id
              const hasOtherSort = effectiveSorting.some((entry) => entry.id !== column.id)
              const showPreviewSort = !sorted && isSortHovered
              const showShiftHint = showPreviewSort && hasOtherSort

              return (
                <div
                  key={header.id}
                  className={`th${numericClass}${stickyClass}${leftShadowClass}`}
                  data-col={column.id}
                  title={String(column.columnDef.header)}
                  style={stickyStyle(stickyLeft)}
                >
                  <span className="sticky-surface">
                    <button
                      type="button"
                      className="header-sort-button"
                      onClick={header.column.getToggleSortingHandler()}
                      onMouseEnter={() => setHoveredSortColumnId(column.id)}
                      onMouseLeave={() => setHoveredSortColumnId(null)}
                      title={
                        showShiftHint
                          ? `Shift+Click to add ${String(column.columnDef.header)} to current sorting`
                          : sorted === 'asc'
                          ? `Sort ${String(column.columnDef.header)} descending`
                          : sorted === 'desc'
                            ? `Disable sorting for ${String(column.columnDef.header)}`
                            : `Sort ${String(column.columnDef.header)} ascending`
                      }
                    >
                      <span className="header-label">
                        {header.isPlaceholder ? null : flexRender(column.columnDef.header, header.getContext())}
                      </span>
                      <span className={`header-sort-indicator${sorted ? ' is-active' : ''}${showPreviewSort ? ' is-preview' : ''}`} aria-hidden="true">
                        {sortSymbol || (showPreviewSort ? '↑' : '')}
                      </span>
                      {showShiftHint ? (
                        <span className={`header-sort-shift-hint${isShiftPressed ? ' is-active' : ''}`} aria-hidden="true">
                          ⇧ Add sort
                        </span>
                      ) : null}
                    </button>
                    {header.column.getCanResize() ? (
                      <button
                        className={`resize-handle${header.column.getIsResizing() ? ' is-resizing' : ''}`}
                        onMouseEnter={() => setHoveredResizeColumnId(column.id)}
                        onMouseLeave={() => setHoveredResizeColumnId(null)}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        aria-label={`Resize ${String(column.columnDef.header)} column`}
                        type="button"
                      />
                    ) : null}
                  </span>
                </div>
              )
            })}

            <div aria-hidden="true" />
            <div className="edge-col edge-end sticky-edge sticky-edge-end" aria-hidden="true" />
          </div>
        ))}

        {showStickySubheaderOverlay && activeStickySubheaderRow ? (
          <div className="department-sticky-overlay">
            <div className="grid-row body-row row-department is-vertically-sticky top-sticky-shadow" style={{ gridTemplateColumns }}>
              <div className="edge-col edge-start sticky-edge sticky-edge-start" aria-hidden="true" />
              <div aria-hidden="true" />

              {renderCells((index) => {
                const column = visibleColumns[index]
                const cell = activeStickySubheaderRow.getVisibleCells().find((candidate) => candidate.column.id === column.id)
                const meta = (column.columnDef.meta ?? {}) as ColumnMeta
                const numericClass = meta.numeric ? ' cell-numeric' : ''
                const stickyClass = meta.sticky ? ' sticky-col' : ''
                const leftShadowClass = meta.sticky && index === lastLeftStickyIndex ? ' sticky-col-shadow-left' : ''
                const stickyLeft = stickyLeftById.get(column.id) ?? 0

                if (!cell) {
                  return (
                    <div
                      key={`overlay-missing-${activeStickySubheaderRow.id}-${column.id}`}
                      className={`td${numericClass}${stickyClass}${leftShadowClass}`}
                      data-col={column.id}
                      style={stickyStyle(stickyLeft)}
                      aria-hidden="true"
                    />
                  )
                }

                return (
                  <div
                    key={`overlay-${cell.id}`}
                    className={`td${numericClass}${stickyClass}${leftShadowClass}`}
                    data-col={column.id}
                    style={stickyStyle(stickyLeft)}
                  >
                    <span className="sticky-surface">{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                  </div>
                )
              })}

              <div aria-hidden="true" />
              <div className="edge-col edge-end sticky-edge sticky-edge-end" aria-hidden="true" />
            </div>
          </div>
        ) : null}

        {topSpacer > 0 ? <div style={{ height: `${topSpacer}px` }} aria-hidden="true" /> : null}

        {rowIndices.map((rowIndex) => {
          const row = rows[rowIndex]
          const rowIsSubheader = isSubheaderRow ? isSubheaderRow(row) : false
          return (
            <BodyRow<TData>
              key={row.id}
              row={row}
              rowIndex={rowIndex}
              isLast={rowIndex === rows.length - 1}
              isSubheader={rowIsSubheader}
              nativeStickySubheader={findEnabled && rowIsSubheader && (canSubheaderStick ? canSubheaderStick(row) : true)}
              underOverlay={showStickySubheaderOverlay && rowIsSubheader && row.id === activeStickySubheaderId}
              isExpanded={row.getIsExpanded()}
              findEnabled={findEnabled}
              rowHeight={rowHeight}
              layout={rowLayout}
            />
          )
        })}

        {bottomSpacer > 0 ? <div style={{ height: `${bottomSpacer}px` }} aria-hidden="true" /> : null}
      </div>

      <div className="footer-shadow-sentinel" aria-hidden="true" />
    </div>
  )
}
