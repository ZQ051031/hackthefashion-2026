import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Clothsy, AuthenticationError, friendlyMessage } from 'clothsy-ai';
import express from 'express';
import multer from 'multer';
import { products } from '../src/catalog.js';

const images = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 2, fields: 2, fieldSize: 96 },
}).fields([{ name: 'person', maxCount: 1 }, { name: 'garment', maxCount: 1 }]);

function isImage(file) {
  if (!file) return false;
  const hex = file.buffer.subarray(0, 8).toString('hex');
  return (file.mimetype === 'image/png' && hex === '89504e470d0a1a0a')
    || (file.mimetype === 'image/jpeg' && hex.startsWith('ffd8ff'));
}

export function createApi(key = process.env.CLOTHSY_API_KEY, makeClient = (apiKey) => new Clothsy({ apiKey })) {
  const router = express.Router();
  const clothsy = key?.trim() ? makeClient(key.trim()) : null;
  router.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/api/status', (_req, res) => res.json({ mode: clothsy ? 'live' : 'mock' }));
  router.post('/api/tryon', (req, res, next) => {
    if (req.get('Sec-Fetch-Site') === 'cross-site'
      || (req.get('Origin') && req.get('Origin') !== `${req.protocol}://${req.get('Host')}`)) {
      return res.status(403).json({ message: 'Submit from this site only.' });
    }
    if (!clothsy) return res.json({ mode: 'mock' });
    next();
  }, images, async (req, res) => {
    const person = req.files?.person?.[0];
    const customGarment = req.files?.garment?.[0];
    const product = products.find(({ id }) => id === req.body?.productId);
    if (req.body?.consent !== 'true') return res.status(400).json({ message: 'Consent is required.' });
    if (!isImage(person) || (customGarment ? !isImage(customGarment) : !product)) {
      return res.status(400).json({ message: 'Choose a JPEG or PNG person photo and a valid garment.' });
    }
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    try {
      const garment = customGarment ?? {
        buffer: await readFile(new URL(`../public/garments/${product.image}`, import.meta.url)),
        mimetype: 'image/png',
      };
      const [uploadedPerson, uploadedGarment] = await Promise.all([person, garment].map(({ buffer, mimetype }) =>
        clothsy.images.upload(buffer, { contentType: mimetype })));
      abort.signal.throwIfAborted();
      const job = await clothsy.tryons.create({
        person: { imageId: uploadedPerson.id },
        garment: { imageId: uploadedGarment.id },
        title: customGarment ? 'Uploaded garment' : product.name,
        consent: true,
      }, { signal: abort.signal });
      const result = await clothsy.tryons.waitFor(job.id, { signal: abort.signal });
      const url = new URL(result.resultUrl);
      if (url.protocol !== 'https:') throw new Error('Expected an HTTPS result URL');
      const image = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)]),
      });
      const type = image.headers.get('content-type');
      if (!image.ok || !image.body || !/^image\/(?:png|jpeg|webp)(?:;|$)/i.test(type ?? '')) {
        await image.body?.cancel();
        throw new Error('Could not fetch the Clothsy result image');
      }
      res.set({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
      await pipeline(Readable.fromWeb(image.body), res);
    } catch (error) {
      if (abort.signal.aborted || res.headersSent) return;
      const message = error instanceof AuthenticationError
        ? 'Clothsy rejected the server key. Check CLOTHSY_API_KEY and restart.'
        : friendlyMessage(error);
      res.status(502).json({ message: message || 'The live result is unavailable. Please try again.' });
    }
  });
  router.use('/api/tryon', (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      .json({ message: 'Use JPEG or PNG images that are each 4 MB or smaller.' });
  });
  return router;
}
