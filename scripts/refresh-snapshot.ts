import { writeFile } from 'node:fs/promises';
import { mcdCall, getMenu, closeMcd } from '../server/mcd.ts';
try {
  const body = await mcdCall('query-nearby-stores', { beType: 1, searchType: 2, city: '杭州', keyword: '武林广场' });
  const first = body.data[0];
  if (!first?.storeCode) throw new Error('No store returned');
  const store = { id: first.storeCode, name: first.storeName, address: first.address, opens: first.businessStartTime, closes: first.businessEndTime };
  const meals = await getMenu(store.id);
  if (!meals.length) throw new Error('No menu returned');
  await writeFile('shared/snapshot.json', JSON.stringify({ source: '麦当劳 MCP query-nearby-stores / query-meals', capturedAt: new Date().toISOString(), city: '杭州', stores: [store], meals }, null, 2) + '\n');
  console.log(`Saved public store/menu snapshot: ${meals.length} meals; no credentials or account information.`);
} catch { console.error('Snapshot refresh failed; existing snapshot preserved.'); process.exitCode = 1; }
finally { await closeMcd(); }
