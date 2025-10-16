import {defineConfig} from 'vite'
import {svelte} from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  build: {
    sourcemap: true,
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
