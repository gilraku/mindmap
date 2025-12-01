// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
    base: './',      // penting untuk deploy statis
    server: {
        watch: {
            usePolling: true,
        },
    },
})
