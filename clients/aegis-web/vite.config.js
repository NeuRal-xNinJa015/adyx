import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// AegisComms Web Client — Vite Configuration
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Proxy WebSocket connections to Erlang router
    proxy: {
      '/ws': {
        target: 'wss://localhost:8443',
        ws: true,
        secure: false, // Dev only — prod uses proper certs
      },
      '/api/identity': {
        target: 'https://localhost:8081',
        secure: false,
      },
      '/api/admin': {
        target: 'https://localhost:8082',
        secure: false,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false, // No sourcemaps in prod for security
    rollupOptions: {
      output: {
        manualChunks: {
          signal: ['@libsignal/signal-client'],
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('0.1.0'),
  },
})
