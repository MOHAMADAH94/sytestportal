import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    modulePreload: false,
    rolldownOptions: {
      output: {
        format: 'iife',
        name: 'ExamPlatform',
        codeSplitting: false,
      },
    },
  },
  server: {
    allowedHosts: [
      'localhost',
      '127.0.0.1',
    ],
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 3001}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${process.env.PORT || 3001}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
