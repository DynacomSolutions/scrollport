import { useCallback, useRef } from 'react'
import { NativeFindGrid } from '../scrollport/react'
import type { NativeFind } from '../scrollport/core'
import { COLUMNS, ROW_COUNT, demoRow } from './rows'
import { publishFindTest } from './findTest'
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
  const publish = useCallback((find: NativeFind | null) => publishFindTest(find, ROW_COUNT), [])
  return (
    <main className="demo">
      <h1>Scrollport demo</h1>
      <section className="demo-box">
        <p>
          This grid has 100000 rows, but the page draws only the rows in view. The text of every row sits in a hidden index, so the browser find bar
          reaches all rows.
        </p>
        <ol>
          <li>Press Ctrl+F (Cmd+F on macOS).</li>
          <li>Type or paste an id from the first column, a first name or a city.</li>
          <li>The find bar shows the true number of matches. Enter walks the rows in order and the grid follows.</li>
        </ol>
        <p>
          <button type="button" onClick={copyExample} title={`Copies one of: ${EXAMPLES.join(', ')}`}>
            Copy the next example query
          </button>{' '}
          Then press Ctrl+F and Ctrl+V.
        </p>
      </section>
      <NativeFindGrid id="grid" rowCount={ROW_COUNT} columns={COLUMNS} getRow={getRow} onFind={publish} />
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
