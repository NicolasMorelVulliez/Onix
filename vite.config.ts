/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import * as googleCallback from './api/google/callback.js'
import * as googleStart from './api/google/start.js'
import * as googleToken from './api/google/token.js'
import * as ics from './api/ics.js'

type Handler = (request: Request) => Promise<Response> | Response
const routes: Record<string, Record<string, Handler | undefined>> = {
  '/api/ics': ics,
  '/api/google/start': googleStart,
  '/api/google/callback': googleCallback,
  '/api/google/token': googleToken,
}

/** Serves the Vercel functions in /api during `npm run dev`. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      Object.assign(process.env, loadEnv('development', process.cwd(), ''))
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
        const handler = routes[url.pathname]?.[req.method ?? 'GET']
        if (!handler) return next()
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const headers = new Headers(req.headers as Record<string, string>)
        const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks)
        const response = await handler(new Request(url, { method: req.method, headers, body }))
        res.statusCode = response.status
        response.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(Buffer.from(await response.arrayBuffer()))
      })
    },
  }
}

export default defineConfig({
  plugins: [
    devApi(),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: { maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 },
      manifest: {
        name: 'Onix',
        short_name: 'Onix',
        description: 'Notas, bases de datos, calendario y Drive en un solo lugar',
        lang: 'es',
        display: 'standalone',
        start_url: '/',
        background_color: '#f4f1eb',
        theme_color: '#1f1f1f',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
