import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Adyx Web Client — Vite Configuration
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // WebSocket relay → Erlang router
      '/ws': {
        target: 'ws://localhost:8443',
        ws: true,
      },
      // Pre-key API → Erlang router
      '/api': {
        target: 'http://localhost:8443',
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  define: {
    __APP_VERSION__: JSON.stringify('1.0.0'),
  },
})
