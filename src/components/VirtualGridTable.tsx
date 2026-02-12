import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type ExpandedState,
  type OnChangeFn,
  type Row,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'

export type ColumnMeta = {
  fixed?: boolean
  minPx?: number
  numeric?: boolean
  sticky?: boolean
}

export type TableDisplayMode = 'table' | 'card' | 'auto'

type VirtualGridTableProps<TData extends object> = {
  data: TData[]
  columns: ColumnDef<TData>[]
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
}

export function VirtualGridTable<TData extends object>({
  data,
  columns,
  getRowId,
  getSubRows,
  storageKey = 'virtual-grid-table-column-sizing-v1',
  rowHeight = 46,
  edgeGutter = 0,
  isSubheaderRow,
  canSubheaderStick,
  autoExpandedRowIds,
  displayMode = 'auto',
  mobileBreakpoint = 900,
  sorting: controlledSorting,
  onSortingChange,
  autoScrollX = 'off',
}: VirtualGridTableProps<TData>) {
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [scrollLeft, setScrollLeft] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [hoveredResizeColumnId, setHoveredResizeColumnId] = useState<string | null>(null)
  const [hoveredSortColumnId, setHoveredSortColumnId] = useState<string | null>(null)
  const [isShiftPressed, setIsShiftPressed] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
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
  const hasAppliedInitialAutoScrollRef = useRef(false)
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia(`(max-width: ${mobileBreakpoint}px)`).matches)
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
    columnResizeMode: 'onChange',
    defaultColumn: {
      minSize: 90,
      size: 140,
      maxSize: 560,
    },
  })

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(columnSizing))
  }, [columnSizing, storageKey])

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
      setScrollLeft(scrollEl.scrollLeft)
      setScrollTop(scrollEl.scrollTop)
    }

    onScroll()
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
    }
  }, [])

  const rows = table.getRowModel().rows
  const sortedGroupRows = table.getSortedRowModel().rows
  const visibleColumns = table.getVisibleLeafColumns()
  const resolvedDisplayMode: Exclude<TableDisplayMode, 'auto'> = displayMode === 'auto' ? (isMobileViewport ? 'card' : 'table') : displayMode
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
  })

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  })
  const cardGroupVirtualizer = useVirtualizer({
    count: sortedGroupRows.length,
    getScrollElement: () => tableContainerRef.current,
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

  const virtualColumns = columnVirtualizer.getVirtualItems()
  const virtualRows = rowVirtualizer.getVirtualItems()

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
  const lastLeftStickyIndex = activeStickyIndices.length > 0 ? activeStickyIndices[activeStickyIndices.length - 1] : -1

  const subheaderRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => (isSubheaderRow ? isSubheaderRow(row) : false))

  const candidateSubheaders = subheaderRows.filter(
    ({ row, index }) => (canSubheaderStick ? canSubheaderStick(row) : true) && index * rowHeight <= scrollTop,
  )

  const activeStickySubheader = candidateSubheaders.length > 0 ? candidateSubheaders[candidateSubheaders.length - 1] : null
  const activeStickySubheaderRow = activeStickySubheader?.row ?? null
  const activeStickySubheaderId = activeStickySubheaderRow?.id ?? null
  const showStickySubheaderOverlay = activeStickySubheader !== null && scrollTop > activeStickySubheader.index * rowHeight
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

  const topSpacer = virtualRows.length > 0 ? virtualRows[0].start : 0
  const bottomSpacer =
    virtualRows.length > 0 ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0

  const trackForIndex = (index: number): string => {
    const column = visibleColumns[index]
    const meta = (column.columnDef.meta ?? {}) as ColumnMeta
    const size = column.getSize()
    const minPx = Math.max(meta.minPx ?? column.columnDef.minSize ?? 90, 70)
    const wasResized = Object.prototype.hasOwnProperty.call(columnSizing, column.id)

    if (meta.fixed || wasResized) {
      return `${size}px`
    }

    return `minmax(${minPx}px, 1fr)`
  }

  const renderedTracks = renderIndices.map((index) => trackForIndex(index))
  const gridTemplateColumns = `${edgeGutter}px ${leftPad}px ${renderedTracks.join(' ')} ${rightPad}px ${edgeGutter}px`

  const stickyStyle = (stickyLeft: number): CSSProperties =>
    ({ '--sticky-left': `${edgeGutter + stickyLeft}px` }) as CSSProperties

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
    <div className="table-wrap" ref={tableContainerRef}>
      <div className="table-inner" style={{ width: `max(${totalColWidth + edgeGutter * 2}px, 100%)` }}>
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

            {renderIndices.map((index) => {
              const column = visibleColumns[index]
              const header = headerGroup.headers[column.getIndex()]
              const meta = (column.columnDef.meta ?? {}) as ColumnMeta
              const numericClass = meta.numeric ? ' cell-numeric' : ''
              const stickyClass = meta.sticky ? ' sticky-col' : ''
              const leftShadowClass = meta.sticky && index === lastLeftStickyIndex ? ' sticky-col-shadow-left' : ''
              const resizeHighlightClass = column.id === highlightedResizeColumnId ? ' col-resize-highlight' : ''
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
                  className={`th${numericClass}${stickyClass}${leftShadowClass}${resizeHighlightClass}`}
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

              {renderIndices.map((index) => {
                const column = visibleColumns[index]
                const cell = activeStickySubheaderRow.getVisibleCells().find((candidate) => candidate.column.id === column.id)
                const meta = (column.columnDef.meta ?? {}) as ColumnMeta
                const numericClass = meta.numeric ? ' cell-numeric' : ''
                const stickyClass = meta.sticky ? ' sticky-col' : ''
                const leftShadowClass = meta.sticky && index === lastLeftStickyIndex ? ' sticky-col-shadow-left' : ''
                const resizeHighlightClass = column.id === highlightedResizeColumnId ? ' col-resize-highlight' : ''
                const stickyLeft = stickyLeftById.get(column.id) ?? 0

                if (!cell) {
                  return (
                    <div
                      key={`overlay-missing-${activeStickySubheaderRow.id}-${column.id}`}
                      className={`td${numericClass}${stickyClass}${leftShadowClass}${resizeHighlightClass}`}
                      style={stickyStyle(stickyLeft)}
                      aria-hidden="true"
                    />
                  )
                }

                return (
                  <div
                    key={`overlay-${cell.id}`}
                    className={`td${numericClass}${stickyClass}${leftShadowClass}${resizeHighlightClass}`}
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

        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index]
          const cells = row.getVisibleCells()
          const cellsByColumnId = new Map(cells.map((cell) => [cell.column.id, cell]))

          const rowIsSubheader = isSubheaderRow ? isSubheaderRow(row) : false
          const isSourceUnderStickyOverlay =
            showStickySubheaderOverlay && rowIsSubheader && row.id === activeStickySubheaderId

          return (
            <div
              key={row.id}
              className={`grid-row body-row${rowIsSubheader ? ' row-department' : ' row-user'}${
                isSourceUnderStickyOverlay ? ' source-under-sticky-overlay' : ''
              }${virtualRow.index === rows.length - 1 ? ' is-last-row' : ''}`}
              style={{ gridTemplateColumns }}
            >
              <div className="edge-col edge-start sticky-edge sticky-edge-start" aria-hidden="true" />
              <div aria-hidden="true" />

              {renderIndices.map((index) => {
                const column = visibleColumns[index]
                const cell = cellsByColumnId.get(column.id)
                const meta = (column.columnDef.meta ?? {}) as ColumnMeta
                const numericClass = meta.numeric ? ' cell-numeric' : ''
                const stickyClass = meta.sticky ? ' sticky-col' : ''
                const leftShadowClass = meta.sticky && index === lastLeftStickyIndex ? ' sticky-col-shadow-left' : ''
                const resizeHighlightClass = column.id === highlightedResizeColumnId ? ' col-resize-highlight' : ''
                const stickyLeft = stickyLeftById.get(column.id) ?? 0

                if (!cell) {
                  return (
                    <div
                      key={`missing-${row.id}-${column.id}`}
                      className={`td${numericClass}${stickyClass}${leftShadowClass}${resizeHighlightClass}`}
                      style={stickyStyle(stickyLeft)}
                      aria-hidden="true"
                    />
                  )
                }

                return (
                  <div
                    key={cell.id}
                    className={`td${numericClass}${stickyClass}${leftShadowClass}${resizeHighlightClass}`}
                    style={stickyStyle(stickyLeft)}
                  >
                    <span className="sticky-surface">{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                  </div>
                )
              })}

              <div aria-hidden="true" />
              <div className="edge-col edge-end sticky-edge sticky-edge-end" aria-hidden="true" />
            </div>
          )
        })}

        {bottomSpacer > 0 ? <div style={{ height: `${bottomSpacer}px` }} aria-hidden="true" /> : null}
      </div>

      <div className="footer-shadow-sentinel" aria-hidden="true" />
    </div>
  )
}
