import { describe, expect, it } from 'vitest'
import { generateData } from './data'
import { recordIdValue, toTableRows } from './App'

describe('table demo row model', () => {
  it('uses generated records directly as subrows and keeps their numeric ids', () => {
    const records = generateData(30)
    const groups = toTableRows(records)
    const subrows = groups.flatMap((group) => group.subRows ?? [])

    expect(subrows).toHaveLength(records.length)
    expect(subrows.some((row) => row === records[0])).toBe(true)
    expect(subrows.every((row) => typeof row.id === 'number')).toBe(true)
    expect(subrows.every((row) => row.recordId === undefined && row.rowType === undefined)).toBe(true)
    expect(groups.every((row) => typeof row.id === 'string' && row.rowType === 'department')).toBe(true)
    expect(recordIdValue(records[0])).toBe(records[0].id)
    expect(recordIdValue(groups[0])).toBeUndefined()

    const selected = [records[9], records[2], records[19]].map(recordIdValue).sort((left, right) => (left ?? 0) - (right ?? 0))
    expect(selected).toEqual([3, 10, 20])
  })
})
