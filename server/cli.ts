import { readFile } from 'node:fs/promises';
import { stores, compare, menu, detail } from './service.ts';
import { closeMcd, ServiceError } from './mcd.ts';
import { ZodError } from 'zod';
const [command, file] = process.argv.slice(2);
try {
  if (!file || !['stores', 'compare', 'menu', 'detail'].includes(command)) throw new ServiceError('用法：npm run fork -- stores|menu|detail|compare 输入.json', 400);
  const input = JSON.parse(await readFile(file, 'utf8'));
  if (input.mode !== 'demo' && input.mode !== 'live') throw new ServiceError('mode 必须为 demo 或 live', 400);
  let result: unknown;
  if (command === 'stores') result = await stores(input);
  else {
    if (input.mode === 'live') {
      const response = await stores({ mode: 'live', city: input.city, keyword: input.keyword });
      if (!response.stores.some(store => store.id === input.storeId)) throw new ServiceError('该门店不在搜索结果中，请重新确认', 400);
    }
    if (command === 'menu') result = await menu(input.mode, input.storeId);
    else if (command === 'detail') result = await detail(input.mode, input.storeId, input.code);
    else result = await compare({ mode: input.mode, storeId: input.storeId, budgetCents: input.budgetCents, items: input.items });
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const message = error instanceof ServiceError ? error.message : error instanceof ZodError ? error.issues[0]?.message : '输入文件无效或请求失败';
  console.error(JSON.stringify({ error: message })); process.exitCode = 1;
} finally { await closeMcd(); }
