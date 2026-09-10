import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El bundle compilado se escribe directo en server/public: Railway despliega solo
// la carpeta server/, asi que lo que no este ahi adentro no llega al servidor.
// Los assets van con hash en el nombre (cache eterna) y el index.html se sirve
// con no-cache desde Fastify, para que una version nueva llegue al WebView sin
// tener que reinstalar la app.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  server: {
    port: 5180,
    proxy: {
      '/api': {
        target: 'https://staffaxis-new-version-production.up.railway.app',
        changeOrigin: true,
      },
    },
  },
});
