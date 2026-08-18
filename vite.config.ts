import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // relative asset paths so the build works at any URL (GitHub Pages serves
  // project sites from /<repo-name>/, not the domain root)
  base: './',
  server: { port: 5174, strictPort: true },
})
