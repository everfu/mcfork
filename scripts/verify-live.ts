import { writeFile } from 'node:fs/promises';
import { stores, menu, compare, detail } from '../server/service.ts';
import { initialCart } from '../shared/demo.ts';
import { closeMcd } from '../server/mcd.ts';
try {
  const found = await stores({ mode: 'live', city: '杭州', keyword: '武林广场' });
  const store = found.stores.find(store => !store.suspended);
  if (!store) throw new Error('No open store found');
  const catalog = await menu('live', store.id);
  const items = initialCart(catalog.meals);
  if (items.length !== 3) throw new Error('Incomplete initial cart');
  await detail('live', store.id, items[0].productCode);
  const result = await compare({ mode: 'live', storeId: store.id, budgetCents: 4800, items });
  if (!result.original.quote.verified || result.alternatives.some(v => !v.quote.verified)) throw new Error('Unverified quote');
  const evidence = {
    verifiedAt: new Date().toISOString(), source: 'https://mcp.mcd.cn',
    tools: ['query-nearby-stores', 'query-meals', 'query-meal-detail', 'calculate-price'],
    store, menuCount: catalog.meals.length, checkedCount: result.checkedCount, failedCount: result.failedCount,
    original: result.original.quote,
    alternatives: result.alternatives.map(v => ({ title: v.title, changes: v.changes.map(c => ({ from: c.from.name, to: c.to.name, quantity: c.quantity })), quote: v.quote })),
    limitations: 'One store, current default configurations only; no order creation, purchase, coupon binding, or account mutation.',
  };
  await writeFile('evidence/mcp-live-verification.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ verified: true, store: store.name, originalCents: result.original.quote.priceCents, alternatives: result.alternatives.map(v => v.quote.priceCents), checked: result.checkedCount }));
} catch { console.error('Live verification failed; no success evidence written. Check local credentials and network.'); process.exitCode = 1; }
finally { await closeMcd(); }
