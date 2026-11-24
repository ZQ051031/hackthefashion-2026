import { defineConfig } from 'vite';
import express from 'express';
import { createApi } from './server/app.js';
import { loadLocalEnv } from './server/env.js';

export default defineConfig(({ mode }) => {
  const pages = mode === 'pages';
  return {
    base: pages ? '/hackthefashion-2026/' : '/',
    define: { __PAGES_DEMO__: JSON.stringify(pages) },
    plugins: pages ? [] : [{
      name: 'local-tryon-api',
      configureServer(server) {
        loadLocalEnv();
        const api = express();
        api.disable('x-powered-by');
        api.use(createApi());
        server.middlewares.use(api);
      },
    }],
  };
});
