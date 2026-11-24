import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { AuthenticationError } from 'clothsy-ai';
import { createApi } from '../../server/app.js';

const png = await readFile(new URL('../../public/garments/tee.png', import.meta.url));

async function host(t, api) {
  const app = express();
  app.use(api);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function submission({ consent = 'true', product = 'studio-denim', custom = false } = {}) {
  const data = new FormData();
  const image = new Blob([png], { type: 'image/png' });
  data.append('consent', consent);
  data.append('person', image, 'person.png');
  if (custom) data.append('garment', image, 'custom.png');
  else data.append('productId', product);
  return { method: 'POST', body: data };
}

test('without a key the server reports mock mode without constructing a vendor client', async (t) => {
  const base = await host(t, createApi('', () => assert.fail('Vendor client was created')));
  assert.deepEqual(await (await fetch(`${base}/api/status`)).json(), { mode: 'mock' });
  assert.deepEqual(await (await fetch(`${base}/api/tryon`, { method: 'POST' })).json(), { mode: 'mock' });
});

test('live route validates consent and garment selection and handles rejected authentication', async (t) => {
  const attempts = [];
  const stub = { images: { upload: async (...args) => {
    attempts.push(args);
    throw new AuthenticationError('provider error text', { code: 'INVALID_API_KEY', status: 401 });
  } } };
  const base = await host(t, createApi('configured-for-test', () => stub));
  assert.deepEqual(await (await fetch(`${base}/api/status`)).json(), { mode: 'live' });
  for (const invalid of [submission({ consent: 'false' }), submission({ product: 'missing' })]) {
    assert.equal((await fetch(`${base}/api/tryon`, invalid)).status, 400);
  }
  const crossSite = await fetch(`${base}/api/tryon`, { ...submission(), headers: { Origin: 'https://example.test' } });
  assert.equal(crossSite.status, 403);
  assert.equal(attempts.length, 0);
  const response = await fetch(`${base}/api/tryon`, submission());
  assert.equal(response.status, 502);
  assert.match((await response.json()).message, /CLOTHSY_API_KEY/);
  assert.equal(attempts.length, 2);
});

test('both garment sources upload bytes, create a consented job, poll it and relay the result', async (t) => {
  const calls = [];
  const resultUrl = 'https://result.example.test/image.png';
  const vendor = {
    images: { async upload(bytes, { contentType }) {
      assert.ok(Buffer.isBuffer(bytes));
      assert.equal(contentType, 'image/png');
      calls.push('upload');
      return { id: `img_${calls.length}` };
    } },
    tryons: {
      async create(params) {
        calls.push(params);
        return { id: 'job-1', status: 'pending' };
      },
      async waitFor(id) {
        calls.push(id);
        return { status: 'success', resultUrl };
      },
    },
  };
  const base = await host(t, createApi('configured-for-test', () => vendor));
  const fetchActual = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (input, options) => {
    if (String(input) !== resultUrl) return fetchActual(input, options);
    return Promise.resolve(new Response(png, { headers: { 'Content-Type': 'image/png' } }));
  });
  for (const [custom, title] of [[false, 'Studio Denim Jacket'], [true, 'Uploaded garment']]) {
    calls.length = 0;
    const response = await fetch(`${base}/api/tryon`, submission({ custom }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    assert.deepEqual(calls, ['upload', 'upload', {
      person: { imageId: 'img_1' }, garment: { imageId: 'img_2' }, title, consent: true,
    }, 'job-1']);
  }
});
