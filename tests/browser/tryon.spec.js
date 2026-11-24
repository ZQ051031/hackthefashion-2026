import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

async function screenshot(page, name, locator = page) {
  if (!process.env.CAPTURE_DOCS) return;
  await page.evaluate(() => document.fonts.ready);
  await locator.screenshot({ path: `docs/screenshots/${name}.png`, animations: 'disabled' });
}

test('shopper opens the size guide, compares a mock result, and saves or shares it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#mode-badge')).toHaveText('DEMO / MOCK');
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
  const generate = page.getByRole('button', { name: 'Generate try-on' });
  await expect(generate).toBeDisabled();
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
});
