import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), { name: 'deployment-version', generateBundle() { this.emitFile({ type: 'asset', fileName: 'deployment.json', source: JSON.stringify({ sha: process.env.GITHUB_SHA || null }) }) } }],
  base: './',
})

