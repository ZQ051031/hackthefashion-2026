import './styles.css';
import { products, sizes } from './catalog.js';
import { recommendSize } from './fit.js';
import { asPng, loadImage, makeMock, preparePhoto } from './images.js';

const $ = (id) => document.getElementById(id);
const asset = (path) => import.meta.env.BASE_URL + path;
const productImage = (item) => asset(`garments/${item.image}`);
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const currentProduct = () => products.find(({ id }) => id === new URL(location.href).searchParams.get('product')) ?? products[0];
let product = currentProduct();
let size = null;
let suggestion = null;
let mode;
let person;
let garment;
let result;
let busy = false;
let preparing = 0;
let selectionVersion = 0;

function productUrl(item, hash = '#main') {
  const url = new URL(location.href);
  url.searchParams.set('product', item.id);
  url.hash = hash;
  return url;
}

function showSizeOptions() {
  [...$('size-options').children].forEach((button) => button.setAttribute('aria-pressed', button.dataset.size === size));
}

function resetSizeAdvice() {
  suggestion = null;
  $('size-result').replaceChildren();
  $('apply-size').hidden = true;
}

function showProduct(item) {
  product = item;
  size = null;
  document.title = `${product.name} — Mirrorroom`;
  $('product-art').style.setProperty('--product-bg', item.background);
  $('product-swatch').style.background = item.swatch;
  $('product-image').src = productImage(item);
  $('product-image').alt = `${item.name} in ${item.color.toLowerCase()}, front view`;
  $('product-counter').textContent = `${String(products.indexOf(item) + 1).padStart(2, '0')} / ${String(products.length).padStart(2, '0')}`;
  $('breadcrumb-category').textContent = item.category;
  $('breadcrumb-product').textContent = item.name;
  $('product-name').textContent = item.name;
  $('product-price').textContent = money.format(item.price);
  $('product-color').textContent = item.color;
  $('product-description').textContent = item.description;
  $('guide-product').textContent = item.name;
  $('size-chart').innerHTML = sizes.map((label, i) => `<tr><th scope="row">${label}</th><td>${item.chest[i]}</td></tr>`).join('');
  showSizeOptions();
  resetSizeAdvice();
  [...$('catalog').children].forEach((link) => {
    if (link.dataset.product === item.id) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
}

function clearResult() {
  if (result) {
    URL.revokeObjectURL(result.url);
    URL.revokeObjectURL(result.downloadUrl);
    result = null;
  }
  $('comparison').hidden = true;
  $('placeholder').hidden = false;
  $('preview-actions').hidden = true;
  $('before-image').removeAttribute('src');
  $('after-image').removeAttribute('src');
  $('result-mode').textContent = 'No result yet';
  $('share-status').textContent = '';
}

function updateControls() {
  const ready = mode && person && $('consent').checked && ($('garment-choice').value !== 'custom' || garment);
  $('generate').disabled = !ready || preparing > 0 || busy;
  $('sample').disabled = preparing > 0 || busy;
  $('sample').hidden = mode !== 'mock';
  for (const card of $('catalog').children) card.setAttribute('aria-disabled', busy && mode === 'live');
}

function changeProduct(item) {
  ++selectionVersion;
  showProduct(item);
  $('garment-choice').value = item.id;
  $('custom-garment').hidden = true;
  clearResult();
  $('form-status').textContent = '';
  updateControls();
}

function badge(node, label, type) {
  node.className = `badge ${type}`;
  const dot = document.createElement('i');
  dot.setAttribute('aria-hidden', 'true');
  node.replaceChildren(dot, document.createTextNode(label));
}

function setMode(value, reason) {
  mode = value;
  for (const id of ['mode-badge', 'studio-badge']) {
    badge($(id), value === 'live' ? 'Live: Clothsy API' : 'DEMO / MOCK', value);
  }
  $('mode-explanation').textContent = reason;
  updateControls();
}

async function detectMode() {
  if (__PAGES_DEMO__) return setMode('mock', 'GitHub Pages cannot run the Clothsy server. This preview is simulated; photos stay in your browser.');
  try {
    const response = await fetch('/api/status', { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error('Server unavailable');
    const status = await response.json();
    if (status.mode === 'live') return setMode('live', 'Photos you submit are sent to Clothsy AI to create the preview.');
    if (status.mode === 'mock') return setMode('mock', 'No Clothsy key is configured. This preview is simulated; photos stay in your browser.');
  } catch {
    // A standalone static build still works without a local server.
  }
  setMode('mock', 'The Clothsy server is unavailable. This preview is simulated; photos stay in your browser.');
}

function setPerson(next) {
  if (person && !person.sample) URL.revokeObjectURL(person.src);
  person = next;
  $('person-name').textContent = person?.name || 'Choose a photo';
  $('consent').checked = false;
}

function setGarment(next) {
  if (garment) URL.revokeObjectURL(garment.src);
  garment = next;
  $('garment-name').textContent = garment?.name || 'Choose a garment photo';
}

function listenForUpload(input, useFile) {
  let revision = 0;
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const ticket = ++revision;
    ++selectionVersion;
    ++preparing;
    clearResult();
    $('form-status').textContent = 'Preparing your photo…';
    updateControls();
    try {
      const blob = await preparePhoto(file);
      if (revision !== ticket) return;
      useFile({ blob, src: URL.createObjectURL(blob), name: file.name });
      $('form-status').textContent = '';
    } catch (error) {
      if (revision !== ticket) return;
      useFile(undefined);
      input.value = '';
      $('form-status').textContent = error.message || 'Could not read that photo.';
    } finally {
      --preparing;
      updateControls();
    }
  });
}

async function requestLive(photo, choice, custom) {
  const data = new FormData();
  data.append('person', photo.blob, photo.name);
  data.append('consent', 'true');
  if (custom) data.append('garment', custom.blob, custom.name);
  else data.append('productId', choice.id);
  let response;
  try {
    response = await fetch('/api/tryon', { method: 'POST', body: data, signal: AbortSignal.timeout(250_000) });
  } catch {
    throw new Error('The live server did not respond. Please try again later.');
  }
  if (response.ok && response.headers.get('content-type')?.startsWith('image/')) return response.blob();
  const body = await response.json().catch(() => null);
  if (response.ok && body?.mode === 'mock') return null;
  throw new Error(body?.message || 'A live try-on could not be completed. Please try again.');
}

async function renderResult(blob, before, isMock, item, version) {
  const url = URL.createObjectURL(blob);
  let keepUrl = false;
  try {
    const image = await loadImage(url);
    const png = blob.type === 'image/png' ? blob : await asPng(url);
    if (version !== selectionVersion) return;
    const filename = `mirrorroom-${item ? item.id : 'custom-garment'}${isMock ? '-mock' : ''}.png`;
    result = { url, downloadUrl: URL.createObjectURL(png), file: new File([png], filename, { type: 'image/png' }) };
    keepUrl = true;
    $('after-image').src = url;
    $('before-image').src = before.src;
    $('comparison').style.setProperty('--ratio', `${image.width} / ${image.height}`);
    $('result-mode').textContent = isMock ? 'DEMO / MOCK' : 'Clothsy AI result';
    $('placeholder').hidden = true;
    $('comparison').hidden = false;
    $('preview-actions').hidden = false;
    $('compare').value = 50;
    $('comparison').style.setProperty('--split', '50%');
    $('form-status').textContent = isMock ? 'Mock preview ready. This is a simple overlay, not an AI try-on.' : 'Your Clothsy try-on is ready.';
  } finally {
    if (!keepUrl) URL.revokeObjectURL(url);
  }
}

$('size-options').innerHTML = sizes.map((label) => `<button type="button" data-size="${label}">${label}</button>`).join('');
$('garment-choice').innerHTML = products.map((item) => `<option value="${item.id}">${item.name} · ${money.format(item.price)}</option>`).join('')
  + '<option value="custom">Upload a garment photo</option>';
$('catalog').innerHTML = products.map((item) => `<a class="card" href="${productUrl(item)}" data-product="${item.id}">
  <div class="card-image" style="--product-bg:${item.background}"><img loading="lazy" width="250" height="194" src="${productImage(item)}" alt=""></div>
  <span class="card-category">${item.category}</span><div class="card-title"><strong>${item.name}</strong><span>${money.format(item.price)}</span></div></a>`).join('');

changeProduct(product);
void detectMode();

$('catalog').addEventListener('click', (event) => {
  const link = event.target.closest('[data-product]');
  if (!link) return;
  if (link.getAttribute('aria-disabled') === 'true') {
    event.preventDefault();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  const item = products.find(({ id }) => id === link.dataset.product);
  history.pushState(null, '', productUrl(item));
  changeProduct(item);
  $('main').scrollIntoView({ behavior: 'instant' });
});
window.addEventListener('popstate', () => {
  const item = currentProduct();
  if (item === product) return;
  if (busy && mode === 'live') history.replaceState(null, '', productUrl(product, location.hash));
  else changeProduct(item);
});
$('size-options').addEventListener('click', (event) => {
  if (!event.target.dataset.size) return;
  size = event.target.dataset.size;
  showSizeOptions();
});
$('open-guide').addEventListener('click', () => $('size-guide').showModal());
$('size-form').addEventListener('input', resetSizeAdvice);
$('size-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const advice = recommendSize(product.chest, $('chest').valueAsNumber, $('fit').value);
  if (!advice?.size) {
    $('size-result').textContent = 'No reliable match in this chart for your measurement and fit preference.';
    return;
  }
  suggestion = advice.size;
  $('size-result').textContent = `Try size ${advice.size}: its ${advice.garmentChest} cm chest is the first size that gives you at least ${advice.ease} cm of extra room.`;
  $('apply-size').hidden = false;
});
$('apply-size').addEventListener('click', () => {
  size = suggestion;
  showSizeOptions();
  $('size-guide').close();
});

listenForUpload($('person-file'), setPerson);
listenForUpload($('garment-file'), setGarment);
$('sample').addEventListener('click', () => {
  if (mode !== 'mock') return;
  ++selectionVersion;
  clearResult();
  setPerson({ src: asset('studio-model.svg'), name: 'Illustrated demo model', sample: true });
  $('person-file').value = '';
  $('form-status').textContent = '';
  updateControls();
});
$('garment-choice').addEventListener('change', () => {
  const item = products.find(({ id }) => id === $('garment-choice').value);
  if (item) {
    history.replaceState(null, '', productUrl(item, '#studio'));
    changeProduct(item);
  } else {
    ++selectionVersion;
    $('custom-garment').hidden = false;
    clearResult();
    $('form-status').textContent = '';
    updateControls();
  }
});
$('consent').addEventListener('change', updateControls);
$('tryon-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if ($('generate').disabled) return;
  clearResult();
  busy = true;
  $('tryon-fields').disabled = true;
  updateControls();
  $('form-status').textContent = mode === 'live' ? 'Clothsy is creating your try-on. This can take a few minutes…' : 'Creating your mock preview…';
  const before = person;
  const item = $('garment-choice').value === 'custom' ? null : product;
  const custom = item ? null : garment;
  const version = selectionVersion;
  try {
    let blob = mode === 'live' ? await requestLive(before, item, custom) : null;
    if (version !== selectionVersion) return;
    const isMock = !blob;
    if (isMock) {
      if (mode === 'live') setMode('mock', 'No Clothsy key is configured. This preview is simulated; photos stay in your browser.');
      blob = await makeMock(before.src, item ? productImage(item) : custom.src, { sample: before.sample, custom: !item });
    }
    await renderResult(blob, before, isMock, item, version);
  } catch (error) {
    if (version === selectionVersion) $('form-status').textContent = error.message || 'Could not create your preview.';
  } finally {
    busy = false;
    $('tryon-fields').disabled = false;
    updateControls();
  }
});
$('compare').addEventListener('input', () => $('comparison').style.setProperty('--split', `${$('compare').value}%`));

function downloadResult() {
  if (!result) return;
  const link = document.createElement('a');
  link.href = result.downloadUrl;
  link.download = result.file.name;
  link.click();
}

$('download').addEventListener('click', downloadResult);
$('share').addEventListener('click', async () => {
  if (!result) return;
  const payload = { files: [result.file], title: 'My Mirrorroom try-on' };
  if (navigator.share && navigator.canShare?.({ files: payload.files })) {
    try {
      await navigator.share(payload);
      $('share-status').textContent = 'Shared your result.';
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  downloadResult();
  $('share-status').textContent = 'Image saved. Attach the PNG to a message to share it.';
});
