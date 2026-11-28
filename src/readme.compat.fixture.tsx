// The README examples, type-checked by `tsc`. `src/readme.test.ts` checks that each README example matches this file.
// Keep the bodies equal to the README. Only the import paths differ.
import { NativeFindGrid } from './scrollport/react'

const getRow = (index: number) => [`id${index}`, 'Ada', 'Lovelace']

export function PeopleGrid() {
  return <NativeFindGrid rowCount={100_000} columns={3} getRow={getRow} />
}

import type { ColumnDef } from '@tanstack/react-table'
import { VirtualGridTable } from './components/VirtualGridTable'

type User = { email: string }

const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => <a href={`mailto:${row.original.email}`}>{row.original.email}</a>,
  },
]

export function PeopleTable({ users }: { users: User[] }) {
  return <VirtualGridTable tableId="people" data={users} columns={columns} displayMode="table" nativeFind />
}
