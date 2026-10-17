import type { Config } from '@netlify/functions';
import { ZodError } from 'zod';
import { detail, menu, quote, rememberStore, stores } from '../../server/service.ts';
import { ServiceError } from '../../server/mcd.ts';
import { signSelection, verifySelection } from '../../server/selection.ts';
import { modeSchema, quoteSchema } from '../../shared/validation.ts';

export default async function handler(req: Request) {
  const origin = Netlify.env.get('ALLOWED_WEB_ORIGIN');
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' });
  const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
  if (!origin || req.headers.get('origin') !== origin) return json(403, { error: '拒绝此来源的请求' });
  headers.set('Access-Control-Allow-Origin', origin);
  if (req.method === 'OPTIONS') {
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Store-Selection');
    headers.set('Access-Control-Max-Age', '600');
    return new Response(null, { status: 204, headers });
  }
  try {
    const secret = Netlify.env.get('MCD_MCP_TOKEN') ?? '';
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/api/config') return json(200, { liveAvailable: !!secret });
    const param = (key: string) => {
      const value = url.searchParams.get(key)?.trim();
      if (!value || value.length > 120) throw new ServiceError(`缺少或无效参数：${key}`, 400);
      return value;
    };
    const restoreSelection = (mode: string, storeId: string) => {
      if (mode !== 'live') return;
      if (!verifySelection(req.headers.get('x-store-selection') ?? '', storeId, secret)) throw new ServiceError('门店选择已过期，请重新搜索并选择门店', 403);
      rememberStore(storeId);
    };
    if (req.method === 'GET' && ['/api/menu', '/api/detail'].includes(url.pathname)) {
      const mode = modeSchema.parse(param('mode')), storeId = param('storeId');
      restoreSelection(mode, storeId);
      return json(200, url.pathname === '/api/menu' ? await menu(mode, storeId) : await detail(mode, storeId, param('code')));
    }
    if (req.method !== 'POST' || !['/api/stores', '/api/quote'].includes(url.pathname)) return json(404, { error: '接口不存在' });
    if (!req.headers.get('content-type')?.startsWith('application/json')) throw new ServiceError('请求必须使用 application/json', 415);
    if (Number(req.headers.get('content-length') ?? 0) > 65536) throw new ServiceError('请求内容过大', 413);
    // Stream the body so an omitted Content-Length cannot bypass the limit.
    const chunks: Uint8Array[] = []; let size = 0;
    if (req.body) for await (const chunk of req.body) {
      size += chunk.length;
      if (size > 65536) throw new ServiceError('请求内容过大', 413);
      chunks.push(chunk);
    }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString()); }
    catch { throw new ServiceError('请求 JSON 无法解析', 400); }
    if (url.pathname === '/api/stores') {
      const result = await stores(input);
      return json(200, { ...result, stores: result.stores.map(store => ({ ...store, ...(result.mode === 'live' ? { selectionToken: signSelection(store.id, secret) } : {}) })) });
    }
    const request = quoteSchema.parse(input);
    restoreSelection(request.mode, request.storeId);
    return json(200, await quote(request));
  } catch (error) {
    if (error instanceof ZodError) return json(400, { error: error.issues[0]?.message ?? '输入参数不完整' });
    if (error instanceof ServiceError) return json(error.status, { error: error.message });
    return json(500, { error: '本次请求未能完成，请稍后重试' });
  }
}

export const config: Config = {
  path: '/api/*',
  method: ['GET', 'POST', 'OPTIONS'],
  rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowSize: 60, windowLimit: 60 },
};
