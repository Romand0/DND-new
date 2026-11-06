import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    allowedHosts: [
      '.monkeycode-ai.online',
      'localhost'
    ],
    // 本地开发：实时 Worker（wrangler dev，默认 8787）通过 /realtime 前缀代理
    proxy: {
      '/realtime': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        ws: true,
        rewrite: (p: string) => p.replace(/^\/realtime/, ''),
      },
    },
  },
})
