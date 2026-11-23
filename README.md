# Scrollport

Scrollport makes the native browser find bar (Ctrl+F or Cmd+F) work in a virtual list. A grid of 100000 rows draws only the rows in view. The find bar still finds every row, shows the true number of matches, and Enter walks the matches in order while the grid follows.

It has a framework-free core, a React hook and a React grid component. There is no find box of its own: the user keeps the browser find bar.

> The demo grid holds 100000 rows of made-up data. Run `npm run dev`, press Ctrl+F and type `qx7r0099999` (the last row), `qx7r0050000` or `berlin`.

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

## API

### `createNativeFind(options): NativeFind` (`core.ts`)

| Option | Type | Meaning |
|---|---|---|
| `scroller` | `HTMLElement` | The element that scrolls. |
| `host` | `HTMLElement` | Child of the scroller with `position: relative` and a height of `rowCount * rowHeight`. The index goes here. |
| `rowCount` | `number` | Number of rows. |
| `rowHeight` | `number` | Row height in px. The index uses it as its line height. |
| `getRowText` | `(row) => string` | Text of one row. Separate the cells with a tab. Line breaks become spaces. |
| `rowsPerChunk` | `number` | Default 100. |
| `sparseMaxChunks` | `number` | Most chunks that a query may touch to switch to sparse mode. Default 100. |
| `tabSize` | `number` | Column width in px. Default 120. |
| `indent` | `number` | Left padding of the text in px. Default 8. |
| `onActiveRow` | `(row) => void` | The browser moved the selection onto a row. Firefox does this for the find match. Chrome does not. |

The returned object has `mode` (`'full'` or `'sparse'`), `query` (the find text, only in Firefox), `chunkCount`, `attachedChunks`, `reset()`, `audit(query)` and `destroy()`. `audit` counts what native find can match for a query and compares it with the data. The tests use it.

The module also exports the pure helpers `chunkCount`, `chunkOfRow`, `rowsOfChunk`, `rowAtOffset`, `chunksOfQuery` and `cleanLine`.

### `useNativeFind(options)` and `NativeFindGrid` (`react.tsx`)

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

Safari, macOS and mobile browsers are not tested.

## Known limits

- **Firefox, more than 1000 matches.** Firefox shows "More than 1,000 matches". It does not give a total. In about 1 search in 10 on a busy machine the bar shows "1 of 1" instead, while the highlighted row is right. The cause is in Firefox: a new count request ends the older one early. A page cannot switch this off.
- **Firefox, slow typing.** An earlier test page with the same index failed the "slow typing, then many Enter presses past the end of a short match list" case in 3 of 3 runs. This build passed it in its one run. Treat it as not settled.
- **Chrome, rare faults.** In about 1 search in 14 for a query with one match, the mark can be yellow or the bar can start at `0/1` (1 run in 70 in the last test). A pasted query starts at `2` in about 1 in 70. On Chrome 155 the first Enter walk lost presses in some runs. The cause is not proven. A plain page without Scrollport showed the paste fault too.
- **It does not scale to millions of rows.** Native find can match only text that is in the DOM. 100000 rows of 6 short columns are about 4 MB of text. In the test page that this code comes from, the browser used 1.1 to 1.7 GB in total (not measured again for this build). The cost grows with rows and columns. A server-backed table cannot use this method: Chrome never tells the page the find text, so a page cannot load the right rows on demand.
- **Plain text only.** The index holds text. Rich cells (links, avatars) need a second, drawn layer. Draw only backgrounds in the rows, or each row counts twice.
- **No column headers yet.** The grid draws row backgrounds and the index text. Columns are fixed-width tab stops.
- **The older table demo does not use it.** `?demo=table` opens the earlier TanStack table demo. It has no native find yet.
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
