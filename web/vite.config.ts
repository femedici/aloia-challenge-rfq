import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Lê o .env da raiz do projeto. A API key é injetada pelo proxy do Vite,
// então ela não vai parar no código que roda no navegador.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${env.PORT ?? 3000}`,
          rewrite: (path) => path.replace(/^\/api/, ''),
          headers: { 'x-api-key': env.INTERNAL_API_KEY ?? '' },
        },
      },
    },
  };
});
