import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import jwt from 'jsonwebtoken'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Plugin } from 'vite'

/**
 * Vite plugin that serves /api/token in dev mode,
 * mirroring the Vercel serverless function in api/token.ts.
 */
function apiTokenPlugin(): Plugin {
  let keyName: string
  let keySecret: string

  return {
    name: 'api-token',
    configureServer(server) {
      // Load .env manually (Vite's env loading is client-side only)
      try {
        const envPath = resolve(__dirname, '.env')
        const envContent = readFileSync(envPath, 'utf-8')
        const match = envContent.match(/^ABLY_API_KEY=(.+)$/m)
        if (match) {
          const [name, secret] = match[1].trim().split(':')
          keyName = name
          keySecret = secret
        }
      } catch {
        console.warn('[api-token] No .env file found — /api/token will fail')
      }

      server.middlewares.use('/api/token', (req, res) => {
        if (!keyName || !keySecret) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'ABLY_API_KEY not configured' }))
          return
        }

        const url = new URL(req.url || '/', `http://${req.headers.host}`)
        const clientId = url.searchParams.get('clientId') || `anon-${Date.now()}`

        const token = jwt.sign(
          {
            'x-ably-capability': '{"*":["*"]}',
            'x-ably-clientId': clientId,
          },
          keySecret,
          {
            header: { typ: 'JWT', alg: 'HS256', kid: keyName },
            expiresIn: 3600,
          }
        )

        res.setHeader('Content-Type', 'application/jwt')
        res.end(token)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiTokenPlugin()],
  root: 'client',
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
  server: {
    port: 5173,
  },
})
