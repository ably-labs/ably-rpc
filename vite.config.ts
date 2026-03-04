import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: 'client',
  build: {
    target: 'esnext', // Enable top-level await support
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext', // Enable top-level await in dependencies
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
