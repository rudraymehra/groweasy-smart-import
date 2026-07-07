/**
 * Drives the full import wizard in headless Chromium and screenshots each step.
 * Usage: node scripts/e2e-drive.mjs [baseUrl] [sampleLabel]
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3001';
const SAMPLE = process.argv[3] ?? 'Google Ads export';
const OUT = 'scripts/e2e-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

try {
  // Step 1 — upload
  await page.goto(BASE);
  await page.getByText('Drop your CSV file here').waitFor({ timeout: 30000 });
  await shot('1-upload');

  await page.getByRole('button', { name: SAMPLE }).click();

  // Step 2 — preview
  await page.getByRole('button', { name: /Confirm import/i }).waitFor({ timeout: 15000 });
  await shot('2-preview');

  // Step 3 — mapping review (AI call, allow time)
  await page.getByRole('button', { name: /Confirm import/i }).click();
  await page.getByRole('button', { name: /Start import/i }).waitFor({ timeout: 90000 });
  await shot('3-mapping');

  // Step 4 — processing
  await page.getByRole('button', { name: /Start import/i }).click();
  await page.getByText('import log — live').waitFor({ timeout: 15000 });
  await shot('4-processing');

  // Step 5 — results
  await page.getByText('Successfully parsed').waitFor({ timeout: 180000 });
  await page.waitForTimeout(400);
  await shot('5-results');

  const cards = await page
    .locator('p.font-mono.text-3xl')
    .allTextContents();
  console.log('SUMMARY CARDS (parsed, skipped, imported, total skipped):', cards.join(' / '));

  // Skipped rows panel
  const skippedToggle = page.getByRole('button', { name: /Skipped rows/ });
  if (await skippedToggle.count()) {
    await skippedToggle.click();
    await page.waitForTimeout(300);
    await shot('6-skipped-panel');
  }

  // Dark mode audit
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await page.waitForTimeout(400);
  await shot('7-results-dark');

  // Mobile viewport check
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await shot('8-results-mobile');

  console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join('\n')}` : 'NO CONSOLE ERRORS');
  console.log('E2E FLOW COMPLETE');
} catch (err) {
  await shot('FAILED');
  console.error('E2E FAILED:', err.message);
  console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
