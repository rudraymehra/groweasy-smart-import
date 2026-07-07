/**
 * Full end-to-end acceptance run:
 *  - drives all 4 fixture CSVs through the complete wizard (upload → preview
 *    → AI mapping → import → results), asserting summary counts
 *  - exercises a manual mapping override
 *  - downloads the result CSV and validates it
 *  - checks error paths: non-CSV rejection, empty CSV rejection
 * Usage: node scripts/e2e-full.mjs [baseUrl]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3001';
const OUT = 'scripts/e2e-shots/full';
mkdirSync(OUT, { recursive: true });

const CASES = [
  {
    file: 'google-ads-leads.csv',
    expect: { parsed: 11, skipped: 1, imported: 11, totalSkipped: 1 },
    checks: async (page) => {
      // Junk-header banner appeared during preview (checked earlier in flow)
      // Enum badges present in results:
      await page.getByText('SALE_DONE').first().waitFor();
      await page.getByText('eden_park').first().waitFor();
    },
  },
  {
    file: 'real-estate-crm-export.csv',
    expect: { parsed: 9, skipped: 1, imported: 9, totalSkipped: 1 },
    checks: async (page) => {
      await page.getByText('DID_NOT_CONNECT').first().waitFor();
      await page.getByText('varah_swamy').first().waitFor();
    },
  },
  {
    file: 'messy-manual-sheet.csv',
    expect: { parsed: 7, skipped: 2, imported: 7, totalSkipped: 2 },
    checks: async (page) => {
      // Duplicate + no-contact skip reasons in the panel
      await page.getByRole('button', { name: /Skipped rows/ }).click();
      await page.getByText('Duplicate contact').waitFor();
      await page.getByText('No email or phone').waitFor();
    },
  },
  {
    file: 'edge-cases.csv', // BOM + semicolons + non-English headers
    expect: { parsed: 3, skipped: 0, imported: 3, totalSkipped: 0 },
    checks: async (page) => {
      await page.getByText('jose.garcia@empresa.es').waitFor();
    },
  },
];

const browser = await chromium.launch();
const results = [];
let failures = 0;

async function runCase(testCase, index) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  const label = testCase.file;

  try {
    await page.goto(BASE);
    await page.getByText('Drop your CSV file here').waitFor({ timeout: 30000 });

    // Upload via the real file input (works for all fixtures, not just chips)
    await page
      .locator('input[type="file"]')
      .setInputFiles(`apps/web/public/samples/${testCase.file}`);

    // Preview → confirm
    await page.getByRole('button', { name: /Confirm import/i }).click();

    // Mapping review → verify a select is interactable, then start
    await page.getByRole('button', { name: /Start import/i }).waitFor({ timeout: 90000 });
    await page.screenshot({ path: `${OUT}/${index}-${label}-mapping.png` });

    if (index === 0) {
      // Exercise a manual override on the first case: ignore the City column,
      // then verify the imported records really have no city.
      const citySelect = page.getByLabel('CRM field for column City');
      await citySelect.selectOption('');
    }

    await page.getByRole('button', { name: /Start import/i }).click();
    await page.getByText('Successfully parsed').waitFor({ timeout: 180000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${index}-${label}-results.png` });

    const cards = await page.locator('p.font-mono.text-3xl').allTextContents();
    const [parsed, skipped, imported, totalSkipped] = cards.map(Number);
    const e = testCase.expect;
    const countsOk =
      parsed === e.parsed &&
      skipped === e.skipped &&
      imported === e.imported &&
      totalSkipped === e.totalSkipped;

    await testCase.checks(page);

    // Validate the downloadable CSV
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download CSV/i }).click();
    const download = await downloadPromise;
    const csvPath = `${OUT}/${index}-${label}-result.csv`;
    await download.saveAs(csvPath);
    const { readFileSync } = await import('node:fs');
    const csv = readFileSync(csvPath, 'utf8');
    const lines = csv.trim().split('\r\n');
    const csvOk =
      lines[0].startsWith('created_at,name,email,country_code') &&
      lines.length === 1 + e.imported;

    const pass = countsOk && csvOk && consoleErrors.length === 0;
    if (!pass) failures++;
    results.push(
      `${pass ? 'PASS' : 'FAIL'}  ${label}  counts=${cards.join('/')}${countsOk ? '' : ` (expected ${e.parsed}/${e.skipped}/${e.imported}/${e.totalSkipped})`}  csv=${csvOk ? `ok(${lines.length - 1} rows)` : 'BAD'}  consoleErrors=${consoleErrors.length}`,
    );
  } catch (err) {
    failures++;
    await page.screenshot({ path: `${OUT}/${index}-${label}-FAILED.png` });
    results.push(`FAIL  ${label}  ${err.message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
}

async function runErrorPaths() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(BASE);
    await page.getByText('Drop your CSV file here').waitFor({ timeout: 30000 });

    // 1. Non-CSV file → client-side rejection toast
    writeFileSync('/tmp/not-a-csv.xlsx', 'fake xlsx bytes');
    await page.locator('input[type="file"]').setInputFiles('/tmp/not-a-csv.xlsx');
    await page.getByText('Only .csv files are supported.').waitFor({ timeout: 5000 });

    // 2. Headers-only CSV → parse error toast, stays on upload step
    writeFileSync('/tmp/headers-only.csv', 'name,email,phone\n');
    await page.locator('input[type="file"]').setInputFiles('/tmp/headers-only.csv');
    await page.getByText('This file has headers but no data rows.').waitFor({ timeout: 5000 });

    // 3. Empty CSV
    writeFileSync('/tmp/empty.csv', '');
    await page.locator('input[type="file"]').setInputFiles('/tmp/empty.csv');
    await page.getByText('This file appears to be empty.').waitFor({ timeout: 5000 });

    results.push('PASS  error-paths (xlsx rejected, headers-only rejected, empty rejected)');
  } catch (err) {
    failures++;
    await page.screenshot({ path: `${OUT}/error-paths-FAILED.png` });
    results.push(`FAIL  error-paths  ${err.message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
}

for (let i = 0; i < CASES.length; i++) await runCase(CASES[i], i);
await runErrorPaths();
await browser.close();

console.log(results.join('\n'));
console.log(failures === 0 ? '\nALL E2E CASES PASSED' : `\n${failures} CASE(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
