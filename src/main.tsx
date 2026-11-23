import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'

// `?demo=table` opens the older TanStack table demo. It does not use native find yet.
// Each demo loads its own styles, so the two never mix.
const Demo = lazy(() => (new URLSearchParams(window.location.search).get('demo') === 'table' ? import('./App') : import('./demo/NativeFindDemo')))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Demo />
    </Suspense>
  </StrictMode>,
)
