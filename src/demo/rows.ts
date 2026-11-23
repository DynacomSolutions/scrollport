/** Demo data: 100000 rows, 6 columns. Deterministic: the same rows on every load. */
export const ROW_COUNT = 100_000
export const COLUMNS = 6

const WORDS = {
  first: 'anna ben carl dora eli fay gus hana ivan jade kai lena milo nora omar pia quinn rosa sam tara uma vic wren xena yuri zoe'.split(' '),
  last: 'smith jones brown young green black white stone field brook wood hill lake ford reed marsh cole hart lane shaw west'.split(' '),
  city: 'athens berlin cairo dublin essen faro genoa hanoi izmir jaipur kyoto lagos malmo nairobi oslo porto quito riga sofia turin'.split(' '),
  dept: 'sales support legal design ops data infra audit growth billing'.split(' '),
  tag: 'new open paid late void held flagged archived trial vip'.split(' '),
}

/** Cells of one row: an id like `qx7r0099999`, then name, city, department and tag. */
export function demoRow(i: number): string[] {
  let s = (Math.imul(i, 2654435761) + 12345) >>> 0
  const r = (m: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return (s >>> 8) % m
  }
  return [
    `qx7r${String(i).padStart(7, '0')}`,
    WORDS.first[r(26)],
    WORDS.last[r(20)],
    WORDS.city[r(19)],
    WORDS.dept[r(10)],
    WORDS.tag[r(10)],
  ]
}
