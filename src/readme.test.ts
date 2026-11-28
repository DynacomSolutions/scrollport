import { expect, it } from 'vitest'
import readme from '../README.md?raw'
import fixture from './readme.compat.fixture.tsx?raw'

const body = (code: string) =>
  code
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('import ') && !line.startsWith('//'))
    .join('\n')

it('keeps every README tsx example equal to the type-checked fixture', () => {
  const blocks = [...readme.matchAll(/```tsx\n([\s\S]*?)```/g)].map((match) => body(match[1]))
  expect(blocks.length).toBeGreaterThan(1)
  const fixtureBody = body(fixture)
  for (const block of blocks) expect(fixtureBody).toContain(block)
})
