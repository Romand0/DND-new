import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { validateFull } from './plugins/featureSpecSchema.mjs'

// 特性 spec 数据构建期门禁（feature-fullcycle P1）：schema 校验 + 种子孤儿交叉检查，失败即构建失败。
// dev/serve 同样触发（buildStart），数据问题在启动时即暴露。
function featureSpecsPlugin(): Plugin {
  return {
    name: 'validate-feature-specs',
    buildStart() {
      const errors = validateFull(path.resolve(__dirname))
      if (errors.length > 0) {
        throw new Error(`[feature-specs] spec 数据校验失败：\n  ${errors.join('\n  ')}`)
      }
    },
  }
}

export default defineConfig({
  plugins: [featureSpecsPlugin(), react(), tailwindcss()],
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
