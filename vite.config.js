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
      '/coscine-api': {
        target: 'https://coscine.rwth-aachen.de/coscine/api/v2',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/coscine-api/, ''),
      },
    },
  },
});
