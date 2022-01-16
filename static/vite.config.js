// vite.config.js
const { resolve } = require('path')
const { defineConfig } = require('vite')

module.exports = defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sgroup  : resolve(__dirname, 'sgroup.html')
      }
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

