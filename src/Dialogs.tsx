import { Button, Input, Label, ListBox, Modal, Select, Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CartItem, Meal, MealDetail, Mode, Store, StoresResponse } from '../shared/types.ts';
import { yuan } from '../shared/types.ts';
import { demoStores, snapshotAt } from '../shared/demo.ts';
import { api } from './api.ts';
import { cityNames, loadDistricts } from '../shared/locations.ts';
import { Icon } from './icons.tsx';
export function Dialog({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  return <Modal.Backdrop isOpen onOpenChange={open => { if (!open) onClose(); }} variant="opaque" className="app-backdrop"><Modal.Container placement="center" size="lg" className="dialog-container"><Modal.Dialog className={`dialog ${className}`} aria-label={title}><Modal.Header className="dialog-header"><Modal.Heading>{title}</Modal.Heading><Button variant="tertiary" isIconOnly className="icon-button" onPress={onClose} aria-label="关闭窗口"><Icon name="close" /></Button></Modal.Header>{children}</Modal.Dialog></Modal.Container></Modal.Backdrop>;
}
export function StorePicker({ mode, open, disabled, store, onOpen, onChoose, onClose }: { mode: Mode; open: boolean; disabled: boolean; store?: Store; onOpen: () => void; onChoose: (store: Store) => void; onClose: () => void }) {
  const [city, setCity] = useState('杭州'), [district, setDistrict] = useState('武林广场'), [districts, setDistricts] = useState<string[]>([]);
  const [custom, setCustom] = useState(''), [keyword, setKeyword] = useState('武林广场');
  const [stores, setStores] = useState<Store[]>(mode === 'demo' ? demoStores : []), [loadingAreas, setLoadingAreas] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [searched, setSearched] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoadingAreas(true);
    loadDistricts(city).then(values => { if (active) setDistricts(values); }).catch(() => { if (active) setError('商圈目录加载失败，请重新选择城市。'); }).finally(() => { if (active) setLoadingAreas(false); });
    return () => { active = false; };
  }, [city]);
  const shouldSearch = open || searched;
  useEffect(() => {
    if (!keyword || !shouldSearch) return;
    const controller = new AbortController();
    setBusy(true); setError(''); setStores([]);
    (async () => {
      try {
        const response = mode === 'demo'
          ? { stores: demoStores.filter(value => city === '杭州' && `${value.name}${value.address}武林广场`.includes(keyword)) }
          : await api<StoresResponse>('/api/stores', { mode, city, keyword }, controller.signal);
        if (!controller.signal.aborted) { setStores(response.stores); setSearched(true); }
      } catch (error) { if (!controller.signal.aborted) setError((error as Error).message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    })();
    return () => controller.abort();
  }, [city, keyword, mode, shouldSearch, retry]);
  function changeCity(value: string) {
    if (value === city) return;
    setCity(value); setDistrict(''); setDistricts([]); setCustom(''); setKeyword(''); setStores([]); setBusy(false); setError(''); setSearched(false);
  }
  function changeDistrict(value: string) {
    setDistrict(value); setCustom(''); setKeyword(value === '__custom' ? '' : value); setStores([]); setBusy(false); setError(''); setSearched(value !== '__custom');
  }
  return <div className="location-fields">
    <Select aria-labelledby="mcfork-city-label" className="location-select city-select" value={city} onChange={value => changeCity(String(value))} isDisabled={disabled}>
      <span data-slot="label" id="mcfork-city-label">城市</span><Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
      <Select.Popover className="location-popover"><ListBox>{cityNames.map(name => <ListBox.Item id={name} key={name} textValue={name}><Label>{name}</Label><ListBox.ItemIndicator /></ListBox.Item>)}</ListBox></Select.Popover>
    </Select>
    <Select aria-labelledby="mcfork-district-label" className="location-select district-select" value={district || null} placeholder={loadingAreas ? '正在加载商圈…' : '请选择商圈'} onChange={value => changeDistrict(String(value))} isDisabled={disabled || loadingAreas || !districts.length}>
      <span data-slot="label" id="mcfork-district-label">商圈</span><Select.Trigger><Select.Value /><Select.Indicator>{loadingAreas ? <Spinner size="sm" /> : <Icon name="chevron" size={17} />}</Select.Indicator></Select.Trigger>
      <Select.Popover className="location-popover"><ListBox>{districts.map(name => <ListBox.Item id={name} key={name} textValue={name}><Label>{name}</Label><ListBox.ItemIndicator /></ListBox.Item>)}<ListBox.Item id="__custom" textValue="其他地点"><Label>其他地点…</Label><ListBox.ItemIndicator /></ListBox.Item></ListBox></Select.Popover>
    </Select>
    {district === '__custom' && <form className="custom-location" onSubmit={event => { event.preventDefault(); if (custom.trim()) { setKeyword(custom.trim()); setSearched(true); setRetry(value => value + 1); } }}><Input aria-label="其他地点" placeholder="输入地标或地址" maxLength={80} value={custom} onChange={event => setCustom(event.target.value)} disabled={disabled} /><Button type="submit" variant="secondary" isDisabled={disabled || !custom.trim()}>查询</Button></form>}
    <Button variant="secondary" className="store-selector" isDisabled={disabled || !keyword} onPress={onOpen} aria-label="选择真实门店"><Icon name="pin" size={17} /><span>{busy ? '正在加载门店…' : searched ? `选择门店 · ${stores.length} 家` : '选择真实门店'}</span><Icon name="chevron" size={15} /></Button>
    <p className={`location-feedback ${error ? 'failed' : ''}`} role="status">{error || (loadingAreas ? '正在加载商圈目录…' : !district ? '请选择商圈，自动加载附近真实门店。' : busy ? `正在查询${city} · ${keyword}…` : searched ? mode === 'demo' && !stores.length ? '该地点暂无演示快照，实时模式可查询官方门店。' : `${city} · ${keyword} · 已加载 ${stores.length} 家门店` : store ? '' : '选中商圈后，自动查询真实门店。')}</p>
    {open && <Dialog title="选一家真实门店" onClose={onClose} className="store-dialog"><p className="dialog-intro">{city} · {keyword} · {mode === 'live' ? '门店信息直接来自麦当劳 MCP。到店自取，不创建订单。' : `真实门店快照 · ${new Date(snapshotAt).toLocaleDateString('zh-CN')} 采集，仅提供杭州武林广场样例。`}</p><div className="store-results-heading"><span>{busy ? '正在加载门店' : `找到 ${stores.length} 家门店`}</span><Button variant="tertiary" className="text-button" isDisabled={busy} onPress={() => setRetry(value => value + 1)}><Icon name="refresh" size={15} />重新查询</Button></div>{error && <p className="error" role="alert">{error}</p>}<div className="store-list" aria-live="polite" aria-busy={busy}>{busy ? <div className="empty"><Spinner size="sm" /><p>正在查询官方门店…</p></div> : !stores.length ? <p className="empty">{mode === 'demo' ? '该地点暂无演示快照。选择杭州 · 武林广场，或切换实时模式。' : '暂无门店，请关闭窗口后换个商圈或选择其他地点。'}</p> : stores.map(value => <Button variant="tertiary" className="store-option" key={value.id} isDisabled={value.suspended} onPress={() => onChoose(value)}><span className="store-icon"><Icon name="pin" size={25} /></span><span><strong>{value.name}</strong><span>{value.address}</span><small>门店 #{value.id} · {value.suspended ? '当前暂停营业' : value.opens && value.closes ? `${value.opens}–${value.closes}` : '营业时段待确认'}</small></span><Icon name="arrow" /></Button>)}</div><p className="directory-note">城市与商圈为内置常用目录，门店以官方查询结果为准。</p></Dialog>}
  </div>;
}
export function FoodImage({ meal, small = false }: { meal?: Meal; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [meal?.image]);
  return <div className={`food-image ${small ? 'small' : ''}`}>{meal?.image && !failed ? <img src={meal.image} alt="" loading={small ? 'lazy' : 'eager'} referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <div className="food-fallback"><Icon name="food" size={small ? 22 : 30} /><span>{meal?.family === 'main' ? '主食' : meal?.family === 'side' ? '小食' : meal?.family === 'drink' ? '饮品' : '餐品'}</span></div>}</div>;
}
export function MenuPicker({ mode, store, meals, cart, onChange, onClose }: { mode: Mode; store: Store; meals: Meal[]; cart: CartItem[]; onChange: (items: CartItem[]) => void; onClose: () => void }) {
  const [search, setSearch] = useState(''), [category, setCategory] = useState('全部'), [busy, setBusy] = useState(''), [error, setError] = useState(''), [detail, setDetail] = useState<MealDetail>();
  const details = useRef(new Map<string, MealDetail>());
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  async function inspect(meal: Meal) {
    let value = details.current.get(meal.code);
    if (!value) { value = mode === 'demo' ? { code: meal.code, name: meal.name, configurable: true, supportModify: false, defaults: [], note: '菜单快照，正式搭配以实时查询为准' } : await api<MealDetail>(`/api/detail?${new URLSearchParams({ mode, storeId: store.id, code: meal.code })}`); details.current.set(meal.code, value); }
    return value;
  }
  async function add(meal: Meal) {
    setBusy(meal.code); setError('');
    try {
      const value = await inspect(meal); if (!alive.current) return;
      if (!value.configurable) throw new Error(value.note ?? '默认搭配不完整');
      const item = cart.find(item => item.productCode === meal.code);
      if (item) onChange(cart.map(current => current.productCode === meal.code ? { ...current, quantity: Math.min(20, current.quantity + 1) } : current));
      else if (cart.length < 10) onChange([...cart, { productCode: meal.code, quantity: 1, locked: false }]);
      else throw new Error('首版最多支持十种餐品，请先移除一项');
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(''); }
  }
  const familyNames = { main: '主食', side: '小食', drink: '饮品' };
  return <Dialog title="这一餐，由你来选。" onClose={onClose} className="menu-dialog"><p className="dialog-intro">{store.name} · {mode === 'live' ? '本店当前菜单' : '菜单快照，金额仅作演示试算'}</p><div className="menu-controls"><Input aria-label="搜索餐品" placeholder="搜索想吃的餐品" value={search} onChange={event => setSearch(event.target.value)} /><div className="category-tabs">{['全部', '主食', '小食', '饮品', '其他'].map(name => <Button key={name} aria-pressed={category === name} onPress={() => setCategory(name)}>{name}</Button>)}</div></div>{error && <p className="error" role="alert">{error}</p>}{detail && <div className="meal-detail"><strong>{detail.name}{detail.supportModify ? '【可特调】' : ''}</strong><p>{detail.defaults.join('、') || '单品，使用官方默认配置。'}</p><p>{detail.note ?? '首版仅使用默认搭配；如需特调，请到官方客户端查看或修改。'}</p><Button className="text-button" onPress={() => setDetail(undefined)}>收起详情</Button></div>}<div className="menu-list">{meals.filter(meal => meal.name.includes(search) && (category === '全部' || (meal.family ? familyNames[meal.family] : '其他') === category)).map(meal => {
    const quantity = cart.find(item => item.productCode === meal.code)?.quantity ?? 0;
    return <article className="menu-row" key={meal.code}><FoodImage meal={meal} small /><div className="menu-row-info"><h3>{meal.name}</h3><p>{meal.priceCents === undefined ? '价格待核验' : `¥${yuan(meal.priceCents)}`}<span> · 菜单展示价</span></p><Button className="text-button" isDisabled={!!busy} onPress={async () => { setBusy(meal.code); try { setDetail(await inspect(meal)); } catch (error) { setError((error as Error).message); } finally { setBusy(''); } }}>查看默认搭配</Button></div><div className="quantity"><Button aria-label={`减少${meal.name}`} isDisabled={!quantity || !!busy} onPress={() => onChange(cart.map(item => item.productCode === meal.code ? { ...item, quantity: item.quantity - 1 } : item).filter(item => item.quantity > 0))}><Icon name="minus" size={15} /></Button><output aria-label={`${meal.name}数量`}>{quantity}</output><Button aria-label={`添加${meal.name}`} isDisabled={!!busy || quantity >= 20} onPress={() => add(meal)}><Icon name="plus" size={15} /></Button></div></article>;
  })}</div><footer className="dialog-footer"><span>已选 {cart.reduce((sum, item) => sum + item.quantity, 0)} 份 · 仅比较，不下单</span><Button className="primary" isDisabled={!!busy} onPress={onClose}>选好了，返回比较</Button></footer></Dialog>;
}
