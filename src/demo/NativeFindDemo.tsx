import { useCallback, useRef } from 'react'
import { NativeFindGrid } from '../scrollport/react'
import { COLUMNS, ROW_COUNT, demoRow } from './rows'
import './demo.css'

/** Ids and words that exist in the data. They are not written on the page, so the page adds no match to a query. */
const EXAMPLES = ['qx7r0099999', 'qx7r0050000', 'qx7r00500', 'berlin', 'qx7r']

export default function NativeFindDemo() {
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
          This grid keeps the actual text of all 100000 rows in the page. The browser defers rendering outside the viewport, so Find can reach every row.
        </p>
        <ol>
          <li>Press Ctrl+F (Cmd+F on macOS).</li>
          <li>Type or paste an id from the first column, a first name or a city.</li>
          <li>Read the count in the browser find bar. Press Enter to move to the next match.</li>
        </ol>
        <p>
          <button type="button" onClick={copyExample} title={`Copies one of: ${EXAMPLES.join(', ')}`}>
            Copy the next example query
          </button>{' '}
          Then press Ctrl+F and Ctrl+V.
        </p>
      </section>
      <NativeFindGrid id="grid" rowCount={ROW_COUNT} columns={COLUMNS} getRow={getRow} />
      <ZebraControl />
    </main>
  )
}

/** A search control: the find bar must find the word below. If not, this browser ignores hidden="until-found". */
function ZebraControl() {
  const ref = useCallback((el: HTMLElement | null) => el?.setAttribute('hidden', 'until-found'), [])
  return (
    <>
      <p className="demo-note">Support check: search for the word that this line hides. A browser that finds it supports the method.</p>
      <div ref={ref}>zebrafind</div>
    </>
  )
}
