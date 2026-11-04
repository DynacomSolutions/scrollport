# Native find spike: findings

Run on 4 November 2026 on a Linux server, Playwright 1.60.0 (Chromium 1223 build, Firefox 150.0.2). Raw numbers are in `RESULTS.md`. Each case ran alone in a cgroup capped at 8 GiB soft and 12 GiB hard, with a 5 minute limit per case. Rows are 32 px high, with 28 columns and chunks of 500 rows.

## Variants

- `cv-full`: every row has real cells. Chunks use `content-visibility: auto`.
- `uf-text`: the first chunk has real cells. Later chunks are `hidden="until-found"` and hold one plain text node per row.
- `uf-cells`: like `uf-text`, but the hidden chunks hold real cells.

All pages render without JavaScript.

## What the data shows

1. **Full cell DOM stops at roughly 10k to 100k rows.**
   - Chromium `cv-full`: 10k rows loaded in 0.8 s (550k DOM nodes, 83 layout objects, so offscreen skipping works). 100k rows did not finish within 5 minutes.
   - Firefox `cv-full`: 100k rows loaded in 19.5 s with a 6.4 GiB peak. 300k rows did not load within 200 s.
   - `uf-cells` is no better: Chromium timed out at 100k rows, and Firefox took 28.8 s.
2. **A plain text find layer reaches 1M rows, but at a heavy cost.**
   - `uf-text` at 100k rows: load 1.2 s in Chromium (1.3 GiB peak) and 2.8 s in Firefox (0.9 GiB peak).
   - At 1M rows: load 8.2 s in Chromium (7.6 GiB peak) and 9.7 s in Firefox (5.0 GiB peak). 3M rows failed in both browsers.
3. **Browser maximum scroll height is a hard wall, earlier than expected.**
   - At 1M rows, find located the row but could not scroll to it. scrollY clamped at 16,776,816 in Chromium (about 2^24 px) and 17,894,898 in Firefox.
   - At 32 px per row that caps reachable rows at about 524k in Chromium. At the current app's 46 px it is about 364k.
   - Any layout where hidden content keeps its full height (`contain-intrinsic-size`) hits this wall, so hidden chunks must not reserve their real height.
4. **Native reveal works without JavaScript.**
   - A text fragment URL (`#:~:text=`) revealed the `hidden="until-found"` chunk and scrolled to the row at 100k rows in both browsers. This took about 6.7 s in both, with `beforematch` firing in Chromium.
   - Firefox did not scroll to text fragment targets inside `content-visibility: auto` chunks (`cv-full`, scrollY stayed 0). This looks like a Firefox bug. It is the main risk for the `content-visibility` path.
5. **`window.find()` does not match Ctrl+F in Chromium.**
   - In Chromium it found the text but never revealed `hidden="until-found"` chunks. Firefox revealed them and fired `beforematch`.
   - Chromium's first call is slow: 5.1 s at 10k rows and 50 s at 1M rows. A second call took 0.5 s and 10.5 s.
   - Do not build on `window.find()`. Use text fragments for deep links.

## Not measured

- **The real Ctrl+F bar:** The test server has no display server. Check it by hand with the 100k pages (see "Manual check" below).
- **WebKit:** Playwright WebKit cannot launch on this Arch host (missing `libicu74` and `libflite1`), so there is no Safari data.
- **Memory peaks** are whole-browser cgroup peaks, not per tab.
- **Failed cases:** every timeout peaked at 8.2 to 8.9 GB, at the 8 GiB `MemoryHigh` throttle, and none was OOM-killed. Read "timed out" as "needs more than 8 GiB for the browser". That alone rules the layout out for real users. A run without the throttle could finish more slowly, but it was not tried.

## Conclusions for the rebuild

- **Millions of rows with native find in the DOM is not viable.**
  - Memory and load time get too high at 1M rows, and 3M rows fails.
  - Scroll height caps reachable rows near 500k, whatever the DOM cost.
- **Practical ceiling for a native find layer: about 100k rows.**
  - About 1 to 3 s load and about 1 GiB peak.
  - Hidden chunks must take no scroll space, so the height cap does not apply.
- **No-JavaScript path for large data: the server does the work.**
  - Server-rendered pages of rows.
  - A GET search form, with sort and filter as query strings and links.
  - Text fragment links into the current page.
  - All native HTML, with URLs that reproduce the view.
- **JavaScript enhancement on top: a recycled DOM cell pool, not React per cell.**
  - Columnar data and search in a Web Worker.
  - Scaled scrolling past the height cap.
  - The 100k-row `hidden="until-found"` text layer on smaller sets, so Ctrl+F still works there.
- **React and non-React from one core.**
  - A framework-free grid engine (data store, worker, cell pool, URL state).
  - Exposed as a custom element (`<data-grid>`), which upgrades a server-rendered `<table>`.
  - Plus a thin React wrapper.

## Manual check

```
node spike/native-find/make-manual.mjs
```

This prints the server command and the 100k URLs and tokens to try with Ctrl+F in each variant.
