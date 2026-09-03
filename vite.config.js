import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5501,
    strictPort: true,
    allowedHosts: true, // Allows all local & forwarded hostnames (Vite 6+)
    cors: true
  },
  preview: {
    host: '127.0.0.1',
    port: 5501,
    allowedHosts: true,
    cors: true
  }
});
