import { quoteSchema, searchSchema } from '../shared/validation.ts';
import { compareMeal } from '../shared/engine.ts';
import { demoMeals, demoQuote, demoStores, snapshotAt } from '../shared/demo.ts';
import { getMealDetail, getMenu, liveQuote, mcdCall, ServiceError } from './mcd.ts';
import type { Mode, Store } from '../shared/types.ts';
const knownStores = new Map<string, number>();
export function config() { return { liveAvailable: !!process.env.MCD_MCP_TOKEN }; }
export async function stores(input: unknown) {
  const request = searchSchema.parse(input);
  if (request.mode === 'demo') return { mode: request.mode, stores: demoStores.filter(store => request.city.includes('杭州') && `${store.name}${store.address}武林广场`.includes(request.keyword)), queriedAt: new Date().toISOString(), snapshotAt };
  const { data } = await mcdCall('query-nearby-stores', { beType: 1, searchType: 2, city: request.city, keyword: request.keyword });
  if (!Array.isArray(data)) throw new ServiceError('官方门店列表结构无法识别');
  if (knownStores.size > 100) knownStores.clear();
  const results: Store[] = data.filter(item => typeof item.storeCode === 'string' && typeof item.storeName === 'string' && typeof item.address === 'string').map(item => {
    knownStores.set(item.storeCode, Date.now());
    return { id: item.storeCode, name: item.storeName, address: item.address, opens: item.businessStartTime, closes: item.businessEndTime, suspended: item.businessStatus === false };
  });
  return { mode: request.mode, stores: results, queriedAt: new Date().toISOString() };
}
function allowStore(mode: Mode, storeId: string) {
  if (mode === 'demo') {
    if (!demoStores.some(store => store.id === storeId)) throw new ServiceError('此演示仅提供指定真实门店的菜单快照', 400);
  } else {
    if (!config().liveAvailable) throw new ServiceError('请在本机配置 MCD_MCP_TOKEN', 503);
    const at = knownStores.get(storeId);
    if (!at || Date.now() - at > 60 * 60000) throw new ServiceError('请先搜索并选择真实门店，再查看菜单', 400);
  }
}
export async function menu(mode: Mode, storeId: string) {
  allowStore(mode, storeId);
  return { mode, meals: mode === 'demo' ? demoMeals : await getMenu(storeId), queriedAt: new Date().toISOString(), ...(mode === 'demo' ? { snapshotAt } : {}) };
}
export async function detail(mode: Mode, storeId: string, code: string) {
  allowStore(mode, storeId);
  if (mode === 'live') return getMealDetail(storeId, code);
  const meal = demoMeals.find(meal => meal.code === code);
  if (!meal) throw new ServiceError('该餐品不在菜单快照中', 400);
  return { code, name: meal.name, configurable: true, supportModify: false, defaults: [], note: '菜单快照演示，默认搭配需在实时模式核验' };
}
export async function quote(input: unknown) {
  const request = quoteSchema.parse(input);
  allowStore(request.mode, request.storeId);
  return request.mode === 'demo' ? demoQuote(request) : liveQuote(request);
}
export async function compare(input: unknown) {
  const request = quoteSchema.parse(input);
  allowStore(request.mode, request.storeId);
  const catalog = request.mode === 'demo' ? demoMeals : await getMenu(request.storeId);
  return compareMeal(request, catalog, request.mode === 'demo' ? async input => demoQuote(input) : liveQuote);
}
