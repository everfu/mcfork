import { createHmac, timingSafeEqual } from 'node:crypto';

const lifetime = 60 * 60000;
function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(`mcfork-store-v1.${payload}`).digest();
}
export function signSelection(storeId: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ storeId, expires: now + lifetime })).toString('base64url');
  return `${payload}.${signature(payload, secret).toString('base64url')}`;
}
export function verifySelection(ticket: string, storeId: string, secret: string, now = Date.now()) {
  if (!secret || ticket.length > 512) return false;
  try {
    const parts = ticket.split('.');
    if (parts.length !== 2) return false;
    const actual = Buffer.from(parts[1], 'base64url'), expected = signature(parts[0], secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    return payload.storeId === storeId && Number.isSafeInteger(payload.expires) && payload.expires > now && payload.expires <= now + lifetime;
  } catch { return false; }
}
