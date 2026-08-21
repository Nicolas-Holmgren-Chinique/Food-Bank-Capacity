import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Required for phone testing: binds beyond localhost (LAN + tunnel access) and accepts
    // any Host header, since a Cloudflare Quick Tunnel's *.trycloudflare.com hostname isn't
    // known ahead of time. See docs/MOBILE_TESTING.md.
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.SCAN_SERVER_PORT || 8787}`,
        changeOrigin: true,
      },
    },
  },
});
