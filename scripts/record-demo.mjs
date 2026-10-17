import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, copyFile, stat } from 'node:fs/promises';
const base = process.env.MCFORK_BASE_URL ?? 'http://127.0.0.1:5175';
await mkdir('/tmp/mcfork-recording', { recursive: true });
await mkdir('docs/media', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1512, height: 1050 }, recordVideo: { dir: '/tmp/mcfork-recording', size: { width: 1512, height: 1050 } } });
const page = await context.newPage();
await page.route('**/api/config', route => route.fulfill({ json: { liveAvailable: false } }));
async function caption(text, seconds) {
  await page.evaluate(text => {
    let caption = document.getElementById('recording-caption');
    if (!caption) {
      caption = document.createElement('div'); caption.id = 'recording-caption';
      Object.assign(caption.style, { position: 'fixed', bottom: '18px', left: '50%', transform: 'translateX(-50%)', maxWidth: '90%', background: '#222b', color: 'white', padding: '13px 24px', borderRadius: '8px', font: '19px "PingFang SC", sans-serif', zIndex: '99999', pointerEvents: 'none', textAlign: 'center' });
      document.body.appendChild(caption);
    }
    caption.textContent = text;
  }, text);
  await page.waitForTimeout(seconds * 1000);
}
try {
  await page.goto(base);
  await page.locator('.variant').first().waitFor();
  await page.waitForFunction(() => Array.from(document.images).every(image => image.complete));
  await caption('喜欢的那一口，不用让。先锁住最爱，再比较每一种可能。', 4);
  await page.locator('.city-select button').click();
  await caption('下拉选择城市，自动加载对应的常用商圈。无需地图 Key。', 3);
  await page.getByRole('option', { name: '杭州', exact: true }).click();
  await page.locator('.district-select button').click();
  await caption('选中商圈即可查询门店，其他地点也可输入地标。', 3);
  await page.getByRole('option', { name: '武林广场', exact: true }).click();
  await page.getByRole('button', { name: '选择真实门店' }).click();
  await caption('真实门店名称与地址来自麦当劳 MCP；本视频使用带采集时间的快照演示。', 3);
  await page.getByRole('dialog').getByRole('button', { name: '关闭窗口' }).click();
  await page.getByRole('button', { name: '解锁麦辣鸡腿汉堡' }).click();
  await page.getByRole('button', { name: '锁定麦辣鸡腿汉堡' }).click();
  await caption('汉堡必须保留，数量也不变。给这一餐设定 48 元预算。', 6);
  await page.getByRole('button', { name: '开始比较餐单' }).click();
  await page.locator('.variant').first().waitFor();
  await caption('少改一项：只换饮品，保留汉堡和小食。实时模式逐单调用官方核价。', 7);
  await page.getByRole('region', { name: '多省一点方案' }).getByRole('button', { name: '采用这份', exact: true }).click();
  await caption('多省一点：再换一份同类小食。每项替换与整单价差，都看得见。', 7);
  await page.getByRole('button', { name: /返回原餐单/ }).click();
  await caption('随时回到原餐单。采用方案只是选择，不会下单或扣款。', 5);
  await page.getByRole('region', { name: '多省一点方案' }).getByRole('button', { name: '采用这份', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出对比小票', exact: true }).click();
  await (await download).saveAs('docs/media/receipt-example.png');
  await caption('一键导出对比小票：原餐单、新餐单、价差与时间，不包含账户凭据。', 7);
  await page.getByRole('button', { name: '演示试算', exact: true }).click();
  await caption('只需要麦当劳 MCP Token。无需地图 Key，也无需额外 AI API Key。', 8);
  await page.getByRole('dialog').getByRole('button', { name: '关闭窗口' }).click();
  await caption('麦麦平行餐桌 McFork · 网页与 Skill 共用同一套比较逻辑。', 4);
  const video = page.video(); assert.ok(video);
  await context.close();
  await copyFile(await video.path(), 'docs/media/demo.webm');
  assert.ok((await stat('docs/media/demo.webm')).size > 10000);
  assert.ok((await stat('docs/media/receipt-example.png')).size > 1000);
  console.log('Recorded public snapshot demo and exported a sample receipt; no account credentials used.');
} finally { await browser.close(); }
