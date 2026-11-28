# Scrollport

Scrollport renders real cell text for browser-native Find in large grids and tables. The browser controls matching, counts, highlighting and navigation. Results depend on the browser, layout and dataset.

The project has a React grid demo and a TanStack table demo. Run `npm ci`, then `npm run dev`. Open `?demo=table` for the rich table. Use Ctrl+F, Cmd+F or the browser’s Find in page menu.

## Native Find rendering

`NativeFindGrid` places the real cell elements directly in groups of up to 250 rows. Each populated cell contains one text node. The grid reveals groups near the viewport. Off-screen groups use `hidden="until-found"`, which the browser treats as `content-visibility: hidden`. Groups that are shown use `content-visibility: auto`. The 100,000-row demo has 400 groups and 600,000 cells.

With `nativeFind` enabled in table mode, `VirtualGridTable` renders the current row model and all visible columns. Filters and collapsed groups limit which rows enter that model. The table applies `content-visibility: auto` to individual rows. Find uses the text from the real cell renderers, including links and formatted text. The browser results are in "Limits and evidence".

Each row is a memoised component. A hover on a column handle, a sort hover or a resize drag does not render the cells of every row again. The column highlight is one style rule for the whole table. In this mode a column resize applies when the user releases the handle. The release changes the column widths, so it renders every row once. During the drag the column keeps its old width.

A memoised row renders again only when its row data, the columns or its row state change. A cell renderer must therefore not read state from outside, such as a ref, a module variable or `table.options.meta`. When such state changes, create the `columns` array again.

The table sets `--vgt-row-height` and `--vgt-header-height` on `.table-inner`. The height of a row and the offset of a sticky department row come from these values and from the `rowHeight` prop.

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
  return <VirtualGridTable tableId="people" data={users} columns={columns} displayMode="table" nativeFind />
}
```

Render searchable text directly in each displayed cell. Keep the browser’s own Find styling and navigation.

## Limits and evidence

Browser Find requires searchable text in the DOM. Memory use grows with the number of cells and the complexity of their content. `content-visibility: auto` defers rendering work and keeps the DOM text in place.

The table with `nativeFind` puts every row of the row model in the DOM. Use it with a bounded number of rows. A table of 100,000 rows with about 25 columns holds millions of DOM nodes. Scrollport has no tested limit for this mode. Filter or group the data first.

Each browser run below tests one build, one table size and one query sequence. No run covers the whole matrix.

| Browser or run | What it covers | What it does not cover |
|---|---|---|
| Firefox | A bounded table of 800 rows, on commit `c5ed5b8` only. This run accepted the stale geometry fix for that table. | Any later commit. Any larger table. |
| Chromium, desktop | The grouped grid on an earlier real-text build. Replacing a near-row query reached and highlighted the text of the last row. The Find bar showed `0/1`, then `0/0` after the next-match command, while the cell stayed highlighted. A fresh last-row query on another earlier build showed `1/1`. | The current head of this branch. Acceptance on the current head is pending. |
| Android 15, Chrome 124 | A standalone fixture of 1,000 rows with 25 columns scrolled to and highlighted real cells. In the grouped product table with 1,000 rows, Chrome reported `1/1` for an email, but the target text was still outside the visible area in the capture. | Product support. The standalone results do not establish it. |
| Safari, macOS, iOS | Not tested. | Everything. |
| Table of 100,000 rows | Not accepted in any browser. In the standalone fixture of 100,000 rows on Android, Find stalled and Android stopped the renderer because of memory pressure. | Everything. |

Automated tests run in jsdom. They check the DOM text, the number of renders and the compatibility of the types. They do not run a browser Find bar.

Open point: the grid sets `content-visibility` in the style sheet and not inline, so that `hidden="until-found"` keeps its browser behaviour. A real browser must confirm that `beforematch` still fires for a hidden group.

## Compatibility migration

The package is private and has version `0.0.0`. It was never published. The changes below are therefore a documented break for the code in this repository, and not a semantic version change.

The `core` helpers remain available for pure text and layout calculations. The `NativeFind` object audits displayed DOM text. The browser owns the Find query, the match count, the highlight and the navigation. The pure layout helpers still return calculated text and positions, but Scrollport does not apply their outputs to browser Find.

### `NativeFind`

- `query` and `reset()` stay in the type as deprecated members. `query` is always an empty string. `reset()` does nothing.
- `textLength` and `chunkCount` are now counted when the code reads them. They are no longer counted at mount.
- The sparse index, the highlight geometry and the transparent layer are gone.

### `createNativeFind`

- Before: it built hidden text for all rows, so all rows were findable.
- Now: it reads the cells that the caller renders. It never adds text. An empty host stays empty, even when the audit source describes expected text.
- In development builds it writes one `console.warn` for each host when `rowCount` is larger than the number of rows in the host. Find then reaches the rendered rows only.

### `useFindIndex`

- Before: it built the index for all rows.
- Now: it observes the cells that the caller renders. It does not add text to the page.
- The new option `materializeRows` (default `false`) fills empty `.sp-row[data-row]` placeholders from the source accessor. The row must have the class `sp-row` and a `data-row` attribute.
- The new option `materializeKey` fills the placeholders of new rows when its value changes. Rows that stay keep their cells, so a selection survives a scroll. A change of the source accessor or of the row count fills all rows again.
- `onFind` runs when the observer starts or stops. A change of `materializeKey` does not run it, and the hook uses the newest `onFind` function.
- `useFindIndex` writes the same development warning as `createNativeFind`.

### `useNativeFind`

- Before: it returned a window of rows near the viewport, and all rows were findable through the index.
- Now: it still returns a window (`first` and `end`), so the grid keeps its virtualisation. The hook fills each `.sp-row[data-row]` placeholder in the window with real cell text, and again when the window moves. Find reaches the rows in the window only. This is the intended choice: the hook never renders 100,000 rows for a legacy grid.
- The new option `renderAllRows` (default `false`) sets `first` to 0 and `end` to `rowCount`. Use it only when you accept one DOM row for each source row.
- For a large grid that Find must fully reach, use `NativeFindGrid`.

### `IndexedText`

It renders ordinary selectable text. Before, the text sat in an `inert` element. An observer does not add a second copy of the text.

### `NativeFindGrid` and `VirtualGridTable`

`NativeFindGrid.onFind` and `VirtualGridTable.onFind` stay. Their callbacks observe real text. `NativeFindGrid` renders every row in `hidden="until-found"` groups. `VirtualGridTable` with `nativeFind` renders every row of the row model.

### Style sheet

- The rules `.sp-row`, `.sp-row-odd` and `.sp-row-active` are back, so the rows of a legacy grid and the `activeRow` mark look as before. The row stays absolutely positioned, and the caller sets its `top` and `height`.
- The rules for `[data-sp-layer='transparent']` are removed with the transparent layer.
- The page keeps the browser colours for Find. Scrollport does not style `::search-text`.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
```

## Licence

MIT. See `LICENSE`.
