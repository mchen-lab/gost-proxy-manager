import path from "path"
import { defineConfig } from 'vite'
import { execSync } from 'child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))

// Attempt to get git commit hash
let commitHash = process.env.GIT_COMMIT;
if (!commitHash) {
  try {
    commitHash = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    commitHash = 'unknown';
  }
}
// https://vite.dev/config/
export default defineConfig({
  define: {
    '__APP_VERSION__': JSON.stringify(packageJson.version + (process.env.BUILD_METADATA || '')),
    '__COMMIT_HASH__': JSON.stringify(commitHash),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:31130',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:31130',
        ws: true,
        changeOrigin: true,
      }
    }
  }
})
