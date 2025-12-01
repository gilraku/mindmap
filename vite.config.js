// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
    base: './',
    server: {
        watch: {
            usePolling: true,
        },
    },
})
