# Scrollport

Scrollport makes the native browser find bar (Ctrl+F or Cmd+F) work in a virtual list. A grid of 100000 rows draws only the rows in view. The find bar still finds every row, shows the true number of matches, and Enter walks the matches in order while the grid follows.

It has a framework-free core, a React hook, a React grid component and a native find mode for the TanStack table in this repository. There is no find box of its own: the user keeps the browser find bar.

> Two demos, 100000 rows each. Run `npm run dev`, press Ctrl+F and type `qx7r0099999` (the last row), `qx7r0050000` or `berlin` in the grid demo. Open `?demo=table` for the rich table and search `sophia.ward971` (the last row), `bennett81` (100 matches) or `berlin` (12536 matches).

## Why native find breaks in virtual lists

A virtual list draws only the rows that are in view. The other rows do not exist in the page. The browser find bar can match only text that is in the DOM, so it reports "no matches" for most of the list.

The usual fix is a search box of your own. That loses the find bar, its match counter, its keyboard shortcuts and the habits of the user. A page cannot learn what the user typed in the find bar, so the page cannot build the missing rows on demand. Chrome never tells the page. Firefox does tell the page in some cases, but not for pasted text.

## How Scrollport solves it

Scrollport keeps the text of all rows in the DOM, but not as rows:

- The text is in a few **index chunks**: 100 rows per chunk, one text node per chunk, one line per row, a tab between the cells.
- Almost all chunks have `hidden="until-found"`. They cost no layout and no scroll height.
- The grid draws only the row backgrounds in view. The chunks near the view are shown over them, so the text you see is the index text.
- When the find bar hits a hidden chunk, the browser shows it, fires `beforematch` and scrolls the grid to the match. Scrollport keeps the chunk of the last hit until the next hit.
- Firefox gives the find text to the page through the selection. When a query touches at most 100 chunks, Scrollport drops all other chunks (sparse mode). This keeps the document small. Firefox loses Enter presses after a wrap when the document holds too much text. Scrollport chooses this mode by behaviour, never by user agent.

The find bar total is the true total, with no cap on the page side. The cost is memory: all row text sits in the page (see "Known limits").

## Quick start

```sh
npm ci
npm run dev        # demo on the address that Vite prints
npm test           # unit tests
npm run build      # static site in dist/, works under any sub-path
```

The code lives in `src/scrollport/`. The package is not on npm yet: copy the folder or import it from the repository.

### React

```tsx
import { useCallback } from 'react'
import { NativeFindGrid } from './scrollport/react'

const getRow = (i: number) => [`id${i}`, 'Ada', 'Lovelace']

export function People() {
  const stable = useCallback(getRow, [])
  return <NativeFindGrid rowCount={100_000} columns={3} getRow={stable} />
}
```

### Without a framework

```ts
import { createNativeFind } from './scrollport/core'

// scroller: the element that scrolls. host: a child with position: relative
// and a height of rowCount * rowHeight.
const find = createNativeFind({
  scroller,
  host,
  rowCount: 100_000,
  rowHeight: 32,
  getRowText: (i) => `id${i}\tAda\tLovelace`,
})
// ... draw the rows in view yourself ...
find.destroy()
```

You draw the rows in view. Scrollport adds the text. Draw only backgrounds (no text) in the rows, or the find bar counts a row twice.

### A table with rich cells (`VirtualGridTable`)

`VirtualGridTable` (TanStack table and virtual, avatars, links, pills, sticky columns, grouped rows) has a `nativeFind` prop. Open `?demo=table` for the demo with 100000 rows.

```tsx
const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'email',
    header: 'Email',
    // The text that the cell shows. Without findText the index holds String(row.getValue(columnId)).
    meta: { findText: (row) => row.original.email } satisfies ColumnMeta<User>,
    // The cell draws its text with IndexedText: inert text that the find bar skips.
    cell: ({ row }) => <IndexedText text={row.original.email} />,
  },
]

<VirtualGridTable data={users} columns={columns} nativeFind />
```

How it works:

- The row text is **one line per row of the row model**, in the order that the table shows it: after sorting, filtering and expanding. A tree table indexes the group row and its expanded sub rows. Collapsed rows are not in the index.
- The index text is **drawn in the font of the visible text**, so a find highlight has the width and the height of the real text. The table reads the font and the baseline of a cell from a copy of a cell that is not on screen (`readNativeFindFont`, `readNativeFindBaseline`). Digits are tabular in every cell (`.td`), so one font serves all cells. The cells of a line are **placed at the column edges** with tab characters and a few spaces: a tab goes to the next multiple of the tab stop (10 px), and up to 14 spaces (about 4 px each) bring the left edge of the text within 1 px of the real text. Right aligned (numeric) columns align to the right edge. The width of a text is measured (canvas, with the kerning of each pair of characters). The tab after a text goes to the next tab stop, but a browser skips a stop that is too close: Chromium 157 skips a stop closer than half a space, Firefox 160 a stop closer than half of `1ch` (as the CSS text specification says). The layout ends a text only where the two browsers agree, with 0.6 px to spare. Otherwise every later cell of the row would move by one tab stop.
- A text in **another font** (a pill, the label of a group row), or on **another line** of its cell (the user cell: a handle above a name), lies in a span. The span is in the row text, between the tabs, so Enter still walks the matches left to right, top to bottom. It has `position: relative` and `line-height: 0`, so it moves the drawing and the highlight, and the next cell stays where it is. It has the font of its text, the left offset from the tab stop to the real left edge, the top offset from the baseline of the row text to the baseline of its text, and, when needed, a right margin that puts its end between two tab stops, away from the edges of the skip rule. Spans share a few CSS classes (one per font and offset), because a style on each span made Firefox slow. A cell gives its lines as an array (`ColumnMeta.findText`). `ColumnMeta.findLines` (or a place on the line itself) gives for each line the font, the distance from the start of the cell text (`dx`) and the baseline from the centre of the row (`baseline`, or `dy` from the centre of the line). A line can follow the line before it (`gap`, written without a tab): the group row uses this for its name and its count of users. The demo reads all of these from copies of its own cells (`cellText` in `App.tsx`).
- The index text is **transparent** and lies over the real cells. The real cells draw their text with `IndexedText`: the text is in the page but `inert`, so the find bar does not count it. Without this, each row in view would match twice.
- A find hit opens its chunk and the browser scrolls the table (down and across) to the match. The browser highlight of the match is then painted over the real cell, with the matched characters in the text colour.
- The index is built again when the rows change (sort, filter, expand, new data) or a column changes size. Cell texts are kept per row, so a sort or a filter only joins them again.
- `nativeFind` gives every column the width of its `size`. A flexible column (`1fr`) would move the cells away from the index. A table that is narrower than its columns total leaves the free space empty on the right.

Cost of the demo (100000 users, 25 columns, 100007 rows with the group rows), measured on 25 Nov 2026 in Chromium 157 and Firefox 160 on a Linux host (16 cores) at a load average of 40 to 100. Main (before the font based layout) and this build were loaded in turns, 3 times for main and 2 times for this build:

| What | Main (monospace index) | This build (font of the text) |
|---|---|---|
| Index text in the page | 39.1 MB | 54.4 MB (Chromium), 51.8 MB (Firefox) |
| Spans in the index | 0 | 620000 (Chromium), 693000 (Firefox) |
| First build of the index, Chromium | 3.5 to 3.8 s | 8.7 to 9.0 s |
| First build of the index, Firefox | 3.3 to 3.4 s | 8.7 to 9.1 s |
| JS heap after the load, Chromium | 0.70 GB | 0.52 GB |

The font based layout costs about 2.5 times the build time and 40% more text, because the width of every text is measured and a text moves to its place with spaces and spans. One Firefox content process held 8 GB after 6 loads of the page in the same browser (2.7 GB after one load). A style on each span (an inline `style`) made Firefox spend more than 10 minutes on the 693000 spans: the spans share CSS classes now, and Firefox builds in 9 s. The earlier measures of the sort, collapse and expand (1.3 to 1.8 s) and of the browser memory (2.2 GB in a fresh browser) are for the monospace index and were not measured again.

The build runs on the main thread. During a build the page does not respond. Changing the data while the find bar is open ends the current find: the old chunks leave the page.

`VirtualGridTable` props for this: `nativeFind`, `onFind(find | null)` (the core object, for tests and tools) and `defaultExpanded` (start with every group row expanded). `ColumnMeta.findText(row)` gives the text of a cell.

## API

### `createNativeFind(options): NativeFind` (`core.ts`)

| Option | Type | Meaning |
|---|---|---|
| `scroller` | `HTMLElement` | The element that scrolls. |
| `host` | `HTMLElement` | Child of the scroller with `position: relative` and a height of `rowCount * rowHeight`. The index goes here. |
| `rowCount` | `number` | Number of rows. |
| `rowHeight` | `number` | Row height in px. The index uses it as its line height. |
| `getRowText` | `(row) => string` | Text of one row. Separate the cells with a tab. Line breaks become spaces. Use this (a visible index) or `getRowCells` with `columns`. |
| `getRowCells` | `(row) => (string \| (string \| { text, dx?, dy?, baseline?, font?, gap? })[])[]` | Text of the cells of one row, for a transparent index over rows that draw their own text. Tabs and line breaks in a cell become spaces. A cell is a string (placed at the start of its column) or an array of lines. Each line is placed exactly (see `columns`). |
| `columns` | `{ start, end, align?, font?, baseline?, lines? }[]` | Text area of each column in px from the left edge of the host. `align: 'end'` for right aligned cells. `font` and `baseline` of the visible text of the column (default: `font` and `baseline` of the options). `lines[k]` is `{ dx?, dy?, baseline?, font?, gap? }` for line `k` of a multi-line cell: `dx` from `start`, `baseline` from the centre of the row to the baseline of the text (or `dy` from the centre of the row to the centre of the line, negative is up), `font` the font of the line, `gap` the distance from the end of the line before. Needed with `getRowCells`. |
| `rowTop` | `number` | Distance from the top of the host to row 0, for example a sticky header. Default 0. |
| `tabQuantum` | `number` | Distance between tab stops of the transparent index in px. Smaller is more exact and costs more text. Default 20 (the table uses 10: `findTabQuantum`). |
| `font` | `NativeFindFont` | The font of the visible text of most cells (`readNativeFindFont`). The index draws its text in it. Without it the index is monospace and a highlight is as wide as monospace text. |
| `baseline` | `number` | Distance from the centre of a row to the baseline of the visible text of most cells (`readNativeFindBaseline`). |
| `charWidth` | `number` | Width of one index character in px (of a space with `font`). Measured when not set. |
| `zIndex` | `number` | `z-index` of the transparent index. It must be above the cells and below a sticky header. Default 1. |
| `rowsPerChunk` | `number` | Default 100. |
| `sparseMaxChunks` | `number` | Most chunks that a query may touch to switch to sparse mode. Default 100. |
| `tabSize` | `number` | Column width in px. Default 120. |
| `indent` | `number` | Left padding of the text in px. Default 8. |
| `onActiveRow` | `(row) => void` | The browser moved the selection onto a row. Firefox does this for the find match. Chrome does not. |

The returned object has `mode` (`'full'` or `'sparse'`), `query` (the find text, only in Firefox), `chunkCount`, `textLength` (characters of index text), `buildMs`, `attachedChunks`, `reset()`, `audit(query)` and `destroy()`. `audit` counts what native find can match for a query and compares it with the data. The tests use it.

The module also exports the pure helpers `chunkCount`, `chunkOfRow`, `rowsOfChunk`, `rowAtOffset`, `rowOfPoint`, `chunksOfQuery`, `cleanLine`, `cleanCell`, `alignCells` (the line of a transparent index) and `layoutCells` (the line and the placed lines).

### `useFindIndex`, `IndexedText`, `useNativeFind` and `NativeFindGrid` (`react.tsx`)

`useFindIndex(scrollerRef, hostRef, options)` builds the index inside a scroller and a host that you render, and builds it again when `rowCount`, an accessor or `columns` change. It takes the options of the core (without the elements) plus `enabled`, `activeRowMs` and `onFind`. Pass stable functions and a stable `columns` array. `VirtualGridTable` uses it.

`IndexedText({ text, as?, className? })` draws inert text that the find bar skips. Use it for all text in the cells of a table with a transparent index.

`useNativeFind` takes the same options (without `scroller`, `host` and `onActiveRow`) plus `activeRowMs` and `onFind`. It returns `scrollerRef`, `hostRef`, the rows to draw (`first`, `end`) and `activeRow`. Pass a stable `getRowText`: the index is built again when it changes.

`NativeFindGrid` props: `rowCount`, `columns`, `getRow(row) => string[]`, `rowHeight` (32), `columnWidth` (120), `height`, `id`, `className`, `onFind`.

## Browser support

Measured with the real browser find bar (real key presses, real clipboard, screenshots of the bar), on Linux, against the built demo with 100000 rows. Each far-row run types or pastes one query, then presses Enter 34 and 117 times and checks the bar text and the row of the active match.

| Browser | Far rows (70 runs) | Old regression set | What the bar shows |
|---|---|---|---|
| Chromium 157.0.8103.38 | 69 of 70 | 21 of 21 | The true total, up to 100,000 matches (`1/100,000`). |
| Chrome 155.0.8059.84 | 70 of 70 (one run repeated once) | 21 of 21 | The true total, up to 100,000 matches. |
| Firefox 160.0 | 68 of 70 | 22 of 22 | The true total up to 1000 matches. "More than 1,000 matches" above that. |

The far-row set uses 7 queries, 10 runs each: typed at 100 ms per key (3 runs), typed at 30 ms (3), pasted (3) and typed with no delay (1). The queries are `qx7r0099999` (last row, 1 match), `qx7r0050000` (1 match), `qx7r00500` (100 matches), `qx7r00000` (100), `qx7r005` (10,000), `berlin` (5,261) and `qx7r` (100,000). A run passes when the bar total, the first match, the match after 34 Enter presses and the match after 117 presses all agree with the data, and the active match lies on the right row.

The old regression set walks Enter presses at several speeds past the end of a match list, holds Enter for 13 s, types slowly, adds and removes characters, and checks the index with `audit`.

Failed runs (all kept in the proof files): Chromium `qx7r0050000` typed at 30 ms, run 3: the bar was right (`1/1`) but the active mark was yellow, so the rig did not find it. Firefox `qx7r005` typed at 100 ms, runs 2 and 3: the bar said "1 of 1" instead of "More than 1,000 matches", and the row was right.

### Table (`?demo=table`, 100000 rows, 25 columns)

Same method: real find bar, real key presses, screenshots of the bar. Each run types or pastes one query, presses Enter 34 times, then 83 more (117 in all, 33 ms apart), and compares the bar and the row of the active match with an independent model of the table. Queries: a user handle in the first, a middle and the last row (2 matches each: the user cell and the e-mail cell), `bennett81` (100 matches) and `berlin` (12536 matches). States: plain (30 runs), sorted by ID (6) and filtered by `berlin` (6). A fresh browser for each run. Host load average 25 to 300 (mostly 30 to 110). "Main" is the build before this change (576497a), run in the same hours.

| State | Chromium 157, this build | Chromium 157, main | Firefox 160, this build | Firefox 160, main |
|---|---|---|---|---|
| Plain | 22 of 30 | 29 of 30 | 11 of 30 | 10 of 30 |
| Sorted | 6 of 6 | 6 of 6 | 1 of 6 | 1 of 6 |
| Filtered | 6 of 6 | 6 of 6 | 0 of 6 | 0 of 6 |
| `NativeFindGrid` far rows (70 runs) | 65 of 70 | 65 of 70 | 67 of 70 | 68 of 70 |
| `NativeFindGrid` regression set | 21 of 21 | 21 of 21 | 21 of 22 (+ control line) | 21 of 22 (+ control line) |

Run on 25 Nov 2026 at a host load average of 40 to 270, the two builds of a browser in turns (this build on one sway display, main on another, at the same hours). The grid far row failures of Chromium are the same in the two builds (`qx7r` and `berlin`, a bar that reads a count too early under load).

**Chromium, 2 matches in one row.** The 8 failed Chromium plain runs of this build are one case: a handle with 2 matches in the same row (the user cell and the e-mail cell: `isabella.campbell186` 5 of 6 runs, `amelia.bailey108` 3 of 6). The bar says `2/2` instead of `1/2` after 34 presses. The row is right, so only the count in the bar is wrong. Main shows 0 of 12 on these two queries in this run (3 of 30 in an earlier run). The first version of this change had the same case in 4 of 30 runs. Test builds (the 25 Nov runs, 2 to 4 runs of the query `isabella.campbell186` each): with no span in the index the case did not appear (4 of 4 runs passed); with spans only on the user lines it appeared (3 of 3 runs failed); with spans that only have a font, or only `position: relative`, or `display: inline-block` it still appeared; with spans on everything except the user lines it did not appear (4 of 4 passed). So Chromium 157 miscounts when a match lies inside a span of the index text and another match lies in the same block. Neither the font nor the offset alone is the cause. The highlight lies on the right text; only the `N/M` count can be off by one for a row that holds 2 matches.

Safari, macOS and mobile browsers are not tested.

## Known limits

- **Firefox, the match counter in a big document.** Three faults, all seen on a plain static page with no script and no Scrollport (`10000` and `100000` rows of one `div` each, a word in 9, 99 or 1999 rows, real Enter presses 33 ms apart):
  1. A query with 2 matches in one row: the bar is one off (`2 of 2` instead of `1 of 2`) after 34 presses. The row is right.
  2. A query with about 100 matches: after the wrap at the last match, the bar shows a wrong number (`10 of 99` instead of `19 of 99`).
  3. A query with more than 1000 matches: the bar sometimes shows `1 of 1` instead of "More than 1,000 matches".

  Firefox receives every Enter press and finds the next match for each one (its own find log shows 117 presses and 118 find results). The fault is in its match counter. Firefox starts a new count for every press. All counts share one result object, and a count that ends late reports the numbers of an older press (the log shows `0 of 0` and `1 of 1` between the right numbers). A count takes 0.3 to 6 s in a big document, much longer than 33 ms. The plain page shows that it depends on the size of the document and the speed of the presses: 1000 rows are right in 3 of 3 runs, 10000 rows are right in most runs, 100000 rows fail in 3 of 3 runs, and 100000 rows with 1000 ms between presses are right in 4 of 4 runs (300 ms: 0 of 4, 100 ms: 2 of 4). A person who presses Enter slowly, or a page with a small document, does not see it. The page cannot avoid it: all row text must be in the DOM. Turning sparse mode off made the 100 match query worse (the bar showed `1 of 1` already after 34 presses, and 20 presses were lost). Turning the scroll handling off gave no clear gain (4 rounds of 2 queries, same fault classes). Scrollport changes nothing in Firefox's counter: the table results of this build and of main are the same within the noise (Firefox 12 of 30 against 10 of 30 in plain).
- **Firefox, slow typing.** An earlier test page with the same index failed the "slow typing, then many Enter presses past the end of a short match list" case in 3 of 3 runs. This build passed it in its one run. Treat it as not settled.
- **Chromium, stall after repeated loads of the 100000 row table.** In one test, a Chromium renderer that had loaded the sorted demo table 3 times (8 GB resident, host load 100 to 300) stopped answering after the search text was typed. The find bar never showed a count, and the thread was inside Chrome's own code (the debugger could not interrupt it). A fresh browser for each run passed. It is not proven whether a normal host shows it.
- **Chrome, rare faults.** In about 1 search in 14 for a query with one match, the mark can be yellow or the bar can start at `0/1` (1 run in 70 in the last test). A pasted query starts at `2` in about 1 in 70. On Chrome 155 the first Enter walk lost presses in some runs. The cause is not proven. A plain page without Scrollport showed the paste fault too.
- **It does not scale to millions of rows.** Native find can match only text that is in the DOM. 100000 rows of 6 short columns are about 4 MB of text. The rich table demo (100000 users, 25 columns) is 39 MB of text and about 1 GB of JS heap (see "A table with rich cells"). The cost grows with rows and columns. A server-backed table cannot use this method: Chrome never tells the page the find text, so a page cannot load the right rows on demand.
- **Plain text only.** The index holds text. In a table the real cells draw links, avatars and pills, and the index lies over them as transparent text. A cell with several lines needs its lines and their places (`findText` and `findLines`). Without them the index writes the cell as one line at the centre of the row.
- **Table cell text is inert.** The real cells use `IndexedText`. Inert text cannot be selected with the mouse and assistive technology does not read it. Give the row another accessible name if you need this. Firefox finds text that CSS draws with `::before`, so CSS text does not work as a replacement.
- **The table index follows the rows of the row model.** Collapsed group rows, rows that are filtered out and card mode (a narrow screen) are not searchable. The index is built again when the rows change.
- **The highlight lies within 1 px of the real text, if the index text fits.** Checked in Chromium 157 and Firefox 160 on 1100 cells of 92 rows of the demo (all columns, group rows, rows at 5 places of the 100000): left and right edges within 0.93 px, baselines within 0.52 px. This needs the font and the baseline of each text (the demo reads them from copies of its cells), and a width that the canvas measures like the page (a font with a feature that changes widths, such as contextual alternates, can make the measure wrong: the layout then still puts the text on the right tab stop, within 3 px of tolerance, but the highlight can lie a few px off). A text that is wider than its column moves the later cells of that row to the right. The columns must have a fixed width (`nativeFind` sets it). The two sticky columns stick when the table is scrolled across: a match in one of them is highlighted at its place in the scroll, not at the sticky place.
- **No column headers in `NativeFindGrid`.** The grid draws row backgrounds and the index text. Columns are fixed-width tab stops. (`VirtualGridTable` has headers.)
- **Not tested:** Safari, macOS, mobile.

The research behind this is in `spike/native-find/FINDINGS.md`.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
```

CI runs the same four steps on every pull request and on every push to `main`.

## Licence

MIT. See `LICENSE`.
