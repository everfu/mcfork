export const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
export async function api<T>(path: string, data?: unknown, options: { signal?: AbortSignal; selectionToken?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (options.selectionToken) headers['X-Store-Selection'] = options.selectionToken;
  const signal = AbortSignal.any([AbortSignal.timeout(55000), ...(options.signal ? [options.signal] : [])]);
  let response: Response;
  try { response = await fetch(`${apiBase}${path}`, { signal, credentials: 'omit', cache: 'no-store', redirect: 'error', method: data === undefined ? 'GET' : 'POST', headers, body: data === undefined ? undefined : JSON.stringify(data) }); }
  catch (error) {
    if (options.signal?.aborted) throw error;
    throw Object.assign(new Error('连接实时服务失败或请求超时，请稍后重试'), { status: 503 });
  }
  let body;
  try { body = await response.json(); }
  catch { throw Object.assign(new Error(response.status === 429 ? '请求过于频繁，请稍后重试' : '服务暂不可用或响应超时，请稍后重试'), { status: response.ok ? 502 : response.status }); }
  if (!response.ok) throw Object.assign(new Error(body.error ?? '请求未能完成，请重试'), { status: response.status });
  return body;
}
