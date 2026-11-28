import './styles.css'
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import type { Row, SortingState } from '@tanstack/react-table'
import { generateData, type UserRecord } from './data'
import {
  OmniSearchBar,
  RAW_SEARCH_PILL_ID,
  type OmniSearchColumn,
  type OmniSearchPill,
  type OmniSearchState,
} from './components/OmniSearchBar'
import { VirtualGridTable, type ColumnMeta, type TableDisplayMode, type VirtualGridColumn } from './components/VirtualGridTable'
import { CellText } from './scrollport/react'
import type { NativeFind, NativeFindCell } from './scrollport/core'

type TableRow = Omit<UserRecord, 'id'> & {
  id: number | string
  recordId?: number
  rowType?: 'department' | 'user'
  userCount?: number
  subRows?: TableRow[]
}

type NumericColumnKey =
  | 'recordId'
  | 'orders'
  | 'sessions'
  | 'conversionRate'
  | 'revenue'
  | 'balance'
  | 'mrr'
  | 'arr'
  | 'expense'
  | 'score'
  | 'ticketsOpen'

const NUMERIC_COLUMNS: NumericColumnKey[] = [
  'recordId',
  'orders',
  'sessions',
  'conversionRate',
  'revenue',
  'balance',
  'mrr',
  'arr',
  'expense',
  'score',
  'ticketsOpen',
]

const CURRENCY_COLUMNS: NumericColumnKey[] = ['revenue', 'balance', 'mrr', 'arr', 'expense']
const TABLE_ID = 'users'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})
const integerFormatter = new Intl.NumberFormat('en-US')
const usernameCollator = new Intl.Collator()

// Dates repeat a lot (a day, a minute), and the find index formats every row, so the formatted text is kept.
const dateCache = new Map<string, string>()
const dateTimeCache = new Map<string, string>()

function formatDate(value: string) {
  let text = dateCache.get(value)
  if (text === undefined) {
    text = dateFormatter.format(new Date(value))
    dateCache.set(value, text)
  }
  return text
}

function formatDateTime(value: string) {
  let text = dateTimeCache.get(value)
  if (text === undefined) {
    text = dateTimeFormatter.format(new Date(value))
    dateTimeCache.set(value, text)
  }
  return text
}

function hostOf(url: string) {
  return new URL(url).host
}

/** Rows of the demo. Native Find renders each row's displayed text in the table. */
// `?rows=N` shrinks the demo (tests and tools): the cost of native find grows with the number of rows.
export const DEMO_ROWS = Math.min(100_000, Math.max(100, Number(new URLSearchParams(window.location.search).get('rows')) || 100_000))

function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals
  return Math.round((value + Number.EPSILON) * scale) / scale
}

function getDecimalPlaces(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  const text = value.toString()
  if (!text.includes('.')) {
    return 0
  }
  return text.split('.')[1]?.length ?? 0
}

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

function includesInsensitive(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase())
}

/** The two-line user cell: an avatar, then a handle above a name. */
const USER_CELL = { avatar: 22, gapRem: 0.55, primaryLine: 18, secondaryLine: 14 }

function highlightText(text: string, query: string): ReactNode {
  const source = text ?? ''
  const needle = query.trim()
  if (!needle) {
    return source
  }

  const lowerSource = source.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  const parts: ReactNode[] = []
  let cursor = 0
  let matchIndex = lowerSource.indexOf(lowerNeedle)

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push(source.slice(cursor, matchIndex))
    }
    const end = matchIndex + lowerNeedle.length
    parts.push(<mark key={`${matchIndex}-${end}`} className="cell-highlight">{source.slice(matchIndex, end)}</mark>)
    cursor = end
    matchIndex = lowerSource.indexOf(lowerNeedle, cursor)
  }

  if (cursor < source.length) {
    parts.push(source.slice(cursor))
  }

  // One inline wrapper keeps the text and the marks in one inline formatting context. Without it, a flex parent
  // makes every piece its own flex item, and native Find cannot match text across the pieces.
  return parts.length > 0 ? <span className="cell-text">{parts}</span> : source
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

function matchesPill(row: UserRecord, pill: OmniSearchPill, columns: OmniSearchColumn<UserRecord>[]): boolean {
  const column = columns.find((item) => item.id === pill.columnId)
  if (!column) {
    return true
  }
  const currentValue = toText(column.getValue(row))
  if (pill.values && pill.values.length > 0) {
    return pill.values.some((value) => includesInsensitive(currentValue, value))
  }
  return includesInsensitive(currentValue, pill.value)
}

const FILTER_PARAM_KEYS = new Set([
  'department',
  'recordId',
  'username',
  'fullName',
  'email',
  'role',
  'country',
  'city',
  'status',
  'plan',
  'signupDate',
  'lastLoginAt',
  'website',
  'profileUrl',
  'company',
  'orders',
  'sessions',
  'conversionRate',
  'revenue',
  'balance',
  'mrr',
  'arr',
  'expense',
  'score',
  'ticketsOpen',
  'renewalDate',
])

function labelFromColumnId(columnId: string): string {
  if (columnId === 'recordId') {
    return 'ID'
  }
  return columnId
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (text) => text.toUpperCase())
    .trim()
}

function parseSearchStateFromUrl(tableId: string): OmniSearchState {
  const params = new URLSearchParams(window.location.search)
  const fromSearch = (params.get(`${tableId}.search`) ?? '').trim()

  const pills = Array.from(params.entries()).reduce<OmniSearchPill[]>((acc, [key, rawValue]) => {
    if (!key.startsWith(`${tableId}.`)) {
      return acc
    }
    const columnId = key.slice(`${tableId}.`.length)
    if (!FILTER_PARAM_KEYS.has(columnId)) {
      return acc
    }
    const values = rawValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    const value = values.join(' OR ')
    if (!value) {
      return acc
    }
    acc.push({
      columnId,
      label: labelFromColumnId(columnId),
      value,
      values: values.length > 1 ? values : undefined,
    })
    return acc
  }, [])

  if (fromSearch && !pills.some((pill) => pill.columnId === RAW_SEARCH_PILL_ID)) {
    return {
      globalQuery: '',
      pills: [...pills, { columnId: RAW_SEARCH_PILL_ID, label: 'Search', value: fromSearch }],
    }
  }

  return {
    globalQuery: '',
    pills,
  }
}

function parseSortingStateFromUrl(tableId: string): SortingState {
  const params = new URLSearchParams(window.location.search)
  const sortParam = (params.get(`${tableId}.sort`) ?? '').trim()
  if (!sortParam) {
    return []
  }

  return sortParam
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [field, direction] = item.split(':')
      if (!field || !direction || !FILTER_PARAM_KEYS.has(field)) {
        return null
      }
      if (direction !== 'asc' && direction !== 'desc') {
        return null
      }
      return { id: field, desc: direction === 'desc' }
    })
    .filter((entry): entry is SortingState[number] => entry !== null)
}

function parseAutoScrollXFromUrl(tableId: string): 'left' | 'right' | 'off' {
  const params = new URLSearchParams(window.location.search)
  const value = (params.get(`${tableId}.xScroll`) ?? '').trim().toLowerCase()
  if (value === 'left' || value === 'right') {
    return value
  }
  return 'off'
}

function parseDisplayModeFromStorage(tableId: string): TableDisplayMode {
  const raw = window.localStorage.getItem(`table.${tableId}.displayMode`)
  if (raw === 'auto' || raw === 'table' || raw === 'card') {
    return raw
  }
  return 'auto'
}

function parseAutoScrollXFromStorage(tableId: string): 'left' | 'right' | 'off' {
  const raw = window.localStorage.getItem(`table.${tableId}.xScroll`)
  if (raw === 'left' || raw === 'right' || raw === 'off') {
    return raw
  }
  return 'off'
}

function writeSearchStateToUrl(tableId: string, state: OmniSearchState, sorting: SortingState, autoScrollX: 'left' | 'right' | 'off') {
  const params = new URLSearchParams(window.location.search)
  params.delete(`${tableId}.search`)
  params.delete(`${tableId}.sort`)
  params.delete(`${tableId}.xScroll`)
  for (const key of FILTER_PARAM_KEYS) {
    params.delete(`${tableId}.${key}`)
  }

  const rawPills = state.pills.filter((pill) => pill.columnId === RAW_SEARCH_PILL_ID)
  const otherPills = state.pills.filter((pill) => pill.columnId !== RAW_SEARCH_PILL_ID)
  const rawQuery = rawPills[rawPills.length - 1]?.value.trim() ?? ''

  if (rawQuery) {
    params.set(`${tableId}.search`, rawQuery)
  }

  for (const pill of otherPills) {
    if (!FILTER_PARAM_KEYS.has(pill.columnId)) {
      continue
    }
    const values = (pill.values && pill.values.length > 0 ? pill.values : [pill.value]).map((item) => item.trim()).filter(Boolean)
    if (values.length === 0) {
      continue
    }
    params.set(`${tableId}.${pill.columnId}`, values.join(','))
  }

  const validSortEntries = sorting
    .filter((entry) => FILTER_PARAM_KEYS.has(entry.id))
    .map((entry) => `${entry.id}:${entry.desc ? 'desc' : 'asc'}`)
  if (validSortEntries.length > 0) {
    params.set(`${tableId}.sort`, validSortEntries.join(','))
  }

  if (autoScrollX !== 'off') {
    params.set(`${tableId}.xScroll`, autoScrollX)
  }

  const nextQuery = params.toString()
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (nextUrl !== currentUrl) {
    window.history.replaceState(null, '', nextUrl)
  }
}

export function toTableRows(records: UserRecord[]): TableRow[] {
  const grouped = new Map<string, UserRecord[]>()
  for (const record of records) {
    const bucket = grouped.get(record.department)
    if (bucket) {
      bucket.push(record)
    } else {
      grouped.set(record.department, [record])
    }
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([department, users]) => {
      const userCount = users.length
      const totalRevenue = users.reduce((acc, row) => acc + row.revenue, 0)
      const totalBalance = users.reduce((acc, row) => acc + row.balance, 0)
      const totalMrr = users.reduce((acc, row) => acc + row.mrr, 0)
      const totalArr = users.reduce((acc, row) => acc + row.arr, 0)
      const totalExpense = users.reduce((acc, row) => acc + row.expense, 0)

      // Keep each generated record as a table row. Avoid a wrapper object for every user.
      const subRows: TableRow[] = users.sort((left, right) => usernameCollator.compare(left.username, right.username))

      return {
        id: `department-${department.toLowerCase()}`,
        recordId: 0,
        rowType: 'department',
        department,
        username: '',
        avatarUrl: '',
        fullName: '',
        email: '',
        role: '',
        country: '',
        city: '',
        status: 'Active',
        plan: 'Enterprise',
        signupDate: users[0]?.signupDate ?? new Date().toISOString().slice(0, 10),
        lastLoginAt: users[0]?.lastLoginAt ?? new Date().toISOString(),
        website: '',
        profileUrl: '',
        company: '',
        orders: users.reduce((acc, row) => acc + row.orders, 0),
        sessions: users.reduce((acc, row) => acc + row.sessions, 0),
        conversionRate: roundTo(users.reduce((acc, row) => acc + row.conversionRate, 0) / Math.max(userCount, 1), 4),
        revenue: roundTo(totalRevenue, 2),
        balance: roundTo(totalBalance, 2),
        mrr: roundTo(totalMrr, 2),
        arr: roundTo(totalArr, 2),
        expense: roundTo(totalExpense, 2),
        score: Math.round(users.reduce((acc, row) => acc + row.score, 0) / Math.max(userCount, 1)),
        ticketsOpen: users.reduce((acc, row) => acc + row.ticketsOpen, 0),
        renewalDate: users[0]?.renewalDate ?? new Date().toISOString().slice(0, 10),
        userCount,
        subRows,
      } satisfies TableRow
    })
}

export function recordIdValue(row: Pick<TableRow, 'id' | 'rowType'>): number | undefined {
  return row.rowType === 'department' || typeof row.id !== 'number' ? undefined : row.id
}

export type NativeFindTableDemoProps = { rowCount?: number; nativeFind?: boolean; tableDisplayMode?: TableDisplayMode; onFind?: (find: NativeFind | null) => void }

export function NativeFindTableDemo({ rowCount = DEMO_ROWS, nativeFind = true, tableDisplayMode, onFind }: NativeFindTableDemoProps = {}) {
  const initialSearchState = useMemo(() => parseSearchStateFromUrl(TABLE_ID), [])
  const initialSortingState = useMemo(() => parseSortingStateFromUrl(TABLE_ID), [])
  const initialAutoScrollX = useMemo(() => {
    const fromUrl = parseAutoScrollXFromUrl(TABLE_ID)
    return fromUrl !== 'off' ? fromUrl : parseAutoScrollXFromStorage(TABLE_ID)
  }, [])
  const initialDisplayMode = useMemo(() => parseDisplayModeFromStorage(TABLE_ID), [])
  const [searchState, setSearchState] = useState<OmniSearchState>(initialSearchState)
  const [sorting, setSorting] = useState<SortingState>(initialSortingState)
  const [autoScrollX, setAutoScrollX] = useState<'left' | 'right' | 'off'>(initialAutoScrollX)
  const [displayMode, setDisplayMode] = useState<TableDisplayMode>(tableDisplayMode ?? initialDisplayMode)
  const baseData = useMemo(() => generateData(rowCount), [rowCount])
  const rawSearchPill = searchState.pills.find((pill) => pill.columnId === RAW_SEARCH_PILL_ID)
  const rawQuery = rawSearchPill?.value.trim() ?? (searchState.pills.length === 0 ? searchState.globalQuery.trim() : '')
  // Kept between renders: a new array each time would filter all rows again (and build the find index again) on every render.
  const fieldPills = useMemo(() => searchState.pills.filter((pill) => pill.columnId !== RAW_SEARCH_PILL_ID), [searchState.pills])
  const nonDepartmentPills = useMemo(() => fieldPills.filter((pill) => pill.columnId !== 'department'), [fieldPills])
  const hasActiveSearch = searchState.globalQuery.trim().length > 0 || searchState.pills.length > 0

  const omniColumns = useMemo<OmniSearchColumn<UserRecord>[]>(() => {
    const statusOptions = uniqueSorted(baseData.map((row) => row.status))
    const planOptions = uniqueSorted(baseData.map((row) => row.plan))
    const departmentOptions = uniqueSorted(baseData.map((row) => row.department))
    const countryOptions = uniqueSorted(baseData.map((row) => row.country))
    const cityOptions = uniqueSorted(baseData.map((row) => row.city))

    return [
      { id: 'department', label: 'Department', kind: 'enum', enumOptions: departmentOptions, getValue: (row) => row.department },
      { id: 'recordId', label: 'ID', kind: 'number', getValue: (row) => row.id },
      { id: 'username', label: 'User', kind: 'text', getValue: (row) => row.username },
      { id: 'fullName', label: 'Full Name', kind: 'text', getValue: (row) => row.fullName },
      { id: 'email', label: 'Email', kind: 'text', getValue: (row) => row.email },
      { id: 'role', label: 'Role', kind: 'text', getValue: (row) => row.role },
      { id: 'country', label: 'Country', kind: 'enum', enumOptions: countryOptions, getValue: (row) => row.country },
      { id: 'city', label: 'City', kind: 'enum', enumOptions: cityOptions, getValue: (row) => row.city },
      { id: 'status', label: 'Status', kind: 'enum', enumOptions: statusOptions, getValue: (row) => row.status },
      { id: 'plan', label: 'Plan', kind: 'enum', enumOptions: planOptions, getValue: (row) => row.plan },
      { id: 'signupDate', label: 'Signup Date', kind: 'date', getValue: (row) => row.signupDate },
      { id: 'lastLoginAt', label: 'Last Login', kind: 'date', getValue: (row) => row.lastLoginAt },
      { id: 'website', label: 'Website', kind: 'text', getValue: (row) => row.website },
      { id: 'profileUrl', label: 'Profile Link', kind: 'text', getValue: (row) => row.profileUrl },
      { id: 'company', label: 'Company', kind: 'text', getValue: (row) => row.company },
      { id: 'orders', label: 'Orders', kind: 'number', getValue: (row) => row.orders },
      { id: 'sessions', label: 'Sessions', kind: 'number', getValue: (row) => row.sessions },
      { id: 'conversionRate', label: 'Conv. Rate', kind: 'number', getValue: (row) => row.conversionRate },
      { id: 'revenue', label: 'Revenue', kind: 'number', getValue: (row) => row.revenue },
      { id: 'balance', label: 'Balance', kind: 'number', getValue: (row) => row.balance },
      { id: 'mrr', label: 'MRR', kind: 'number', getValue: (row) => row.mrr },
      { id: 'arr', label: 'ARR', kind: 'number', getValue: (row) => row.arr },
      { id: 'expense', label: 'Expense', kind: 'number', getValue: (row) => row.expense },
      { id: 'score', label: 'Score', kind: 'number', getValue: (row) => row.score },
      { id: 'ticketsOpen', label: 'Tickets', kind: 'number', getValue: (row) => row.ticketsOpen },
      { id: 'renewalDate', label: 'Renewal', kind: 'date', getValue: (row) => row.renewalDate },
    ]
  }, [baseData])

  const filteredBaseData = useMemo(() => {
    const global = rawQuery.toLowerCase()

    return baseData.filter((row) => {
      const matchesGlobal =
        !global || omniColumns.some((column) => includesInsensitive(toText(column.getValue(row)), global))

      if (!matchesGlobal) {
        return false
      }

      return fieldPills.every((pill) => matchesPill(row, pill, omniColumns))
    })
  }, [baseData, fieldPills, omniColumns, rawQuery])
  const usersCountLabel =
    filteredBaseData.length === baseData.length
      ? integerFormatter.format(baseData.length)
      : `${integerFormatter.format(filteredBaseData.length)} / ${integerFormatter.format(baseData.length)}`

  const data = useMemo(() => toTableRows(filteredBaseData), [filteredBaseData])
  const departmentIdsWithSubrowMatch = useMemo(() => {
    if (!hasActiveSearch) {
      return new Set<string>()
    }

    const global = rawQuery.toLowerCase()
    const hasGlobal = global.length > 0
    const hasNonDepartmentPillFilters = nonDepartmentPills.length > 0
    const matchingDepartmentIds = new Set<string>()

    for (const row of filteredBaseData) {
      const matchesGlobalSubrowField =
        hasGlobal && omniColumns.some((column) => column.id !== 'department' && includesInsensitive(toText(column.getValue(row)), global))
      const matchesNonDepartmentPills =
        hasNonDepartmentPillFilters && nonDepartmentPills.every((pill) => matchesPill(row, pill, omniColumns))

      if (matchesGlobalSubrowField || matchesNonDepartmentPills) {
        matchingDepartmentIds.add(`department-${row.department.toLowerCase()}`)
      }
    }

    return matchingDepartmentIds
  }, [filteredBaseData, hasActiveSearch, nonDepartmentPills, omniColumns, rawQuery])

  const autoExpandedRowIds = useMemo(
    () =>
      hasActiveSearch
        ? data
            .filter((row) => row.rowType === 'department' && (row.userCount ?? 0) > 0 && departmentIdsWithSubrowMatch.has(String(row.id)))
            .map((row) => String(row.id))
        : [],
    [data, departmentIdsWithSubrowMatch, hasActiveSearch],
  )

  const numericPrecision = useMemo(() => {
    const precisionMap = Object.fromEntries(NUMERIC_COLUMNS.map((key) => [key, 0])) as Record<NumericColumnKey, number>
    const allRows: TableRow[] = []

    for (const row of data) {
      allRows.push(row)
      if (row.subRows) {
        allRows.push(...row.subRows)
      }
    }

    for (const row of allRows) {
      for (const key of NUMERIC_COLUMNS) {
        const value = row[key]
        if (typeof value === 'number') {
          precisionMap[key] = Math.max(precisionMap[key], getDecimalPlaces(value))
        }
      }
    }

    return precisionMap
  }, [data])

  const numberFormatters = useMemo(() => {
    const byKey = {} as Record<NumericColumnKey, Intl.NumberFormat>
    for (const key of NUMERIC_COLUMNS) {
      const digits = numericPrecision[key]
      byKey[key] = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    }
    return byKey
  }, [numericPrecision])

  const currencyFormatters = useMemo(() => {
    const byKey = {} as Record<(typeof CURRENCY_COLUMNS)[number], Intl.NumberFormat>
    for (const key of CURRENCY_COLUMNS) {
      const digits = numericPrecision[key]
      byKey[key] = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    }
    return byKey
  }, [numericPrecision])

  // One entry per column. The cell renderer controls its real searchable text and formatting.
  const columns = useMemo<VirtualGridColumn<TableRow>[]>(() => {
    type Spec = {
      key: keyof TableRow & string
      header: string
      size: number
      minSize: number
      meta?: Partial<ColumnMeta<TableRow>>
      accessorFn?: (row: TableRow) => unknown
      text: (row: TableRow) => string
      cell?: (row: Row<TableRow>, text: string) => ReactNode
      findText?: (row: TableRow) => string
      findCellText?: (row: TableRow) => NativeFindCell
    }
    const summary = (label: string) => <CellText className="summary-label" text={label} />
    const num = (key: NumericColumnKey) => (row: TableRow) => numberFormatters[key].format(Number(row[key]))
    const money = (key: (typeof CURRENCY_COLUMNS)[number]) => (row: TableRow) => currencyFormatters[key].format(Number(row[key]))
    const isGroup = (row: Row<TableRow>) => row.original.rowType === 'department'
    const specs: Spec[] = [
      {
        key: 'department',
        header: 'Department',
        size: 260,
        minSize: 220,
        meta: { fixed: true, minPx: 220, sticky: true },
        text: (row) => (row.rowType === 'department' ? `${row.department} ${row.userCount} users` : row.department),
        findText: (row) => row.rowType === 'department' ? `▸${row.department}${row.userCount} users` : row.department,
        // the text of a sub row starts after an indent, the text of a group row after the chevron
        cell: (row) =>
          isGroup(row) ? (
            <button className="group-toggle" type="button" onClick={row.getToggleExpandedHandler()}>
              <span className={`chevron${row.getIsExpanded() ? ' is-open' : ''}`}>▸</span>
              <strong>{highlightText(row.original.department, rawQuery)}</strong>
              <CellText className="group-count" text={`${row.original.userCount} users`} />
            </button>
          ) : (
            <span className="subrow-indent">{highlightText(row.original.department, rawQuery)}</span>
          ),
      },
      {
        key: 'recordId',
        header: 'ID',
        size: 90,
        minSize: 70,
        meta: { fixed: true, numeric: true, minPx: 70 },
        accessorFn: recordIdValue,
        text: (row) => (row.rowType === 'department' ? '-' : numberFormatters.recordId.format(Number(row.id))),
        cell: (row, text) => (isGroup(row) ? <CellText text="-" /> : highlightText(text, rawQuery)),
      },
      {
        key: 'username',
        header: 'User',
        size: 260,
        minSize: 220,
        meta: { fixed: true, minPx: 220, sticky: true },
        text: (row) => (row.rowType === 'department' ? 'Department Summary' : `@${row.username} ${row.fullName}`),
        findCellText: (row) => row.rowType === 'department' ? 'Department Summary' : [`@${row.username}`, row.fullName],
        cell: (row) =>
          isGroup(row) ? (
            summary('Department Summary')
          ) : (
            <div className="user-cell" style={{ gap: `${USER_CELL.gapRem}rem` }}>
              <img src={row.original.avatarUrl} alt="" loading="lazy" style={{ width: USER_CELL.avatar, height: USER_CELL.avatar }} />
              <div>
                <div className="user-primary" style={{ lineHeight: `${USER_CELL.primaryLine}px` }}>
                  {highlightText(`@${row.original.username}`, rawQuery)}
                </div>
                <div className="user-secondary" style={{ lineHeight: `${USER_CELL.secondaryLine}px` }}>
                  {highlightText(row.original.fullName, rawQuery)}
                </div>
              </div>
            </div>
          ),
      },
      { key: 'email', header: 'Email', size: 300, minSize: 220, meta: { minPx: 220 }, text: (row) => row.email },
      { key: 'role', header: 'Role', size: 190, minSize: 180, meta: { minPx: 180 }, text: (row) => row.role },
      { key: 'country', header: 'Country', size: 170, minSize: 160, meta: { minPx: 160 }, text: (row) => row.country },
      { key: 'city', header: 'City', size: 140, minSize: 130, meta: { minPx: 130 }, text: (row) => row.city },
      {
        key: 'status',
        header: 'Status',
        size: 130,
        minSize: 120,
        meta: { minPx: 120 },
        text: (row) => (row.rowType === 'department' ? 'Mixed' : row.status),
        cell: (row, text) =>
          isGroup(row) ? (
            summary('Mixed')
          ) : (
            <span className={`pill pill-${row.original.status.toLowerCase()}`}>{highlightText(text, rawQuery)}</span>
          ),
      },
      {
        key: 'plan',
        header: 'Plan',
        size: 140,
        minSize: 120,
        meta: { minPx: 120 },
        text: (row) => (row.rowType === 'department' ? 'Mixed' : row.plan),
        cell: (row, text) =>
          isGroup(row) ? summary('Mixed') : <span className="pill pill-plan">{highlightText(text, rawQuery)}</span>,
      },
      {
        key: 'signupDate',
        header: 'Signup Date',
        size: 150,
        minSize: 130,
        meta: { minPx: 130, numeric: true },
        text: (row) => formatDate(row.signupDate),
      },
      {
        key: 'lastLoginAt',
        header: 'Last Login',
        size: 210,
        minSize: 190,
        meta: { minPx: 190, numeric: true },
        text: (row) => formatDateTime(row.lastLoginAt),
      },
      {
        key: 'website',
        header: 'Website',
        size: 230,
        minSize: 210,
        meta: { minPx: 210 },
        text: (row) => (row.rowType === 'department' ? '-' : hostOf(row.website)),
        cell: (row, text) =>
          isGroup(row) ? (
            summary('-')
          ) : (
            <a href={row.original.website} target="_blank" rel="noreferrer" className="link-cell">
              {highlightText(text, rawQuery)}
            </a>
          ),
      },
      {
        key: 'profileUrl',
        header: 'Profile Link',
        size: 160,
        minSize: 130,
        meta: { minPx: 130 },
        text: (row) => (row.rowType === 'department' ? '-' : 'Open profile'),
        cell: (row, text) =>
          isGroup(row) ? (
            summary('-')
          ) : (
            <a href={row.original.profileUrl} target="_blank" rel="noreferrer" className="link-cell">
              {highlightText(text, rawQuery)}
            </a>
          ),
      },
      { key: 'company', header: 'Company', size: 200, minSize: 180, meta: { minPx: 180 }, text: (row) => row.company },
      { key: 'orders', header: 'Orders', size: 110, minSize: 100, meta: { minPx: 100, numeric: true }, text: num('orders') },
      { key: 'sessions', header: 'Sessions', size: 120, minSize: 110, meta: { minPx: 110, numeric: true }, text: num('sessions') },
      {
        key: 'conversionRate',
        header: 'Conv. Rate',
        size: 130,
        minSize: 120,
        meta: { minPx: 120, numeric: true },
        text: (row) => `${numberFormatters.conversionRate.format(Number(row.conversionRate))}%`,
      },
      { key: 'revenue', header: 'Revenue', size: 150, minSize: 130, meta: { minPx: 130, numeric: true }, text: money('revenue') },
      { key: 'balance', header: 'Balance', size: 150, minSize: 130, meta: { minPx: 130, numeric: true }, text: money('balance') },
      { key: 'mrr', header: 'MRR', size: 140, minSize: 120, meta: { minPx: 120, numeric: true }, text: money('mrr') },
      { key: 'arr', header: 'ARR', size: 150, minSize: 130, meta: { minPx: 130, numeric: true }, text: money('arr') },
      { key: 'expense', header: 'Expense', size: 150, minSize: 130, meta: { minPx: 130, numeric: true }, text: money('expense') },
      { key: 'score', header: 'Score', size: 100, minSize: 90, meta: { minPx: 90, numeric: true }, text: num('score') },
      { key: 'ticketsOpen', header: 'Tickets', size: 110, minSize: 100, meta: { minPx: 100, numeric: true }, text: num('ticketsOpen') },
      {
        key: 'renewalDate',
        header: 'Renewal',
        size: 150,
        minSize: 130,
        meta: { minPx: 130, numeric: true },
        text: (row) => formatDate(row.renewalDate),
      },
    ]
    return specs.map<VirtualGridColumn<TableRow>>((spec) => {
      const { accessorFn, ...column } = spec
      const renderNativeCell = (row: Row<TableRow>) => {
        const text = column.text(row.original)
        return column.cell ? column.cell(row, text) : highlightText(text, rawQuery)
      }
      return {
        ...(accessorFn ? { accessorFn, id: spec.key } : { accessorKey: spec.key }),
        header: column.header,
        minSize: column.minSize,
        size: column.size,
        meta: {
          ...column.meta,
          findText: (row: Row<TableRow>) => column.findText?.(row.original) ?? column.text(row.original),
          findCellText: (row: Row<TableRow>) => column.findCellText?.(row.original) ?? column.findText?.(row.original) ?? column.text(row.original),
        } satisfies ColumnMeta<TableRow>,
        cell: ({ row }) => renderNativeCell(row),
        renderNativeCell,
      }
    })
  }, [currencyFormatters, numberFormatters, rawQuery])

  useEffect(() => {
    writeSearchStateToUrl(TABLE_ID, searchState, sorting, autoScrollX)
  }, [autoScrollX, searchState, sorting])

  useEffect(() => {
    window.localStorage.setItem(`table.${TABLE_ID}.displayMode`, displayMode)
  }, [displayMode])

  useEffect(() => {
    window.localStorage.setItem(`table.${TABLE_ID}.xScroll`, autoScrollX)
  }, [autoScrollX])

  const displayModeIcon = displayMode === 'table' ? '▦' : displayMode === 'card' ? '▤' : '◌'
  const xScrollIcon = autoScrollX === 'left' ? '⬅' : autoScrollX === 'right' ? '➡' : '↔'
  const closeDropdown = (event: MouseEvent<HTMLButtonElement>) => {
    const details = event.currentTarget.closest('details')
    if (details) {
      details.removeAttribute('open')
    }
  }

  return (
    <div className="app-shell users-page">
      <section className="users-section">
        <div className="users-toolbar">
          <h2 className="users-title">Users ({usersCountLabel})</h2>

          <div className="search-toolbar">
            <OmniSearchBar<UserRecord> columns={omniColumns} onChange={setSearchState} initialState={initialSearchState} />
            <div className="toolbar-dropdowns">
              <details className="icon-dropdown">
                <summary className="icon-dropdown-trigger" aria-label="Display mode">
                  <span>{displayModeIcon}</span>
                </summary>
                <div className="icon-dropdown-menu" role="menu" aria-label="Display mode options">
                  <button type="button" onClick={(event) => { setDisplayMode('auto'); closeDropdown(event) }}>
                    ◌ Auto
                  </button>
                  <button type="button" onClick={(event) => { setDisplayMode('table'); closeDropdown(event) }}>
                    ▦ Table
                  </button>
                  <button type="button" onClick={(event) => { setDisplayMode('card'); closeDropdown(event) }}>
                    ▤ Card
                  </button>
                </div>
              </details>

              <details className="icon-dropdown">
                <summary className="icon-dropdown-trigger" aria-label="Horizontal auto scroll">
                  <span>{xScrollIcon}</span>
                </summary>
                <div className="icon-dropdown-menu" role="menu" aria-label="Horizontal auto scroll options">
                  <button type="button" onClick={(event) => { setAutoScrollX('off'); closeDropdown(event) }}>
                    ↔ Off
                  </button>
                  <button type="button" onClick={(event) => { setAutoScrollX('left'); closeDropdown(event) }}>
                    ⬅ Left
                  </button>
                  <button type="button" onClick={(event) => { setAutoScrollX('right'); closeDropdown(event) }}>
                    ➡ Right
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>

        <div className="users-table-slot">
          <VirtualGridTable<TableRow>
            tableId={TABLE_ID}
            data={data}
            columns={columns}
            displayMode={displayMode}
            sorting={sorting}
            onSortingChange={setSorting}
            autoScrollX={autoScrollX}
            getRowId={(row) => (row.rowType === 'department' ? String(row.id) : `user-${row.id}`)}
            getSubRows={(row) => row.subRows}
            isSubheaderRow={(row) => row.original.rowType === 'department'}
            canSubheaderStick={(row) => row.original.rowType === 'department' && row.getIsExpanded()}
            autoExpandedRowIds={autoExpandedRowIds}
            nativeFind={nativeFind}
            onFind={onFind}
            defaultExpanded
          />
        </div>
      </section>
    </div>
  )
}

export default NativeFindTableDemo
