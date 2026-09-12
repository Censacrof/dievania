import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // relative paths: works at / locally and under /dievania/ on GitHub Pages
  plugins: [react()],
})
