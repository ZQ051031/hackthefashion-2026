import express from 'express';
import { fileURLToPath } from 'node:url';
import { createApi } from './app.js';
import { loadLocalEnv } from './env.js';

loadLocalEnv();
const app = express();
const port = Number(process.env.PORT || 4173);
app.disable('x-powered-by');
app.use(createApi());
app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
app.listen(port, '127.0.0.1', () => {
  console.log(`Mirrorroom is available at http://127.0.0.1:${port}`);
});
