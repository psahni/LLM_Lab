import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${env.API_PORT || '3001'}` },
    },
  }
})
