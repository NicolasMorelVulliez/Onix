/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { POST as icsHandler } from './api/ics.ts'

/** Serves the Vercel function in /api/ics during `npm run dev`. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/ics', async (req, res) => {
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const response = await icsHandler(
          new Request('http://localhost/api/ics', { method: 'POST', body: Buffer.concat(chunks), headers: { 'content-type': 'application/json' } }),
        )
        res.statusCode = response.status
        response.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(await response.text())
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
        name: 'Espacio',
        short_name: 'Espacio',
        description: 'Notas, bases de datos y calendario personal',
        lang: 'es',
        display: 'standalone',
        start_url: '/',
        background_color: '#ffffff',
        theme_color: '#1f1f1f',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
