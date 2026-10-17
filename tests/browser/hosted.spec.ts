import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const output = '/tmp/mcfork-hosted-build';
const apiOrigin = 'https://api.mcfork.test';
const pageOrigin = 'https://web.mcfork.test';
const selectionToken = 'test-only-signed-selection';
test.beforeAll(() => {
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', output], { env: { ...process.env, VITE_API_BASE_URL: apiOrigin }, stdio: 'pipe' });
});
test.beforeEach(async ({ page }) => {
  await page.route(`${pageOrigin}/**`, async route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/mcfork\//, '') || 'index.html';
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.gif': 'image/gif' };
    try { await route.fulfill({ body: await readFile(resolve(output, path)), contentType: types[extname(path)] ?? 'application/octet-stream' }); }
    catch { await route.fulfill({ status: 404, body: 'Missing test asset' }); }
  });
});
test('hosted frontend forwards store selection and compares separate official quotes', async ({ page }) => {
  const snapshot = JSON.parse(await readFile('shared/snapshot.json', 'utf8'));
  const requests: { path: string; selection?: string }[] = [];
  let limited = false;
  await page.route(`${apiOrigin}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    const headers = { 'Access-Control-Allow-Origin': pageOrigin, 'Access-Control-Allow-Headers': 'Content-Type, X-Store-Selection', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    requests.push({ path: url.pathname, selection: (await request.allHeaders())['x-store-selection'] });
    let result;
    if (url.pathname === '/api/config') result = { liveAvailable: true };
    else if (url.pathname === '/api/stores') result = { mode: 'live', stores: snapshot.stores.map((store: object) => ({ ...store, selectionToken })), queriedAt: new Date().toISOString() };
    else if (url.pathname === '/api/menu') result = { mode: 'live', meals: snapshot.meals };
    else if (url.pathname === '/api/quote') {
      if (limited) { await route.fulfill({ status: 429, body: 'Too many requests', headers }); return; }
      const input = request.postDataJSON();
      const items = input.items.map((item: { productCode: string; quantity: number }) => {
        const meal = snapshot.meals.find((meal: { code: string }) => meal.code === item.productCode);
        return { productCode: meal.code, name: meal.name, quantity: item.quantity, subtotalCents: meal.priceCents * item.quantity };
      });
      const priceCents = items.reduce((sum: number, item: { subtotalCents: number }) => sum + item.subtotalCents, 0);
      result = { mode: 'live', verified: true, items, priceCents, withinBudget: priceCents <= input.budgetCents, queriedAt: new Date().toISOString() };
    } else throw new Error(`Unexpected hosted endpoint: ${url.pathname}`);
    await route.fulfill({ json: result, headers });
  });
  await page.goto(`${pageOrigin}/mcfork/`);
  await expect(page.getByRole('button', { name: '开始比较餐单' })).toBeEnabled();
  await expect(page.locator('.store-address')).toContainText('杭州国大城市广场');
  await page.getByRole('button', { name: '开始比较餐单' }).click();
  await expect(page.locator('.variant')).toHaveCount(2);
  await expect(page.locator('.variant').first()).toContainText('官方核价');
  expect(requests.filter(request => request.path === '/api/quote').length).toBeGreaterThan(1);
  expect(requests.filter(request => ['/api/menu', '/api/quote'].includes(request.path)).every(request => request.selection === selectionToken)).toBe(true);
  expect(requests.some(request => request.path === '/api/compare')).toBe(false);
  const before = requests.filter(request => request.path === '/api/quote').length;
  limited = true;
  await page.getByRole('region', { name: '我的原餐单' }).getByRole('button', { name: '重新比较', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('请求过于频繁');
  await expect(page.locator('.variant')).toHaveCount(0);
  expect(requests.filter(request => request.path === '/api/quote')).toHaveLength(before + 1);
});
test('hosted service failure is explicit and demo requires a user choice', async ({ page }) => {
  await page.route(`${apiOrigin}/**`, route => route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': pageOrigin }, body: 'Service unavailable' }));
  await page.goto(`${pageOrigin}/mcfork/`);
  await expect(page.getByRole('alert')).toContainText('实时服务暂不可用');
  await expect(page.locator('.variant')).toHaveCount(0);
  await page.getByRole('button', { name: '官方实时', exact: true }).click();
  await expect(page.getByRole('button', { name: '演示试算', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始比较餐单' }).click();
  await expect(page.locator('.variant')).toHaveCount(2);
  await expect(page.locator('.variant').first()).toContainText('演示试算');
});
