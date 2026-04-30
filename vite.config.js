import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/qudt': {
        target: 'https://qudt.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/qudt/, ''),
      },
    },
  },
});
