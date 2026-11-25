import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on every network interface so other PCs on the LAN can open
    // http://<this-PC's-IP>:5173 (the API is reached through the /api proxy)
    host: true,
    allowedHosts: ['.trycloudflare.com'],
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
