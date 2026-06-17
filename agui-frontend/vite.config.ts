import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // 开发环境把前端的 /ai 请求转发到本地 Nest 后端，避免浏览器跨域。
      '/ai': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
