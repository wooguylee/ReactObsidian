import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const isLibrary = mode === 'lib'

  return {
    plugins: [react(), isLibrary ? dts({ include: ['src/lib/index.d.ts'] }) : null].filter(Boolean),
    build: isLibrary
      ? {
          lib: {
            entry: resolve(__dirname, 'src/lib/index.js'),
            name: 'ReactObsidianEditor',
            fileName: 'index',
            formats: ['es'],
          },
          rollupOptions: {
            external: ['react', 'react-dom'],
          },
        }
      : undefined,
  }
})
