import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const browserIssues = new WeakMap();
const expectedBrowserIssues = new WeakMap();
test.beforeEach(({ page }) => {
  const issues = [];
  browserIssues.set(page, issues);
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) issues.push(message.text());
  });
  page.on('requestfailed', (request) => issues.push(`${request.url()}: ${request.failure()?.errorText}`));
});
test.afterEach(({ page }) => expect(browserIssues.get(page)).toEqual(expectedBrowserIssues.get(page) ?? []));

async function screenshot(page, name, locator = page) {
  if (!process.env.CAPTURE_DOCS) return;
  await page.evaluate(() => document.fonts.ready);
  await locator.screenshot({ path: `docs/screenshots/${name}.png`, animations: 'disabled' });
}

test('shopper opens the size guide, compares a mock result, and saves or shares it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#mode-badge')).toHaveText('DEMO / MOCK');
  await expect(page.locator('#demo-note')).toHaveText('Clothsy key unavailable · Simulated results');
  await expect(page.getByRole('heading', { name: 'Studio Denim Jacket' })).toBeVisible();
  await page.locator('#product-image').evaluate((img) => img.decode());
  await screenshot(page, 'product');
  await page.getByRole('button', { name: 'Find my size' }).click();
  await page.getByLabel('Chest (cm)').fill('94');
  await page.getByLabel('Fit preference').selectOption('roomy');
  await page.getByRole('button', { name: 'Recommend a size' }).click();
  await expect(page.locator('#size-result')).toHaveText(/Try size L: its 110 cm chest/);
  await page.getByRole('button', { name: 'Use recommended size' }).click();
  await expect(page.getByRole('button', { name: 'L', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('link', { name: 'Try it on' }).click();
  await expect(page.getByRole('button', { name: 'L', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Use illustrated demo model' }).click();
  await expect(page.locator('#person-thumb')).toBeVisible();
  const generate = page.getByRole('button', { name: 'Generate try-on' });
  await expect(generate).toBeDisabled();
  await expect(page.locator('#ready-hint')).toHaveText('Confirm consent to generate your preview.');
  await page.getByRole('checkbox').check();
  await generate.click();
  await expect(page.locator('#result-mode')).toHaveText('DEMO / MOCK');
  await expect(page.getByRole('img', { name: 'Try-on result' })).toBeVisible();
  await page.getByRole('slider', { name: 'Drag to compare' }).fill('34');
  await expect(page.locator('#comparison')).toHaveCSS('--split', '34%');
  await screenshot(page, 'fitting-room', page.locator('#studio'));
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Save PNG' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('mirrorroom-studio-denim-mock.png');
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: () => false }));
  const [sharedFile] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Share result' }).click(),
  ]);
  expect(sharedFile.suggestedFilename()).toBe(download.suggestedFilename());
  await expect(page.locator('#share-status')).toContainText('Attach the PNG');
});

test('mobile shopper selects a catalog product and can upload a custom garment', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('link', { name: /Weekend Hoodie/ }).click();
  await expect(page.getByRole('heading', { name: 'Weekend Hoodie' })).toBeVisible();
  await expect(page.locator('#garment-choice')).toHaveValue('weekend-hoodie');
  await expect(page).toHaveURL(/product=weekend-hoodie/);
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await screenshot(page, 'mobile');

  await page.getByRole('link', { name: 'Try it on' }).click();
  const fixture = fileURLToPath(new URL('../../public/garments/tee.png', import.meta.url));
  await page.locator('#person-file').setInputFiles(fixture);
  await expect(page.locator('#person-name')).toHaveText('tee.png');
  await page.locator('#garment-choice').selectOption('custom');
  await page.getByRole('checkbox').check();
  const generate = page.getByRole('button', { name: 'Generate try-on' });
  await expect(generate).toBeDisabled();
  await page.locator('#garment-file').setInputFiles(fixture);
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(page.locator('#result-mode')).toHaveText('DEMO / MOCK');
  await expect(page.getByRole('img', { name: 'Original photo' })).toBeVisible();
  await expect(page.locator('#preview')).toBeInViewport();
  await page.getByRole('slider', { name: 'Drag to compare' }).fill('70');
  await expect(page.locator('#comparison')).toHaveCSS('--split', '70%');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save PNG' }).click()]);
  expect(download.suggestedFilename()).toBe('mirrorroom-custom-garment-mock.png');
});

test('a live result stays on its product while catalog navigation is locked', async ({ page }) => {
  await page.route('**/api/status', (route) => route.fulfill({ json: { mode: 'live' } }));
  const responseGate = Promise.withResolvers();
  const fixture = fileURLToPath(new URL('../../public/garments/tee.png', import.meta.url));
  await page.route('**/api/tryon', async (route) => {
    await responseGate.promise;
    await route.fulfill({ path: fixture, contentType: 'image/png' });
  });
  await page.goto('/');
  const originalUrl = page.url();
  await page.getByRole('link', { name: /Weekend Hoodie/ }).click();
  await page.locator('#person-file').setInputFiles(fixture);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Generate try-on' }).click();
  await expect(page.locator('#preview')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Preparing your preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generating preview…' })).toBeDisabled();
  const denim = page.getByRole('link', { name: /Studio Denim Jacket/ });
  await expect(denim).toBeDisabled();
  await expect(page.locator('#garment-choice')).toBeDisabled();
  await denim.click({ force: true });
  await expect(page.getByRole('heading', { name: 'Weekend Hoodie' })).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
    history.back();
  }));
  await expect(page).toHaveURL(/product=weekend-hoodie/);
  await expect(page.getByRole('heading', { name: 'Weekend Hoodie' })).toBeVisible();
  responseGate.resolve();
  await expect(page.locator('#result-mode')).toHaveText('Clothsy result');
  await expect(page.locator('#preview')).toHaveAttribute('aria-busy', 'false');
  await expect(denim).toBeEnabled();
  await page.goBack();
  await expect(page).toHaveURL(originalUrl);
  await expect(page.getByRole('heading', { name: 'Studio Denim Jacket' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Weekend Hoodie' })).toBeVisible();
  await denim.click();
  await expect(page.getByRole('heading', { name: 'Studio Denim Jacket' })).toBeVisible();
});

test('a slow live try-on resumes the same job through a temporary status error', async ({ page }) => {
  expectedBrowserIssues.set(page, ['Failed to load resource: the server responded with a status of 503 (Service Unavailable)']);
  const fixture = fileURLToPath(new URL('../../public/garments/tee.png', import.meta.url));
  const pollUrl = '/api/tryon/status/test-token';
  let starts = 0;
  let polls = 0;
  await page.route('**/api/status', (route) => route.fulfill({ json: { mode: 'live' } }));
  await page.route('**/api/tryon', (route) => {
    ++starts;
    return route.fulfill({ status: 202, json: { id: 'slow-job', pollUrl } });
  });
  await page.route(`**${pollUrl}`, (route) => {
    ++polls;
    if (polls === 1) return route.fulfill({ status: 202, json: { id: 'slow-job' } });
    if (polls === 2) return route.fulfill({ status: 503, json: { message: 'Temporary error' } });
    return route.fulfill({ path: fixture, contentType: 'image/png' });
  });
  await page.goto('/');
  await page.locator('#person-file').setInputFiles(fixture);
  await page.getByRole('checkbox').check();
  const generate = page.locator('#generate');
  await generate.click();
  await expect(page.locator('#form-status')).toContainText('still working');
  await expect(generate).toBeDisabled();
  await expect(page.locator('#result-mode')).toHaveText('Clothsy result', { timeout: 15_000 });
  await expect(generate).toBeEnabled();
  expect({ starts, polls }).toEqual({ starts: 1, polls: 3 });
});
