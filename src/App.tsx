import { Button, Input } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import type { AppConfig, CartItem, Comparison, Meal, MenuResponse, Mode, QuoteRequest, Store, StoresResponse, Variant } from '../shared/types.ts';
import { receiptText, yuan } from '../shared/types.ts';
import { quoteSchema } from '../shared/validation.ts';
import { compareMeal } from '../shared/engine.ts';
import { demoMeals, demoQuote, demoStores, initialCart, snapshotAt } from '../shared/demo.ts';
import { api } from './api.ts';
import { Dialog, FoodImage, MenuPicker, StorePicker } from './Dialogs.tsx';
import { Icon } from './icons.tsx';

export function App() {
  const [mode, setMode] = useState<Mode>('demo'), [config, setConfig] = useState<AppConfig>({ liveAvailable: false });
  const [store, setStore] = useState<Store | undefined>(demoStores[0]), [meals, setMeals] = useState<Meal[]>(demoMeals), [cart, setCart] = useState<CartItem[]>(() => initialCart(demoMeals));
  const [budget, setBudget] = useState('48'), [comparison, setComparison] = useState<Comparison>(), [selected, setSelected] = useState('original');
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [toast, setToast] = useState(''), [exporting, setExporting] = useState(false);
  const [dialog, setDialog] = useState<'stores' | 'menu' | 'help' | 'setup' | undefined>();
  const generation = useRef(0), initialized = useRef(false);
  const active = comparison ? [comparison.original, ...comparison.alternatives].find(variant => variant.id === selected) ?? comparison.original : undefined;
  const byCode = new Map(meals.map(meal => [meal.code, meal]));
  useEffect(() => {
    if (initialized.current) return; initialized.current = true;
    if (['127.0.0.1', 'localhost'].includes(location.hostname)) {
      api<AppConfig>('/api/config').then(config => { setConfig(config); if (config.liveAvailable) void activate('live'); else void computeDemo(); }).catch(() => { void computeDemo(); });
    } else void computeDemo();
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  async function computeDemo() {
    const request: QuoteRequest = { mode: 'demo', storeId: demoStores[0].id, budgetCents: 4800, items: initialCart(demoMeals) };
    const result = await compareMeal(request, demoMeals, async request => demoQuote(request));
    setComparison(result); setSelected(result.alternatives[0]?.id ?? 'original');
  }
  async function loadStore(next: Store, nextMode: Mode) {
    const id = ++generation.current;
    setBusy('store'); setError(''); setComparison(undefined); setCart([]); setMeals([]); setStore(next); setMode(nextMode); setDialog(undefined);
    try {
      const response = nextMode === 'demo' ? { meals: demoMeals } : await api<MenuResponse>(`/api/menu?${new URLSearchParams({ mode: nextMode, storeId: next.id })}`);
      if (id !== generation.current) return;
      setMeals(response.meals); setCart(initialCart(response.meals)); setSelected('original');
    } catch (error) { if (id === generation.current) setError((error as Error).message); }
    finally { if (id === generation.current) setBusy(''); }
  }
  async function activate(next: Mode) {
    if (next === 'demo') { await loadStore(demoStores[0], 'demo'); return; }
    const id = ++generation.current;
    setMode('live'); setStore(undefined); setCart([]); setMeals([]); setComparison(undefined); setBusy('store'); setError('');
    try {
      const response = await api<StoresResponse>('/api/stores', { mode: 'live', city: '杭州', keyword: '武林广场' });
      if (id !== generation.current) return;
      const first = response.stores.find(store => !store.suspended);
      if (!first) { setBusy(''); setDialog('stores'); return; }
      await loadStore(first, 'live');
    } catch (error) { if (id === generation.current) { setError((error as Error).message); setBusy(''); } }
  }
  function editCart(items: CartItem[]) { generation.current++; setCart(items); setComparison(undefined); setSelected('original'); setError(''); }
  async function runCompare() {
    if (!store) { setDialog('stores'); return; }
    const parsed = quoteSchema.safeParse({ mode, storeId: store.id, budgetCents: Math.round(Number(budget) * 100), items: cart });
    if (!parsed.success) { setError(cart.length ? '请检查预算和餐品数量，预算需在 1–1000 元之间。' : '先选几样想吃的，再开始比较。'); return; }
    const id = ++generation.current;
    setBusy('compare'); setError(''); setComparison(undefined);
    try {
      const result = mode === 'demo' ? await compareMeal(parsed.data, meals, async request => demoQuote(request)) : await api<Comparison>('/api/compare', parsed.data);
      if (id !== generation.current) return;
      setComparison(result); setSelected(result.alternatives[0]?.id ?? 'original');
      setToast(result.alternatives.length ? `比较完成，找到 ${result.alternatives.length} 份预算内的替代餐单。` : '本轮比较已完成，请查看结果说明。');
    } catch (error) { if (id === generation.current) setError(`${(error as Error).message}。本次未生成已核验方案。`); }
    finally { if (id === generation.current) setBusy(''); }
  }
  async function exportCard() {
    if (!store || !comparison || !active) return;
    setExporting(true);
    try { const { downloadReceipt } = await import('./export.ts'); await downloadReceipt(store, comparison, active); setToast('对比小票已下载。'); }
    catch (error) { setToast((error as Error).message); }
    finally { setExporting(false); }
  }
  async function copy() {
    if (!store || !comparison || !active) return;
    try { await navigator.clipboard.writeText(receiptText(store, comparison, active)); setToast('对比小票文案已复制。'); }
    catch { setToast('复制未成功，请展开小票文案手动复制。'); }
  }
  const savings = active && comparison ? comparison.original.quote.priceCents - active.quote.priceCents : 0;
  return <>
    <header className="site-header"><a className="brand" href="#" onClick={event => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>麦麦平行餐桌 <span>McFork</span></a><nav aria-label="主导航"><a className="current" href="#lab">餐单实验室</a><Button onPress={() => setDialog('help')}>使用说明</Button><a href="https://github.com/M-China/mcd-developer-innovation-challenge" target="_blank" rel="noreferrer">参赛活动 <Icon name="external" size={13} /></a></nav><Button className={`source-toggle ${mode}`} isDisabled={!!busy} onPress={() => mode === 'live' ? void activate('demo') : config.liveAvailable ? void activate('live') : setDialog('setup')}>{mode === 'live' ? <><span className="live-dot" />官方实时</> : '演示试算'}</Button></header>
    <main id="lab" className="workspace">
      <div className="intro"><h1>喜欢的那一口，不用让。</h1><p>锁住你的最爱，看看这顿饭还能怎么点。</p></div>
      <section className="toolbar" aria-label="餐单设置"><StorePicker key={mode} mode={mode} open={dialog === 'stores'} disabled={!!busy} store={store} onOpen={() => setDialog('stores')} onChoose={value => void loadStore(value, mode)} onClose={() => setDialog(undefined)} /><label className="budget-label" htmlFor="budget">预算金额</label><div className="budget-input"><span>¥</span><Input id="budget" type="number" min="1" max="1000" step="0.5" value={budget} disabled={!!busy} onChange={event => { setBudget(event.target.value); setComparison(undefined); setSelected('original'); }} /></div><p className="source-note"><Icon name="info" size={19} /><span>{mode === 'live' ? '真实门店与当前菜单，价格逐单由官方核验。' : '真实门店与菜单快照，试算结果不代表官方报价。'}</span></p></section>
      {store && <p className="store-address"><Icon name="pin" size={13} /><strong>餐单门店 · {store.name.replace(/^麦当劳/, '')}</strong>{store.address}<span>#{store.id}{mode === 'demo' ? ` · ${new Date(snapshotAt).toLocaleDateString('zh-CN')} 采集` : store.opens && store.closes ? ` · 营业参考 ${store.opens}–${store.closes}` : ''}</span></p>}
      {error && <p className="error" role="alert">{error}</p>}
      {busy && <div className="progress" role="status"><span className="spinner" />{busy === 'store' ? '正在读取麦当劳真实门店与当前菜单…' : '正在逐份核验餐单，保留你锁定的每一项。请稍候…'}</div>}
      <div className="lab-grid" aria-busy={!!busy}>
        <section className="original receipt" aria-label="我的原餐单"><div className="receipt-heading"><h2>我的原餐单</h2><Button className="text-button" isDisabled={!!busy || !store || !meals.length} onPress={() => setDialog('menu')}>修改原餐单 <span>›</span></Button></div><div className="food-rows">{cart.map(item => {
          const meal = byCode.get(item.productCode); const quoted = comparison?.original.quote.items.find(line => line.productCode === item.productCode);
          return <article className="food-row" key={item.productCode}><FoodImage meal={meal} /><div className="food-description"><h3>{quoted?.name ?? meal?.name ?? '餐品待查询'}{item.quantity > 1 && <small> ×{item.quantity}</small>}</h3><Button className={`lock-button ${item.locked ? 'locked' : ''}`} aria-pressed={!!item.locked} aria-label={`${item.locked ? '解锁' : '锁定'}${meal?.name}`} isDisabled={!!busy} onPress={() => editCart(cart.map(line => line.productCode === item.productCode ? { ...line, locked: !line.locked } : line))}><Icon name={item.locked ? 'lock' : 'unlock'} size={14} />{item.locked ? '必须保留' : '允许替换'}</Button></div><strong className="line-price">{quoted ? `¥${yuan(quoted.subtotalCents)}` : meal?.priceCents !== undefined ? `¥${yuan(meal.priceCents * item.quantity)}` : '待核价'}</strong></article>;
        })}{!cart.length && <div className="empty-cart"><Icon name="food" size={40} /><p>选几样想吃的，<br />这顿饭从你喜欢的开始。</p><Button className="secondary" isDisabled={!!busy || !meals.length} onPress={() => setDialog('menu')}>选择餐品</Button></div>}</div><div className="receipt-bottom"><div className="total"><span>{comparison ? '合计金额' : '菜单展示价合计'}</span><strong>{cart.length && cart.every(item => byCode.get(item.productCode)?.priceCents !== undefined) ? `¥${yuan(comparison?.original.quote.priceCents ?? cart.reduce((sum, item) => sum + byCode.get(item.productCode)!.priceCents! * item.quantity, 0))}` : '—'}</strong></div><p className="quote-provenance">{comparison ? mode === 'live' ? '官方当次核价' : '快照演示试算' : '展示价仅作参考，点击比较后核价'}</p><Button className="primary compare-button" isDisabled={!!busy || !cart.length || !store} onPress={runCompare}>{busy === 'compare' ? '正在核验…' : comparison ? '重新比较' : '开始比较餐单'}<Icon name="branch" size={18} /></Button></div></section>
        {[0, 1].map(index => {
          const variant = comparison?.alternatives[index];
          return variant ? <VariantCard key={variant.id} variant={variant} original={comparison!.original} meals={meals} selected={selected === variant.id} onSelect={() => setSelected(variant.id)} /> : <section className="receipt empty-variant" key={`empty-${index}`} aria-label={index === 0 ? '少改一项方案' : '多省一点方案'}><div className="receipt-heading"><h2>{index === 0 ? '少改一项' : '多省一点'}</h2><span className="quote-stamp">{mode === 'live' ? '待官方核价' : '演示试算'}</span></div><p className="receipt-subtitle">{index === 0 ? '尽量少换，保留你原来的喜欢。' : '允许多换一项，试试还能省多少。'}</p><div className="variant-placeholder"><Icon name={index === 0 ? 'branch' : 'food'} size={43} /><h3>{comparison ? index === 0 ? '这次还没有合适的替代餐单' : '本轮没有第二份更省的方案' : '等你开启这一餐的另一种可能'}</h3><p>{comparison ? index === 0 ? comparison.notice : '只展示经过核验且更便宜的结果，不凑方案。' : '先选餐、锁定最爱，再点击「开始比较餐单」。'}</p></div></section>;
        })}
        <aside className="difference-panel" aria-label="这次改了什么"><h2>这次改了什么</h2>{active && comparison ? <><div className="diff-box"><p className="diff-caption">本方案与原餐单的差异</p>{active.changes.length ? active.changes.map(change => <div className="diff-item" key={change.from.code}><FoodImage meal={change.from} small /><div><strong>{change.from.name}<span className="diff-arrow">→</span>{change.to.name}</strong><p>数量保持 ×{change.quantity}</p></div></div>) : <p className="no-changes">当前选择原餐单，还没有改动。</p>}{active.changes.length > 0 && <span className="saving-label">整单节省 ¥{yuan(savings)}</span>}</div><section className="kept-items"><h3>保留的餐品</h3>{comparison.original.items.filter(item => item.locked).map(item => <div key={item.productCode}><FoodImage meal={byCode.get(item.productCode)} small /><p><Icon name="lock" size={13} />{byCode.get(item.productCode)?.name}<span>数量保持 ×{item.quantity}</span></p></div>)}{!comparison.original.items.some(item => item.locked) && <p className="muted">没有锁定项，所有同类餐品都可以比较替换。</p>}</section><div className="export-area"><p>报价仅对应本店当次查询。<br />{mode === 'demo' ? '当前为快照演示，非官方核价。' : '价格及供应以官方实时结果为准。'}</p><Button className="primary" onPress={exportCard} isDisabled={exporting}><Icon name="file" />{exporting ? '正在导出…' : '导出对比小票'}</Button><Button className="copy-button" onPress={copy}><Icon name="copy" size={15} />复制小票文案</Button><details className="receipt-copy"><summary>查看文案</summary><pre>{store && receiptText(store, comparison, active)}</pre></details></div></> : <div className="diff-empty"><Icon name="file" size={33} /><p>每一项替换、每一次价格变化，都会在这里看清楚。</p><Button className="secondary" isDisabled>导出对比小票</Button></div>}</aside>
      </div>
      <section className="history" aria-label="本轮对比"><h2>本轮对比</h2><div className="history-nodes"><span className="history-dot" /><Button aria-pressed={selected === 'original'} onPress={() => setSelected('original')} isDisabled={!comparison}><strong>原餐单</strong><span>{comparison ? `¥${yuan(comparison.original.quote.priceCents)}` : '待核价'}</span></Button>{comparison?.alternatives.map(variant => <div className="history-branch" key={variant.id}><span className="history-line">→</span><Button aria-pressed={selected === variant.id} onPress={() => setSelected(variant.id)}><strong>{variant.title}</strong><span>¥{yuan(variant.quote.priceCents)}</span></Button></div>)}</div><Button className="text-button history-reset" isDisabled={!comparison} onPress={() => setSelected('original')}>← 返回原餐单</Button><Button className="text-button" isDisabled={!!busy || !cart.length} onPress={runCompare}><Icon name="refresh" size={17} />重新比较</Button></section>
      <div className="bottom-note"><p><Icon name="info" size={17} /><span>{comparison ? `本轮尝试 ${comparison.checkedCount} 份餐单 · ${new Date(comparison.queriedAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}${comparison.failedCount ? `，${comparison.failedCount} 份未通过核验` : ''}。` : ''}预算无法满足时会明确提示，始终保留你锁定的餐品。</span></p><span>独立参赛作品，非麦当劳官方产品。</span></div>
    </main>
    {toast && <div className="toast" role="status"><Icon name="check" size={18} />{toast}</div>}
    {dialog === 'menu' && store && <MenuPicker mode={mode} store={store} meals={meals} cart={cart} onChange={editCart} onClose={() => setDialog(undefined)} />}
    {dialog === 'help' && <Dialog title="把每一种可能，都算明白。" onClose={() => setDialog(undefined)}><div className="help-body"><ol><li>选择城市和商圈，自动加载真实门店，再选择一家。</li><li>选好原餐单，锁定不愿替换的餐品。</li><li>填写预算，比较少改一点和多省一点的方案。</li><li>选一份喜欢的，下载或复制对比小票。</li></ol><p>仅在同类餐品之间替换，每项数量保持不变；首版只尝试单项及双项替换，最多核价十二份餐单，不承诺全菜单最优。</p><p>实时模式调用官方接口核价；演示模式使用真实门店与菜单快照，在本地试算。所有功能都不会创建订单、领券、兑换或扣款。</p><Button className="primary" onPress={() => setDialog(undefined)}>开始这一餐</Button></div></Dialog>}
    {dialog === 'setup' && <Dialog title="只用一个麦当劳 Token。" onClose={() => setDialog(undefined)}><div className="help-body"><p>公开网页可以直接体验演示。要查询真实门店、菜单与官方价格，请在自己电脑上运行项目。</p><ol><li>复制 <code>.env.example</code> 为 <code>.env.local</code>。</li><li>仅填写 <code>MCD_MCP_TOKEN</code>。</li><li>启动本地服务，刷新页面即可进入实时模式。</li></ol><p>不需要地图 Key 或额外 AI API Key。请勿把真实 Token 填入公开页面、截图或仓库。</p><Button className="primary" onPress={() => setDialog(undefined)}>继续体验演示</Button></div></Dialog>}
  </>;
}
function VariantCard({ variant, original, meals, selected, onSelect }: { variant: Variant; original: Variant; meals: Meal[]; selected: boolean; onSelect: () => void }) {
  const byCode = new Map(meals.map(meal => [meal.code, meal]));
  const savings = original.quote.priceCents - variant.quote.priceCents;
  return <section className={`receipt variant ${selected ? 'adopted' : ''}`} aria-label={`${variant.title}方案`}><div className="receipt-heading"><h2>{variant.title}</h2><span className="quote-stamp">{variant.quote.verified ? '官方核价' : '演示试算'}<Icon name="info" size={15} /></span></div><p className="receipt-subtitle">{variant.changes.length === 1 ? '只换一项' : `替换 ${variant.changes.length} 项`} · 锁定餐品与数量均保留</p><div className="food-rows">{variant.items.map(item => {
    const meal = byCode.get(item.productCode), change = variant.changes.find(change => change.to.code === item.productCode);
    const line = variant.quote.items.find(line => line.productCode === item.productCode)!;
    return <article className={`food-row ${change ? 'changed' : ''}`} key={item.productCode}><FoodImage meal={meal} /><div className="food-description">{change && <span className="old-name">{change.from.name}</span>}<h3>{line.name}{item.quantity > 1 && <small> ×{item.quantity}</small>}</h3>{item.locked && <span className="locked-note"><Icon name="lock" size={13} />必须保留</span>}</div><strong className="line-price">¥{yuan(line.subtotalCents)}</strong></article>;
  })}</div><div className="receipt-bottom"><div className="total"><span>合计金额</span><strong>¥{yuan(variant.quote.priceCents)}</strong></div><div className="savings">比原餐单节省 <strong>¥{yuan(savings)}</strong><i />{variant.changes.length} 项改动</div><Button className={selected ? 'primary' : 'secondary'} aria-pressed={selected} onPress={onSelect}>{selected ? <><Icon name="check" size={17} />已采用这份</> : '采用这份'}</Button></div></section>;
}
