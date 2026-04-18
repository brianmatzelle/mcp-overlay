import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ortDist = path.resolve(__dirname, 'node_modules/onnxruntime-web/dist')

// Combined plugin: COEP/COOP headers + serve ort-wasm worker files from node_modules.
// Vite refuses to serve .mjs files from public/ as JS modules, so we intercept
// ort-wasm* requests here and serve them directly with correct Content-Type headers.
const onnxPlugin = () => ({
  name: 'onnx-runtime',
  configureServer(server: import('vite').ViteDevServer) {
    server.middlewares.use((req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')

      const url = req.url?.split('?')[0] ?? ''
      if (/^\/ort-wasm[^/]*\.(wasm|mjs)$/.test(url)) {
        const filePath = path.join(ortDist, url.slice(1))
        try {
          const content = readFileSync(filePath)
          res.setHeader(
            'Content-Type',
            url.endsWith('.mjs') ? 'application/javascript' : 'application/wasm',
          )
          res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
          res.end(content)
          return
        } catch {
          // file not found — fall through to Vite's default handling
        }
      }

      next()
    })
  },
})

export default defineConfig({
  plugins: [react(), onnxPlugin()],
  server: {
    port: 5173,
  },
  // Prevent Vite from bundling onnxruntime-web — it loads WASM/workers dynamically
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  test: {
    environment: 'jsdom',
  },
})
