import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        draftPreview: resolve(__dirname, 'draft-preview.html'),
      },
    },
  },
  css: {
    devSourcemap: true,
  },
  server: {
    watch: {
      // Ignore wailsjs bindings and other auto-generated files
      ignored: [
        '**/wailsjs/**',
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
      ],
    },
  },
})

