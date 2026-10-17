import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { ZodError } from 'zod';
import { config, detail, stores, compare, menu, quote } from './service.ts';
import { closeMcd, ServiceError } from './mcd.ts';

const port = Number(process.env.PORT ?? 5175);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT 必须是 1024–65535 之间的整数');
const production = process.argv.includes('--production');
const vite = production ? null : await (await import('vite')).createServer({ server: { middlewareMode: true, host: '127.0.0.1', hmr: { port: port + 20000, host: '127.0.0.1' } }, appType: 'spa' });
let comparingBusy = false;
let windowStart = 0, requestCount = 0;
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
async function body(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ServiceError('请求必须使用 application/json', 415);
  let length = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 65536) throw new ServiceError('请求内容过大', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw new ServiceError('请求 JSON 无法解析', 400); }
}
function modeParam(url: URL) {
  const mode = url.searchParams.get('mode');
  if (mode !== 'demo' && mode !== 'live') throw new ServiceError('请选择演示或实时模式', 400);
  return mode;
}
function param(url: URL, key: string) {
  const value = url.searchParams.get(key)?.trim();
  if (!value || value.length > 120) throw new ServiceError(`缺少或无效参数：${key}`, 400);
  return value;
}
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const server = createServer(async (req, res) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    if (!allowedHosts.has(req.headers.host ?? '')) throw new ServiceError('仅允许本机访问', 403);
    const origin = req.headers.origin;
    if (origin && ![...allowedHosts].some(host => origin === `http://${host}`)) throw new ServiceError('拒绝跨站请求', 403);
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) {
      if (Date.now() - windowStart > 60000) { windowStart = Date.now(); requestCount = 0; }
      if (++requestCount > 120) throw new ServiceError('本机请求过于频繁，请稍后重试', 429);
      if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, config());
      if (req.method === 'POST' && url.pathname === '/api/stores') return json(res, 200, await stores(await body(req)));
      if (req.method === 'GET' && url.pathname === '/api/menu') return json(res, 200, await menu(modeParam(url), param(url, 'storeId')));
      if (req.method === 'GET' && url.pathname === '/api/detail') return json(res, 200, await detail(modeParam(url), param(url, 'storeId'), param(url, 'code')));
      if (req.method === 'POST' && url.pathname === '/api/compare') {
        if (comparingBusy) throw new ServiceError('已有餐单核价任务进行中，请等待完成', 409);
        const input = await body(req);
        comparingBusy = true;
        try { return json(res, 200, await compare(input)); } finally { comparingBusy = false; }
      }
      if (req.method === 'POST' && url.pathname === '/api/quote') return json(res, 200, await quote(await body(req)));
      return json(res, 404, { error: '接口不存在' });
    }
    if (/\/(?:\.env[^/]*|server|scripts|tests)(?:\/|$)/.test(decodeURIComponent(url.pathname))) throw new ServiceError('文件不可访问', 403);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new ServiceError('请求方式不支持', 405);
    if (vite) return vite.middlewares(req, res, () => json(res, 404, { error: '页面不存在' }));
    const root = resolve('dist');
    let path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + sep)) throw new ServiceError('文件不可访问', 403);
    try { if (!(await stat(path)).isFile()) path = resolve(root, 'index.html'); }
    catch { if (extname(path)) throw new ServiceError('文件不存在', 404); path = resolve(root, 'index.html'); }
    const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(path));
  } catch (error) {
    if (error instanceof ZodError) return json(res, 400, { error: error.issues[0]?.message ?? '输入参数不完整' });
    if (error instanceof ServiceError) return json(res, error.status, { error: error.message });
    json(res, 500, { error: '本次请求未能完成，请稍后重试' });
  }
});
server.requestTimeout = 120000;
server.headersTimeout = 10000;
server.listen(port, '127.0.0.1', () => console.log(`麦麦平行餐桌 http://127.0.0.1:${port} · ${config().liveAvailable ? '实时模式可用' : '门店快照演示可用，配置 Token 后可实时查询'}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
async function shutdown() { await vite?.close(); await closeMcd(); server.close(); }
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
