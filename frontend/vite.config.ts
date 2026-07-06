import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Modern Vite (Rolldown-based) supports top-level await and WASM natively.
// The `define: { global }` line below patches a Node-only global that the
// Zama relayer SDK references but browsers don't have — without it the
// page crashes silently before React ever renders.
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  build: {
    target: 'esnext',
  },
})
