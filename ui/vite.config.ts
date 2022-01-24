import { fileURLToPath, URL } from 'url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
        'vue': 'vue/dist/vue.esm-bundler.js', // the default does NOT have the compiler we need for SubjectSourceConfig "vue_template"
        '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    proxy: {
        '/api': {
            target: 'http://localhost:8000',
            xfwd: true,
        },
    },
  },
})
