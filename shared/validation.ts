import { z } from 'zod';
const text = z.string().trim().min(1).max(120);
export const modeSchema = z.enum(['demo', 'live']);
export const quoteSchema = z.object({
  mode: modeSchema, storeId: text, budgetCents: z.number().int().min(100).max(100000),
  items: z.array(z.object({ productCode: text, quantity: z.number().int().min(1).max(20), locked: z.boolean().optional() }).strict()).min(1).max(10),
}).strict().superRefine((request, ctx) => {
  if (new Set(request.items.map(item => item.productCode)).size !== request.items.length)
    ctx.addIssue({ code: 'custom', message: '相同餐品请合并数量' });
});
export const searchSchema = z.object({ mode: modeSchema, city: z.string().trim().min(1).max(30), keyword: z.string().trim().min(1).max(80) });
