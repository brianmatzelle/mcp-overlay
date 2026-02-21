import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/mcp': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/citibike-mcp': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/citibike-mcp/, '/mcp'),
      },
      '/ws/voice': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
