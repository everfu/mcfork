import { yuan } from '../shared/types.ts';
import type { Comparison, Store, Variant } from '../shared/types.ts';
export async function downloadReceipt(store: Store, comparison: Comparison, variant: Variant) {
  await document.fonts.ready;
  const rows = comparison.original.quote.items.length + variant.quote.items.length + variant.changes.length;
  const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = Math.max(1400, 950 + rows * 70);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持图片导出，请复制小票文案');
  const height = canvas.height;
  ctx.fillStyle = '#f6f7f9'; ctx.fillRect(0, 0, 1000, height);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(60, 45, 880, height - 90, 16); ctx.fill();
  ctx.fillStyle = '#ffbc0d'; ctx.fillRect(60, 45, 880, 15);
  let y = 135;
  const line = (text: string, size = 27, weight = 400, color = '#222222', right?: string) => {
    ctx.font = `${weight} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(text, 110, y, right ? 530 : 780);
    if (right) { ctx.textAlign = 'right'; ctx.fillText(right, 890, y, 225); }
    y += size + 23;
  };
  const divider = () => { ctx.strokeStyle = '#dddfe2'; ctx.lineWidth = 2; ctx.setLineDash([7, 7]); ctx.beginPath(); ctx.moveTo(110, y); ctx.lineTo(890, y); ctx.stroke(); ctx.setLineDash([]); y += 45; };
  line('麦麦平行餐桌 McFork', 43, 700); line(store.name, 27, 600); line(store.address, 23, 400, '#727984');
  line(comparison.mode === 'live' ? '官方当次核价' : '演示试算 · 非官方核价', 24, 500, comparison.mode === 'live' ? '#447d53' : '#a26625');
  line(new Date(variant.quote.queriedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }), 22, 400, '#727984');
  divider(); line('我的原餐单', 32, 700);
  for (const item of comparison.original.quote.items) line(`${item.name} ×${item.quantity}`, 26, 400, '#555d65', `¥${yuan(item.subtotalCents)}`);
  line('原餐单合计', 28, 600, '#222222', `¥${yuan(comparison.original.quote.priceCents)}`); divider();
  line(variant.title, 32, 700);
  for (const item of variant.quote.items) line(`${item.name} ×${item.quantity}`, 26, 400, '#222222', `¥${yuan(item.subtotalCents)}`);
  line('合计', 34, 700, '#0d1528', `¥${yuan(variant.quote.priceCents)}`);
  line(`节省 ¥${yuan(comparison.original.quote.priceCents - variant.quote.priceCents)} · ${variant.changes.length} 项改动`, 28, 600, '#22643d');
  if (variant.changes.length) { divider(); for (const change of variant.changes) line(`${change.from.name} → ${change.to.name} ×${change.quantity}`, 23, 400, '#727984'); }
  ctx.textAlign = 'center'; ctx.font = '21px "PingFang SC", sans-serif'; ctx.fillStyle = '#727984';
  ctx.fillText('仅适用于本店当次查询，不保证后续价格及供应。', 500, height - 130);
  ctx.fillText('McFork · 一餐的不同可能', 500, height - 92);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片导出失败')), 'image/png'));
  const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = `麦麦平行餐桌-对比小票${comparison.mode === 'demo' ? '-演示' : ''}.png`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
