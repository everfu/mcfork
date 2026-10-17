import type { CartItem, Change, Comparison, Meal, QuoteRequest, QuoteResult, Variant } from './types.ts';
export interface Trial { items: CartItem[]; changes: Change[]; estimate: number }
export function candidateTrials(items: CartItem[], menu: Meal[]): Trial[] {
  const byCode = new Map(menu.map(meal => [meal.code, meal]));
  const originalCodes = new Set(items.map(item => item.productCode));
  const slots = items.flatMap((item, index) => {
    const from = byCode.get(item.productCode);
    if (item.locked || !from?.family || from.priceCents === undefined) return [];
    const choices = menu.filter(meal => meal.family === from.family && !originalCodes.has(meal.code) && meal.priceCents !== undefined && meal.priceCents < from.priceCents!)
      .sort((a, b) => a.priceCents! - b.priceCents! || a.code.localeCompare(b.code, 'en')).slice(0, 3);
    return choices.length ? [{ index, from, quantity: item.quantity, choices }] : [];
  });
  const build = (changes: { index: number; from: Meal; to: Meal; quantity: number }[]): Trial => {
    const replacements = new Map(changes.map(change => [change.index, change.to]));
    const cart = items.map((item, index) => ({ ...item, productCode: replacements.get(index)?.code ?? item.productCode }));
    return { items: cart, changes: changes.map(({ from, to, quantity }) => ({ from, to, quantity })), estimate: cart.reduce((sum, item) => sum + (byCode.get(item.productCode)?.priceCents ?? 0) * item.quantity, 0) };
  };
  const singles = slots.flatMap(slot => slot.choices.map(to => build([{ ...slot, to }])));
  const doubles: Trial[] = [];
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
    for (const first of slots[i].choices.slice(0, 2)) for (const second of slots[j].choices.slice(0, 2)) {
      if (first.code !== second.code) doubles.push(build([{ ...slots[i], to: first }, { ...slots[j], to: second }]));
    }
  }
  const compare = (a: Trial, b: Trial) => a.estimate - b.estimate || a.items.map(i => i.productCode).join(',').localeCompare(b.items.map(i => i.productCode).join(','), 'en');
  // shortcut: only single and double substitutions, expand after real user demand for larger carts.
  return [...singles.sort(compare).slice(0, 6), ...doubles.sort(compare).slice(0, 5)];
}
export async function compareMeal(request: QuoteRequest, menu: Meal[], price: (request: QuoteRequest) => Promise<QuoteResult>): Promise<Comparison> {
  const byCode = new Map(menu.map(meal => [meal.code, meal]));
  if (request.items.some(item => !byCode.has(item.productCode))) throw new Error('部分餐品已不在本店当前菜单，请重新选择');
  const baseQuote = await price(request);
  const original: Variant = { id: 'original', title: '我的原餐单', items: request.items, changes: [], quote: baseQuote };
  const successful: Variant[] = [];
  let failedCount = 0;
  const trials = candidateTrials(request.items, menu);
  for (const [index, trial] of trials.entries()) {
    try {
      const quote = await price({ ...request, items: trial.items });
      successful.push({ id: `trial-${index}`, title: '', items: trial.items, changes: trial.changes, quote });
    } catch (error) {
      if ([401, 403, 429, 503].includes((error as { status?: number }).status ?? 0)) throw error;
      failedCount++;
    }
  }
  const viable = successful.filter(variant => variant.quote.priceCents <= request.budgetCents && variant.quote.priceCents < baseQuote.priceCents);
  viable.sort((a, b) => a.changes.length - b.changes.length || a.quote.priceCents - b.quote.priceCents || a.id.localeCompare(b.id, 'en'));
  const alternatives: Variant[] = [];
  if (viable.length) {
    const first = viable[0];
    alternatives.push({ ...first, title: first.changes.length === 1 ? '少改一项' : '少改一点' });
    const cheaper = viable.filter(variant => variant.quote.priceCents < first.quote.priceCents).sort((a, b) => a.quote.priceCents - b.quote.priceCents || a.changes.length - b.changes.length || a.id.localeCompare(b.id, 'en'))[0];
    if (cheaper) alternatives.push({ ...cheaper, title: '多省一点' });
  }
  return { mode: request.mode, storeId: request.storeId, budgetCents: request.budgetCents, original, alternatives, checkedCount: 1 + trials.length, failedCount, lowestPriceCents: Math.min(baseQuote.priceCents, ...successful.map(variant => variant.quote.priceCents)), queriedAt: new Date().toISOString(), notice: alternatives.length ? undefined : request.items.every(item => item.locked) ? '餐品已全部锁定。解锁一项后，才能试试其他搭配。' : '本轮未找到既保留锁定餐品、又满足预算且更便宜的方案。可以调整预算或解锁一项后重试。' };
}
