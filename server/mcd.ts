import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Meal, MealDetail, QuoteRequest, QuoteResult } from '../shared/types.ts';
import { mealFamily } from '../shared/types.ts';

export const allowedTools = ['query-nearby-stores', 'query-meals', 'query-meal-detail', 'calculate-price'] as const;
type ToolName = typeof allowedTools[number];
type Wire = Record<string, any>;
let connection: Promise<Client> | undefined;
export class ServiceError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}
export async function mcdClient() {
  if (!process.env.MCD_MCP_TOKEN) throw new ServiceError('请先在本机配置 MCD_MCP_TOKEN', 503);
  if (!connection) connection = (async () => {
    const client = new Client({ name: 'mcfork', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL('https://mcp.mcd.cn'), {
      requestInit: { headers: { Authorization: `Bearer ${process.env.MCD_MCP_TOKEN}` } },
      fetch: async (url, init) => {
        try {
          const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(20000)]) });
          if (response.status === 401 || response.status === 403) throw new ServiceError('麦当劳凭据失效或权限不足，请在本机更新', 401);
          if (response.status === 429) throw new ServiceError('麦当劳接口限流，请稍后重试', 429);
          return response;
        } catch (error) {
          if (error instanceof ServiceError) throw error;
          throw new ServiceError('麦当劳接口连接超时或网络不可用');
        }
      },
    });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      for (const name of allowedTools) if (!tools.tools.some(tool => tool.name === name)) throw new ServiceError(`当前服务缺少 ${name} 工具`);
      return client;
    } catch (error) {
      await client.close().catch(() => {});
      connection = undefined;
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('无法建立麦当劳 MCP 连接，请检查本机凭据与网络');
    }
  })();
  return connection;
}
export async function closeMcd() {
  if (connection) await (await connection.catch(() => null))?.close();
  connection = undefined;
}
export function unpackTool(result: Wire): Wire {
  if (result.isError) throw new ServiceError('麦当劳工具执行失败，本次结果未核验');
  let body: Wire | undefined = result.structuredContent;
  if (!body) {
    for (const content of result.content ?? []) if (content.type === 'text') {
      try { body = JSON.parse(content.text); break; } catch { /* Tool prose is not a verified JSON response. */ }
    }
  }
  if (!body || body.success === false || body.data === undefined || body.data === null) throw new ServiceError('麦当劳接口未返回可核验数据');
  return body;
}
export async function mcdCall(name: ToolName, args: Wire): Promise<Wire> {
  if (!allowedTools.includes(name)) throw new ServiceError('该工具不在只读白名单中', 400);
  const client = await mcdClient();
  try {
    return unpackTool(await client.callTool({ name, arguments: args }, undefined, { timeout: 25000 }));
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    // Never forward SDK errors: transport messages can contain request context.
    throw new ServiceError('麦当劳工具调用失败或返回结构变化，请重新查询');
  }
}
const menus = new Map<string, { at: number; meals: Meal[] }>();
const details = new Map<string, { at: number; detail: Wire }>();
const TTL = 5 * 60000;
export async function getMenu(storeId: string): Promise<Meal[]> {
  const cached = menus.get(storeId);
  if (cached && Date.now() - cached.at < TTL) return cached.meals;
  const { data } = await mcdCall('query-meals', { storeCode: storeId, orderType: 1, beType: 1 });
  if (!Array.isArray(data.categories) || typeof data.meals !== 'object') throw new ServiceError('当前菜单结构无法识别，未展示猜测餐品');
  const meals: Meal[] = [];
  const seen = new Set<string>();
  for (const category of data.categories) for (const entry of category.meals ?? []) {
    const meal = data.meals[entry.code];
    if (!meal || !meal.name || seen.has(entry.code) || meal.withOrder || meal.canWithOrder) continue;
    seen.add(entry.code);
    const rawPrice = typeof meal.currentPrice === 'string' && /^\d+(\.\d{1,2})?$/.test(meal.currentPrice) ? Math.round(Number(meal.currentPrice) * 100) : undefined;
    const image = typeof meal.image === 'string' && /^https:\/\/(?:[\w-]+\.)?mcd\.cn\//.test(meal.image) ? meal.image : undefined;
    meals.push({ code: entry.code, name: meal.name, category: category.name.replace(/\s+/g, ''), priceCents: rawPrice, image, family: mealFamily(meal.name) });
  }
  if (menus.size > 50) menus.clear();
  menus.set(storeId, { at: Date.now(), meals });
  return meals;
}
async function rawDetail(storeId: string, code: string) {
  const key = `${storeId}:${code}`, cached = details.get(key);
  if (cached && Date.now() - cached.at < TTL) return cached.detail;
  if (!(await getMenu(storeId)).some(meal => meal.code === code)) throw new ServiceError('该餐品不在本店当前菜单中', 400);
  const { data } = await mcdCall('query-meal-detail', { storeCode: storeId, orderType: 1, beType: 1, code });
  if (data.code !== code) throw new ServiceError('餐品详情与菜单编码不匹配');
  if (details.size > 300) details.clear();
  details.set(key, { at: Date.now(), detail: data });
  return data;
}
export function defaultModification(modification: Wire | undefined): Wire | undefined {
  if (!modification?.items?.length) return undefined;
  const values: Wire[] = [];
  for (const group of modification.items) {
    let selected = 0;
    for (const option of group.values ?? []) {
      const quantity = Number(option.selectedQuantity ?? 0);
      if (!Number.isInteger(quantity) || quantity < 0) throw new ServiceError('特调默认数量无法确认');
      if (quantity > 0) selected++;
      const key = quantity > 0 ? option.selectedKey : option.unselectedKey;
      if (key) values.push({ code: option.code, key, quantity });
      else if (quantity > 0) throw new ServiceError('特调默认参数不完整');
    }
    if (selected < (group.minValues ?? 0) || selected > (group.maxValues ?? Infinity)) throw new ServiceError('特调默认选择无法确认');
  }
  return values.length ? { values } : undefined;
}
export function defaultItem(detail: Wire, quantity: number): Wire {
  const item: Wire = { productCode: detail.code, quantity };
  const modification = defaultModification(detail.modification);
  if (modification) item.modification = modification;
  const rounds: Wire[] = [];
  for (const round of detail.rounds ?? []) {
    const choices = (round.choices ?? []).filter((choice: Wire) => choice.isDefault === 1);
    const selectedQuantity = choices.reduce((n: number, choice: Wire) => n + (choice.quantity ?? 1), 0);
    if (!choices.length || selectedQuantity < (round.minQuantity ?? 0) || selectedQuantity > (round.maxQuantity ?? Infinity)) throw new ServiceError('该套餐默认搭配不完整，首版暂不支持选择');
    rounds.push({ round: String(round.id), comboItemList: choices.map((choice: Wire) => {
      const modification = defaultModification(choice.modification);
      return { code: choice.code, quantity: choice.quantity ?? 1, ...(modification ? { modification } : {}) };
    }) });
  }
  if (rounds.length) item.roundList = rounds;
  return item;
}
export async function getMealDetail(storeId: string, code: string): Promise<MealDetail> {
  const data = await rawDetail(storeId, code);
  let configurable = true, note: string | undefined;
  try { defaultItem(data, 1); } catch { configurable = false; note = '默认搭配信息不完整，请到官方客户端选择'; }
  return { code, name: data.name, configurable, supportModify: !!data.supportModify, defaults: (data.rounds ?? []).flatMap((round: Wire) => (round.choices ?? []).filter((choice: Wire) => choice.isDefault === 1).map((choice: Wire) => `${choice.name}${choice.supportModify ? '【可特调】' : ''} × ${choice.quantity ?? 1}`)), note };
}
export function quoteFromWire(body: Wire, request: QuoteRequest): QuoteResult {
  const { data } = body;
  if (!Number.isSafeInteger(data?.price) || data.price < 0 || !Array.isArray(data.productList) || !data.productList.length) throw new ServiceError('官方核价缺少有效金额或餐单，本次未核验');
  const expected = new Map(request.items.map(item => [item.productCode, item.quantity]));
  const actual = new Map<string, number>();
  for (const line of data.productList) {
    if (!Number.isSafeInteger(line.quantity) || !Number.isSafeInteger(line.subtotal) || line.quantity < 1 || line.subtotal < 0) throw new ServiceError('官方核价餐单字段不完整');
    actual.set(line.productCode, (actual.get(line.productCode) ?? 0) + line.quantity);
  }
  if (expected.size !== actual.size || [...expected].some(([code, quantity]) => actual.get(code) !== quantity)) throw new ServiceError('官方返回餐单与所选餐品不一致，本次未核验');
  return { mode: 'live', verified: true, priceCents: data.price, withinBudget: data.price <= request.budgetCents, queriedAt: new Date().toISOString(), items: data.productList.map((line: Wire) => ({ productCode: line.productCode, name: line.productName, quantity: line.quantity, subtotalCents: line.subtotal })), traceId: typeof body.traceId === 'string' ? body.traceId : undefined };
}
export async function liveQuote(request: QuoteRequest) {
  const items = [];
  for (const item of request.items) items.push(defaultItem(await rawDetail(request.storeId, item.productCode), item.quantity));
  const body = await mcdCall('calculate-price', { storeCode: request.storeId, orderType: 1, beType: 1, items, needTableware: false });
  return quoteFromWire(body, request);
}
