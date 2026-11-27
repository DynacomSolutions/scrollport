import { useCallback, useRef } from 'react'
import { NativeFindGrid } from '../scrollport/react'
import { COLUMNS, ROW_COUNT, demoRow } from './rows'
import './demo.css'

/** Ids and words that exist in the data. They are not written on the page, so the page adds no match to a query. */
const EXAMPLES = ['qx7r0099999', 'qx7r0050000', 'qx7r00500', 'berlin', 'qx7r']

export default function NativeFindDemo({ rowCount = ROW_COUNT }: { rowCount?: number } = {}) {
  const next = useRef(0)
  const copyExample = () => {
    const text = EXAMPLES[next.current++ % EXAMPLES.length]
    void navigator.clipboard?.writeText(text)
  }
  const getRow = useCallback((i: number) => demoRow(i), [])
  return (
    <main className="demo">
      <h1>Scrollport demo</h1>
      <section className="demo-box">
        <p>
          This grid keeps the actual cell text of all {rowCount.toLocaleString()} rows in the page. Your browser controls which matches it shows and where it scrolls.
        </p>
        <ol>
          <li>Open the browser’s Find in page. On desktop, press Ctrl+F or Cmd+F on macOS.</li>
          <li>Type or paste an ID from the first column, a first name or a city.</li>
          <li>Check the count and the highlighted cell. Use the browser’s next-match control to move between matches.</li>
        </ol>
        <p>
          <button type="button" onClick={copyExample} title={`Copies one of: ${EXAMPLES.join(', ')}`}>
            Copy the next example query
          </button>{' '}
          Then paste it into the browser’s Find bar.
        </p>
      </section>
      <NativeFindGrid id="grid" rowCount={rowCount} columns={COLUMNS} getRow={getRow} />
    </main>
  )
}
