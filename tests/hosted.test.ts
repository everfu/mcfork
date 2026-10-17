import test from 'node:test';
import assert from 'node:assert/strict';
import { signSelection, verifySelection } from '../server/selection.ts';
import handler from '../netlify/functions/api.mts';

const origin = 'https://everfu.github.io';
const secret = 'test-only-credential-not-a-real-token';
Object.defineProperty(globalThis, 'Netlify', { value: { env: { get: (key: string) => ({ ALLOWED_WEB_ORIGIN: origin, MCD_MCP_TOKEN: secret })[key as 'ALLOWED_WEB_ORIGIN' | 'MCD_MCP_TOKEN'] } }, configurable: true });
const request = (path: string, init: RequestInit = {}) => new Request(`https://api.example.test${path}`, { ...init, headers: { Origin: origin, ...init.headers } });

test('store selections are bound to one store, credential and hour without exposing the credential', () => {
  const now = 10000000, ticket = signSelection('store-one', secret, now);
  assert.equal(verifySelection(ticket, 'store-one', secret, now), true);
  assert.equal(verifySelection(ticket, 'store-two', secret, now), false);
  assert.equal(verifySelection(ticket, 'store-one', 'another-key', now), false);
  assert.equal(verifySelection(ticket, 'store-one', secret, now + 3600000), false);
  for (const invalid of ['', `${ticket}.extra`, ticket.replace(/^./, 'x'), '.invalid', 'x'.repeat(513)]) assert.equal(verifySelection(invalid, 'store-one', secret, now), false);
  assert.ok(!ticket.includes(secret));
});
test('hosted API allows only the configured web origin and never returns credentials', async () => {
  const config = await handler(request('/api/config'));
  assert.equal(config.status, 200);
  assert.deepEqual(await config.json(), { liveAvailable: true });
  assert.equal(config.headers.get('access-control-allow-origin'), origin);
  for (const foreign of ['https://attacker.test', 'null', '']) {
    const denied = await handler(request('/api/config', { headers: { Origin: foreign } }));
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  }
  const preflight = await handler(request('/api/quote', { method: 'OPTIONS' }));
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers')!, /X-Store-Selection/);
});
test('hosted API rejects missing selections, invalid bodies and unsupported routes before MCP calls', async () => {
  assert.equal((await handler(request('/api/menu?mode=live&storeId=forged'))).status, 403);
  assert.equal((await handler(request('/api/menu?mode=invalid&storeId=forged'))).status, 400);
  assert.equal((await handler(request('/api/compare', { method: 'POST' }))).status, 404);
  assert.equal((await handler(request('/api/quote', { method: 'POST', body: '{}' }))).status, 415);
  assert.equal((await handler(request('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not-json' }))).status, 400);
  assert.equal((await handler(request('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(65537) }))).status, 413);
  const response = await handler(request('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'live', storeId: 'forged', budgetCents: 4800, items: [{ productCode: 'burger', quantity: 1 }] }) }));
  assert.equal(response.status, 403);
  assert.ok(!(await response.text()).includes(secret));
});
