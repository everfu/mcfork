import { mcdClient, closeMcd } from '../server/mcd.ts';
try {
  const client = await mcdClient();
  const tools = await client.listTools();
  console.log(JSON.stringify(tools.tools.filter(tool => ['query-nearby-stores', 'query-meals', 'query-meal-detail', 'calculate-price'].includes(tool.name)).map(tool => ({ name: tool.name, inputSchema: tool.inputSchema })), null, 2));
} catch { console.error('无法读取工具列表，请检查本机 Token 和网络'); process.exitCode = 1; }
finally { await closeMcd(); }
