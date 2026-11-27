# Scrollport

Scrollport renders real cell text for browser-native Find in large grids and tables. The browser controls matching, counts, highlighting and navigation. Results depend on the browser, layout and dataset.

The project has a React grid demo and a TanStack table demo. Run `npm ci`, then `npm run dev`. Open `?demo=table` for the rich table. Use Ctrl+F, Cmd+F or the browser’s Find in page menu.

## Native Find rendering

`NativeFindGrid` places the real cell elements directly in groups of up to 250 rows. Each populated cell contains one text node. The grid reveals groups near the viewport and uses `hidden="until-found"` and `content-visibility: auto` for off-screen groups. The 100,000-row demo has 400 groups and 600,000 cells.

With `nativeFind` enabled in table mode, `VirtualGridTable` renders the current row model and all visible columns. Filters and collapsed groups limit which rows enter that model. The table applies `content-visibility: auto` to individual rows. Find uses the text from the real cell renderers, including links and formatted text.

With `nativeFind` enabled, `displayMode="auto"` selects the table even at narrow widths. On narrow screens, scroll horizontally to see other columns. Explicit `displayMode="card"` uses virtualised card groups, so Find covers only the cards currently in the DOM. With `nativeFind` disabled, table mode uses row and column virtualisation.

## Example

```tsx
import { NativeFindGrid } from './scrollport/react'

const getRow = (index: number) => [`id${index}`, 'Ada', 'Lovelace']

export function PeopleGrid() {
  return <NativeFindGrid rowCount={100_000} columns={3} getRow={getRow} />
}
```

A table cell can render a link with searchable text.

```tsx
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
  return <VirtualGridTable data={users} columns={columns} displayMode="table" nativeFind />
}
```

Render searchable text directly in each displayed cell. Keep the browser’s own Find styling and navigation.

## Limits and evidence

Browser Find requires searchable text in the DOM. Memory use grows with the number of cells and the complexity of their content. `content-visibility: auto` defers rendering work and keeps the DOM text in place.

In the grouped desktop grid, replacing a near-row query in Chromium reached and highlighted the last row’s actual text. The Find bar showed `0/1`, then `0/0` after the next-match command while the cell remained highlighted. A fresh last-row query on an earlier real-text build reached the row and showed `1/1`. That run tested a different build and query sequence.

On Android 15 with Chrome 124, a standalone 1,000-row fixture with 25 columns scrolled to and highlighted real cells. In the standalone 100,000-row fixture, Find stalled and Android killed the renderer under memory pressure. In the grouped product table at 1,000 rows, Chrome reported `1/1` for an email, but the target text was still outside the visible area in the capture. The standalone fixture results do not establish product support.

## Compatibility migration

The `core` helpers remain available for pure text and layout calculations. The `NativeFind` object now audits displayed DOM text. It does not expose browser Find query state, reset controls, sparse index state, or highlight geometry.

`useNativeFind`, `useFindIndex`, `IndexedText`, `NativeFindGrid.onFind`, and `VirtualGridTable.onFind` remain available. Their callbacks observe real text. `IndexedText` renders ordinary selectable text. An observer does not add a second copy of text.

`createNativeFind` audits text that the caller already renders. The caller must render its own links, controls, formatting, and cells inside the observed host. Empty hosts stay empty, even when the audit source describes expected text.

The pure layout helpers still return calculated text and positions. Scrollport does not apply their outputs to browser Find. The browser owns query state, match counts, highlighting, and navigation.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
```

## Licence

MIT. See `LICENSE`.
