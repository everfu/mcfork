import snapshot from './snapshot.json' with { type: 'json' };
import assetFiles from './demo-assets.json' with { type: 'json' };
import { mealFamily } from './types.ts';
import type { CartItem, Meal, QuoteRequest, QuoteResult, Store } from './types.ts';
export const demoStores: Store[] = snapshot.stores;
export const snapshotAt = snapshot.capturedAt;
const localAssets: Record<string, { path: string; source: string }> = assetFiles;
export const demoMeals: Meal[] = snapshot.meals.map(meal => ({ ...meal, image: localAssets[meal.code]?.path ?? meal.image, family: mealFamily(meal.name) }));
export function initialCart(menu: Meal[]): CartItem[] {
  const main = menu.find(meal => /^麦辣鸡腿汉堡$/.test(meal.name)) ?? menu.find(meal => meal.family === 'main');
  const side = menu.find(meal => /薯条/.test(meal.name) && /中/.test(meal.name)) ?? menu.find(meal => /薯条/.test(meal.name)) ?? menu.find(meal => meal.family === 'side');
  const drink = menu.find(meal => meal.name === '浓浓黑巧（冰/热）') ?? menu.find(meal => meal.family === 'drink');
  return [main, side, drink].filter((meal): meal is Meal => !!meal).map((meal, index) => ({ productCode: meal.code, quantity: 1, locked: index === 0 }));
}
export function demoQuote(request: QuoteRequest): QuoteResult {
  if (!demoStores.some(store => store.id === request.storeId)) throw new Error('演示门店不存在');
  const items = request.items.map(item => {
    const meal = demoMeals.find(meal => meal.code === item.productCode);
    if (!meal || meal.priceCents === undefined) throw new Error('快照中缺少该餐品的展示价，无法演示试算');
    return { productCode: meal.code, name: meal.name, quantity: item.quantity, subtotalCents: meal.priceCents * item.quantity };
  });
  const priceCents = items.reduce((sum, item) => sum + item.subtotalCents, 0);
  return { mode: 'demo', verified: false, priceCents, withinBudget: priceCents <= request.budgetCents, queriedAt: new Date().toISOString(), items };
}
