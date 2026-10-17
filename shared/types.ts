export type Mode = 'demo' | 'live';
export type Family = 'main' | 'side' | 'drink';
export interface Store { id: string; name: string; address: string; opens?: string; closes?: string; suspended?: boolean }
export interface Meal { code: string; name: string; category: string; priceCents?: number; image?: string; family?: Family }
export interface MealDetail { code: string; name: string; configurable: boolean; supportModify: boolean; defaults: string[]; note?: string }
export interface CartItem { productCode: string; quantity: number; locked?: boolean }
export interface QuoteRequest { mode: Mode; storeId: string; budgetCents: number; items: CartItem[] }
export interface QuoteResult {
  mode: Mode; verified: boolean; priceCents: number; withinBudget: boolean; queriedAt: string;
  items: { productCode: string; name: string; quantity: number; subtotalCents: number }[]; traceId?: string;
}
export interface Change { from: Meal; to: Meal; quantity: number }
export interface Variant { id: string; title: string; items: CartItem[]; changes: Change[]; quote: QuoteResult }
export interface Comparison {
  mode: Mode; storeId: string; budgetCents: number; original: Variant; alternatives: Variant[];
  checkedCount: number; failedCount: number; lowestPriceCents: number; queriedAt: string; notice?: string;
}
export interface StoresResponse { mode: Mode; stores: Store[]; queriedAt: string; snapshotAt?: string }
export interface MenuResponse { mode: Mode; meals: Meal[]; queriedAt: string; snapshotAt?: string }
export interface AppConfig { liveAvailable: boolean }
export const yuan = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, '');
export function mealFamily(name: string): Family | undefined {
  if (/套餐|人餐|乐园餐|件套|随心拼|任选|分享|拼盘|兑换|会员|礼盒|双拼|组合|单品精选/.test(name)) return undefined;
  if (/汉堡|鸡腿堡|麦香鸡|麦香鱼|巨无霸|板烧|猪柳|堡/.test(name)) return 'main';
  if (/薯条|麦乐鸡|鸡翅|鸡块|香芋派|菠萝派|芝士棒|鸡米花/.test(name)) return 'side';
  if (!/冰淇淋|麦旋风|圣代|甜筒|冰沙|雪冰|阿芙佳朵/.test(name) && /可乐|雪碧|芬达|红茶|绿茶|乌龙|咖啡|拿铁|美式|牛奶|果汁|豆浆|黑巧|麦炫酷|气泡|奶茶|柠檬饮/.test(name)) return 'drink';
  return undefined;
}
export function receiptText(store: Store, comparison: Comparison, variant: Variant) {
  return [
    '麦麦平行餐桌 McFork', store.name, store.address,
    comparison.mode === 'live' ? '官方当次核价' : '演示试算，非官方核价',
    `查询时间：${new Date(variant.quote.queriedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`,
    '', '原餐单', ...comparison.original.quote.items.map(item => `${item.name} ×${item.quantity}  ¥${yuan(item.subtotalCents)}`),
    `合计 ¥${yuan(comparison.original.quote.priceCents)}`, '', variant.title,
    ...variant.quote.items.map(item => `${item.name} ×${item.quantity}  ¥${yuan(item.subtotalCents)}`),
    `合计 ¥${yuan(variant.quote.priceCents)}`, `与原餐单相比节省 ¥${yuan(comparison.original.quote.priceCents - variant.quote.priceCents)}`,
    ...variant.changes.map(change => `${change.from.name} → ${change.to.name} ×${change.quantity}`),
    '', '仅适用于本店当次查询，不保证后续价格及供应。', '独立参赛作品，非麦当劳官方产品。',
  ].join('\n');
}
