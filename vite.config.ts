import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths: the static build works under any sub-path.
  base: './',
  plugins: [react()],
  test: { environment: 'jsdom' },
})
