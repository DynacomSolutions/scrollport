import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
import { plainCellText, readNativeFindBaseline, readNativeFindFont, type NativeFind, type NativeFindCell, type NativeFindColumn, type NativeFindFont, type NativeFindLine } from '../scrollport/core'
import { useFindIndex } from '../scrollport/react'

export type ColumnMeta<TData extends object = object> = {
  fixed?: boolean
  minPx?: number
  numeric?: boolean
  sticky?: boolean
  /**
   * The text that the cell shows, for native find. Needed for a cell that draws more than the plain value (a formatted
   * number, a name with a handle). Without it the index holds `String(row.getValue(columnId))`.
   * A cell with several lines (a handle above a name), a text that does not start at the start of the cell (an indent, a
   * pill) or a text in another font than the other cells gives an array of lines (`NativeFindCell`). The column gives `findLines`,
   * or each line gives its own `dx`, `baseline` and `font`.
   */
  findText?: (row: Row<TData>) => NativeFindCell
  /**
   * Where the lines of a multi-line cell lie (see `NativeFindColumn.lines`): the distance from the start of the cell text
   * to the text of the line, the baseline of the line from the centre of the row, and its font. Needed with a `findText` that
   * gives an array. The index draws each line in that font at that place, so the find highlight covers the visible line.
   */
  findLines?: readonly NativeFindLine[]
}

/** Default row height in px. */
export const DEFAULT_ROW_HEIGHT = 46

/** Horizontal padding of a cell in rem (the `.td` rule in `styles.css`). */
const CELL_PADDING_REM = 1.25

export type TableDisplayMode = 'table' | 'card' | 'auto'

type VirtualGridTableProps<TData extends object> = {
  tableId: string
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
  /**
   * Native find: the browser find bar (Ctrl+F) finds text in every row of the table, also in rows that are not drawn.
   * Needs two things from the cells: draw their text with `IndexedText` (inert text, which the find bar does not see), and give
   * `meta.findText` to every column whose cell shows more than the plain value. Works in table mode, not in card mode.
   * With this on, columns have the width of their `size` (no flexible columns), so the index lies over the real cells.
   */
  nativeFind?: boolean
  /**
   * Draw the native find index in the font of the visible text and put each line of a multi-line cell on its visible line (see
   * `ColumnMeta.findText`), so the find highlight covers the real glyphs. Default false keeps a monospace index. A cell with
   * supplied line geometry still places each line on its visible line. With font matching on, Chromium 157 lost the active match
   * or showed a wrong count in some two-match runs. The cause is not confirmed (see the README).
   */
  findFontMatch?: boolean
  /**
   * Distance between the tab stops of the native find index in px. Default 10 with `findFontMatch` (the index puts spaces, 4 px each,
   * after the tabs, so 10 px gives a place within 1 px), and the default of the index (20) without it.
   */
  findTabQuantum?: number
  /** Called with the find index when it is ready and with `null` when it is gone. Pass a stable function. */
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
  findFontMatch = false,
  findTabQuantum,
  onFind,
  defaultExpanded = false,
}: VirtualGridTableProps<TData>) {
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

  // Native find. The index holds the text of every row of the row model, in the order that the table shows it. It is
  // built again when the rows change (sort, filter, expand, new data) or a column changes size.
  const findEnabled = nativeFind && resolvedDisplayMode === 'table'
  // The font and the baseline of a cell: the index draws the text of a cell in this font, on this baseline, so the find highlight
  // lies on the visible text. A copy of a cell that is not on screen gives them.
  const findStyle = useMemo<{ font: NativeFindFont; baseline: number } | null>(() => {
    if (!findFontMatch || !findEnabled) return null
    const cell = document.createElement('div')
    cell.className = 'td'
    cell.style.cssText = `position:absolute;visibility:hidden;width:200px;height:${rowHeight}px`
    const leaf = document.createElement('span')
    cell.append(leaf)
    document.body.append(cell)
    const font = readNativeFindFont(leaf)
    const { baseline } = readNativeFindBaseline(cell, leaf)
    cell.remove()
    return { font, baseline }
  }, [rowHeight, findFontMatch, findEnabled])
  const findColumns = useMemo<NativeFindColumn[]>(() => {
    const padding = CELL_PADDING_REM * (parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16)
    let left = edgeGutter
    return visibleColumns.map((column) => {
      const size = column.getSize()
      const meta = (column.columnDef.meta ?? {}) as ColumnMeta<TData>
      const out: NativeFindColumn = {
        start: left + padding,
        end: left + size - padding,
        align: meta.numeric ? 'end' : 'start',
        lines: meta.findLines,
      }
      left += size
      return out
    })
    // `columnSizing` is the state behind `column.getSize()`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleColumns, columnSizing, edgeGutter, findFontMatch])
  // Build each row's cell texts only while creating the index, then release them with the stack frame.
  const getRowCells = useCallback(
    (index: number): readonly NativeFindCell[] => {
      const row = rows[index]
      return visibleColumns.map((column) => {
        const meta = (column.columnDef.meta ?? {}) as ColumnMeta<TData>
        const cell = meta.findText ? meta.findText(row) : String(row.getValue(column.id) ?? '')
        return findFontMatch || (Array.isArray(cell) && meta.findLines) ? cell : plainCellText(cell)
      })
    },
    [rows, visibleColumns, findFontMatch],
  )
  useFindIndex(tableContainerRef, tableInnerRef, {
    enabled: findEnabled,
    rowCount: rows.length,
    rowHeight,
    rowTop: table.getHeaderGroups().length * rowHeight,
    getRowCells,
    columns: findColumns,
    font: findStyle?.font,
    baseline: findStyle?.baseline,
    tabQuantum: findTabQuantum ?? (findFontMatch ? 10 : undefined),
    // above the cells (`z-index` 24 for sticky cells), below the header (30)
    zIndex: 26,
    onFind,
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
      <div className="table-inner" ref={tableInnerRef} style={{ width: `max(${totalColWidth + edgeGutter * 2}px, 100%)` }}>
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

              {renderCells((index) => {
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
              data-row={virtualRow.index}
              className={`grid-row body-row${rowIsSubheader ? ' row-department' : ' row-user'}${
                isSourceUnderStickyOverlay ? ' source-under-sticky-overlay' : ''
              }${virtualRow.index === rows.length - 1 ? ' is-last-row' : ''}`}
              style={{ gridTemplateColumns }}
            >
              <div className="edge-col edge-start sticky-edge sticky-edge-start" aria-hidden="true" />
              <div aria-hidden="true" />

              {renderCells((index) => {
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
