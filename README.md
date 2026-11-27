# Scrollport

Scrollport keeps browser-native Find available in large grids and tables. The browser searches the same DOM text that the user sees. The browser also paints each match and controls Find navigation.

The project has a React grid demo and a TanStack table demo. Run `npm ci`, then `npm run dev`. Press Ctrl+F or Cmd+F to open the browser Find bar. Open `?demo=table` for the rich table.

## Native Find rendering

`NativeFindGrid` renders each cell as ordinary visible text. `VirtualGridTable` does the same when `nativeFind` is enabled in table mode. These modes keep all rows and visible columns in the DOM. They apply `content-visibility: auto` to defer layout and painting outside the viewport.

Each cell has one displayed text source. Rich cells keep their real links, buttons, images, formatting, and selectable text. A custom cell renderer controls the text that browser Find can match. Text in separate cells remains separate.

The table keeps its normal virtual rendering when `nativeFind` is off. In card mode, the table does not enable full-dataset native Find. The browser still searches content that currently exists in the DOM.

## Example

```tsx
import { NativeFindGrid } from './scrollport/react'

const getRow = (index: number) => [`id${index}`, 'Ada', 'Lovelace']

<NativeFindGrid rowCount={100_000} columns={3} getRow={getRow} />
```

For rich table cells, render their actual content normally:

```tsx
const columns = [
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => <a href={`mailto:${row.original.email}`}>{row.original.email}</a>,
  },
]

<VirtualGridTable data={users} columns={columns} displayMode="table" nativeFind />
```

Do not add a second text index for browser Find. Do not make the displayed text inert. Keep browser Find styling and navigation native.

## Limits and evidence

Browser Find requires searchable text in the DOM. The memory cost grows with the number of rows, columns, and rendered cell elements. `content-visibility: auto` defers rendering work. It does not remove DOM text.

Android 15 with Chrome 124 passed real Find checks on a 1,000-row fixture with 25 rich columns. A 100,000-row fixture with 2.5 million cell text nodes stalled during Find and the renderer reached about 1.49 GiB RSS before Android killed it. The test device had about 2.53 GB total memory. Full details and screenshots are in the preserved Android test evidence.

Desktop Chromium and Firefox checks for this implementation must use their real Find controls. DOM row reach alone does not prove a pass. See the project test report for the checked build, native bar count, active cell, screenshots, and remaining limits.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
```

## Licence

MIT. See `LICENSE`.
