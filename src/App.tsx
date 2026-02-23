import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { generateData, type UserRecord } from './data'
import {
  OmniSearchBar,
  RAW_SEARCH_PILL_ID,
  type OmniSearchColumn,
  type OmniSearchPill,
  type OmniSearchState,
} from './components/OmniSearchBar'
import { VirtualGridTable, type ColumnMeta, type TableDisplayMode } from './components/VirtualGridTable'

type TableRow = {
  id: string
  recordId: number
  rowType: 'department' | 'user'
  department: string
  username: string
  avatarUrl: string
  fullName: string
  email: string
  role: string
  country: string
  city: string
  status: UserRecord['status']
  plan: UserRecord['plan']
  signupDate: string
  lastLoginAt: string
  website: string
  profileUrl: string
  company: string
  orders: number
  sessions: number
  conversionRate: number
  revenue: number
  balance: number
  mrr: number
  arr: number
  expense: number
  score: number
  ticketsOpen: number
  renewalDate: string
  userCount: number
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

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}

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
    parts.push(
      <mark key={`${matchIndex}-${end}`} className="cell-highlight">
        {source.slice(matchIndex, end)}
      </mark>,
    )
    cursor = end
    matchIndex = lowerSource.indexOf(lowerNeedle, cursor)
  }

  if (cursor < source.length) {
    parts.push(source.slice(cursor))
  }

  return parts.length > 0 ? parts : source
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

function toTableRows(records: UserRecord[]): TableRow[] {
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

      const subRows: TableRow[] = users
        .sort((a, b) => a.username.localeCompare(b.username))
        .map((user) => ({
          ...user,
          id: `user-${user.id}`,
          recordId: user.id,
          rowType: 'user',
          userCount: 1,
        }))

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

function App() {
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
  const [displayMode, setDisplayMode] = useState<TableDisplayMode>(initialDisplayMode)
  const baseData = useMemo(() => generateData(10_000), [])
  const rawSearchPill = searchState.pills.find((pill) => pill.columnId === RAW_SEARCH_PILL_ID)
  const rawQuery = rawSearchPill?.value.trim() ?? (searchState.pills.length === 0 ? searchState.globalQuery.trim() : '')
  const fieldPills = searchState.pills.filter((pill) => pill.columnId !== RAW_SEARCH_PILL_ID)
  const nonDepartmentPills = fieldPills.filter((pill) => pill.columnId !== 'department')
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
            .filter((row) => row.rowType === 'department' && row.userCount > 0 && departmentIdsWithSubrowMatch.has(row.id))
            .map((row) => row.id)
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

  const columns = useMemo<ColumnDef<TableRow>[]>(
    () => [
      {
        accessorKey: 'department',
        header: 'Department',
        minSize: 220,
        size: 260,
        meta: { fixed: true, minPx: 220, sticky: true } as ColumnMeta,
        cell: ({ row, getValue }) =>
          row.original.rowType === 'department' ? (
            <button className="group-toggle" type="button" onClick={row.getToggleExpandedHandler()}>
              <span className={`chevron${row.getIsExpanded() ? ' is-open' : ''}`}>▸</span>
              <strong>{highlightText(String(getValue()), rawQuery)}</strong>
              <span className="group-count">{row.original.userCount} users</span>
            </button>
          ) : (
            <span className="subrow-indent">{highlightText(String(getValue()), rawQuery)}</span>
          ),
      },
      {
        accessorKey: 'recordId',
        header: 'ID',
        size: 90,
        minSize: 70,
        meta: { fixed: true, numeric: true, minPx: 70 } as ColumnMeta,
        cell: ({ row, getValue }) =>
          row.original.rowType === 'department'
            ? '-'
            : highlightText(numberFormatters.recordId.format(Number(getValue())), rawQuery),
      },
      {
        accessorKey: 'username',
        header: 'User',
        size: 260,
        minSize: 220,
        meta: { fixed: true, minPx: 220, sticky: true } as ColumnMeta,
        cell: ({ row }) =>
          row.original.rowType === 'department' ? (
            <span className="summary-label">Department Summary</span>
          ) : (
            <div className="user-cell">
              <img src={row.original.avatarUrl} alt={row.original.username} loading="lazy" />
              <div>
                <div className="user-primary">{highlightText(`@${row.original.username}`, rawQuery)}</div>
                <div className="user-secondary">{highlightText(row.original.fullName, rawQuery)}</div>
              </div>
            </div>
          ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        minSize: 220,
        size: 240,
        meta: { minPx: 220 } as ColumnMeta,
        cell: ({ getValue }) => highlightText(String(getValue()), rawQuery),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        minSize: 180,
        size: 190,
        meta: { minPx: 180 } as ColumnMeta,
        cell: ({ getValue }) => highlightText(String(getValue()), rawQuery),
      },
      {
        accessorKey: 'country',
        header: 'Country',
        minSize: 160,
        size: 170,
        meta: { minPx: 160 } as ColumnMeta,
        cell: ({ getValue }) => highlightText(String(getValue()), rawQuery),
      },
      {
        accessorKey: 'city',
        header: 'City',
        minSize: 130,
        size: 140,
        meta: { minPx: 130 } as ColumnMeta,
        cell: ({ getValue }) => highlightText(String(getValue()), rawQuery),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        minSize: 120,
        size: 130,
        meta: { minPx: 120 } as ColumnMeta,
        cell: ({ row, getValue }) =>
          row.original.rowType === 'department' ? (
            <span className="summary-label">Mixed</span>
          ) : (
            <span className={`pill pill-${String(getValue()).toLowerCase()}`}>{highlightText(String(getValue()), rawQuery)}</span>
          ),
      },
      {
        accessorKey: 'plan',
        header: 'Plan',
        minSize: 120,
        size: 140,
        meta: { minPx: 120 } as ColumnMeta,
        cell: ({ row, getValue }) =>
          row.original.rowType === 'department' ? (
            <span className="summary-label">Mixed</span>
          ) : (
            <span className="pill pill-plan">{highlightText(String(getValue()), rawQuery)}</span>
          ),
      },
      {
        accessorKey: 'signupDate',
        header: 'Signup Date',
        minSize: 130,
        size: 150,
        meta: { minPx: 130, numeric: true } as ColumnMeta,
        cell: ({ getValue }) => highlightText(formatDate(String(getValue())), rawQuery),
      },
      {
        accessorKey: 'lastLoginAt',
        header: 'Last Login',
        minSize: 190,
        size: 210,
        meta: { minPx: 190, numeric: true } as ColumnMeta,
        cell: ({ getValue }) => highlightText(formatDateTime(String(getValue())), rawQuery),
      },
      {
        accessorKey: 'website',
        header: 'Website',
        minSize: 210,
        size: 230,
        meta: { minPx: 210 } as ColumnMeta,
        cell: ({ row, getValue }) => {
          if (row.original.rowType === 'department') {
            return <span className="summary-label">-</span>
          }
          const href = String(getValue())
          const host = new URL(href).host
          return (
            <a href={href} target="_blank" rel="noreferrer" className="link-cell">
              {highlightText(host, rawQuery)}
            </a>
          )
        },
      },
      {
        accessorKey: 'profileUrl',
        header: 'Profile Link',
        minSize: 130,
        size: 160,
        meta: { minPx: 130 } as ColumnMeta,
        cell: ({ row, getValue }) => {
          if (row.original.rowType === 'department') {
            return <span className="summary-label">-</span>
          }
          const href = String(getValue())
          return (
            <a href={href} target="_blank" rel="noreferrer" className="link-cell">
              {highlightText('Open profile', rawQuery)}
            </a>
          )
        },
      },
      {
        accessorKey: 'company',
        header: 'Company',
        minSize: 180,
        size: 200,
        meta: { minPx: 180 } as ColumnMeta,
        cell: ({ getValue }) => highlightText(String(getValue()), rawQuery),
      },
      {
        accessorKey: 'orders',
        header: 'Orders',
        minSize: 100,
        size: 110,
        meta: { minPx: 100, numeric: true } as ColumnMeta,
        cell: ({ getValue }) => highlightText(numberFormatters.orders.format(Number(getValue())), rawQuery),
      },
      {
        accessorKey: 'sessions',
        header: 'Sessions',
        minSize: 110,
        size: 120,
        meta: { minPx: 110, numeric: true } as ColumnMeta,
        cell: ({ getValue }) => highlightText(numberFormatters.sessions.format(Number(getValue())), rawQuery),
      },
      {
        accessorKey: 'conversionRate',
        header: 'Conv. Rate',
        minSize: 120,
        size: 130,
        meta: { minPx: 120, numeric: true } as ColumnMeta,
        cell: ({ getValue }) =>
          highlightText(`${numberFormatters.conversionRate.format(Number(getValue()))}%`, rawQuery),
      },
      {
        accessorKey: 'revenue',
        header: 'Revenue',
        minSize: 130,
        size: 150,
        meta: { minPx: 130, numeric: true } as ColumnMeta,
        cell: ({ getValue }) => highlightText(currencyFormatters.revenue.format(Number(getValue())), rawQuery),
      },
      {
        accessorKey: 'balance',
        header: 'Balance',
        minSize: 130,
        size: 150,
        meta: { minPx: 130, numeric: true } as ColumnMeta,
        cell: ({ getValue }) => highlightText(currencyFormatters.balance.format(Number(getValue())), rawQuery),
      },
      {
        accessorKey: 'mrr',
        header: 'MRR',
        minSize: 120,
        size: 140,
        meta: { minPx: 120, numeric: true } as ColumnMeta,
        cell: ({ getValue }) => highlightText(currencyFormatters.mrr.format(Number(getValue())), rawQuery),
      },
      {
        accessorKey: 'arr',
        header: 'ARR',
        minSize: 130,
        size: 150,
        meta: { minPx: 130, numeric: true } as ColumnMeta,
        cell: ({ getValue }) => highlightText(currencyFormatters.arr.format(Number(getValue())), rawQuery),
      },
      {
        accessorKey: 'expense',
        header: 'Expense',
        minSize: 130,
        size: 150,
        meta: { minPx: 130, numeric: true } as ColumnMeta,
        cell: ({ getValue }) => highlightText(currencyFormatters.expense.format(Number(getValue())), rawQuery),
      },
      {
        accessorKey: 'score',
        header: 'Score',
        minSize: 90,
        size: 100,
        meta: { minPx: 90, numeric: true } as ColumnMeta,
        cell: ({ getValue }) => highlightText(numberFormatters.score.format(Number(getValue())), rawQuery),
      },
      {
        accessorKey: 'ticketsOpen',
        header: 'Tickets',
        minSize: 100,
        size: 110,
        meta: { minPx: 100, numeric: true } as ColumnMeta,
        cell: ({ getValue }) => highlightText(numberFormatters.ticketsOpen.format(Number(getValue())), rawQuery),
      },
      {
        accessorKey: 'renewalDate',
        header: 'Renewal',
        minSize: 130,
        size: 150,
        meta: { minPx: 130, numeric: true } as ColumnMeta,
        cell: ({ getValue }) => highlightText(formatDate(String(getValue())), rawQuery),
      },
    ],
    [currencyFormatters, numberFormatters, rawQuery],
  )

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
            getRowId={(row) => row.id}
            getSubRows={(row) => row.subRows}
            isSubheaderRow={(row) => row.original.rowType === 'department'}
            canSubheaderStick={(row) => row.original.rowType === 'department' && row.getIsExpanded()}
            autoExpandedRowIds={autoExpandedRowIds}
          />
        </div>
      </section>
    </div>
  )
}

export default App
