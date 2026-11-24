const MAX_BYTES = 4 * 1024 * 1024;

export async function loadImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function canvasAt(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Could not prepare the image.'));
  }, type, 0.9));
}

export async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > MAX_BYTES) {
    throw new Error('Choose a JPEG or PNG that is 4 MB or smaller.');
  }
  const src = URL.createObjectURL(file);
  try {
    const img = await loadImage(src);
    const limit = file.type === 'image/png' ? 1000 : 1500;
    const scale = Math.min(1, limit / Math.max(img.width, img.height));
    const canvas = canvasAt(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas, file.type);
    if (blob.size > MAX_BYTES) throw new Error('This photo is too large after processing. Try a smaller image.');
    return blob;
  } finally {
    URL.revokeObjectURL(src);
  }
}

export async function makeMock(personSrc, garmentSrc, { sample, custom }) {
  const [person, garment] = await Promise.all([loadImage(personSrc), loadImage(garmentSrc)]);
  const scale = Math.min(1, 1000 / Math.max(person.width, person.height));
  const canvas = canvasAt(Math.max(1, Math.round(person.width * scale)), Math.max(1, Math.round(person.height * scale)));
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(person, 0, 0, width, height);
  const pieceScale = Math.min(width * (sample ? 0.63 : 0.59) / garment.width, height * 0.50 / garment.height);
  const w = garment.width * pieceScale, h = garment.height * pieceScale;
  const x = (width - w) / 2, y = (sample ? height * 0.52 : height * 0.51);
  ctx.save();
  if (custom) {
    const pad = width * 0.018;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, pad);
    ctx.fill();
  } else {
    ctx.shadowColor = '#24162755';
    ctx.shadowBlur = Math.max(1, width * 0.025);
  }
  ctx.drawImage(garment, x, y, w, h);
  ctx.restore();

  const unit = Math.min(width, height);
  const band = unit * 0.107;
  ctx.fillStyle = '#2b162bea';
  ctx.fillRect(0, height - band, width, band);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${unit * 0.047}px system-ui, sans-serif`;
  ctx.fillText('DEMO / MOCK', width / 2, height - band / 2);
  return toBlob(canvas);
}

export async function asPng(src) {
  const img = await loadImage(src);
  const canvas = canvasAt(img.width, img.height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  return toBlob(canvas);
}
