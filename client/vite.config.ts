import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    // Must match the server's limit (server/src/env.ts): Vercel rejects request bodies over 4.5 MB.
    define: { __MAX_UPLOAD_MB__: process.env.VERCEL ? 4 : 25 },
    server: {
        port: 5173,
        proxy: { '/api': 'http://localhost:4000' },
    },
});
