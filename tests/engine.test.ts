import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateTrials, compareMeal } from '../shared/engine.ts';
import { quoteSchema, searchSchema } from '../shared/validation.ts';
import { mealFamily, receiptText } from '../shared/types.ts';
import type { Meal, QuoteRequest, QuoteResult } from '../shared/types.ts';
import { defaultItem, defaultModification, quoteFromWire, unpackTool, allowedTools } from '../server/mcd.ts';
const meals: Meal[] = [
 {code:'burger',name:'汉堡',category:'主食',family:'main',priceCents:2200},
 {code:'fries',name:'中薯条',category:'小食',family:'side',priceCents:1200},
 {code:'small',name:'小薯条',category:'小食',family:'side',priceCents:800},
 {code:'cola',name:'可乐',category:'饮品',family:'drink',priceCents:1000},
 {code:'tea',name:'红茶',category:'饮品',family:'drink',priceCents:300},
 {code:'milk',name:'牛奶',category:'饮品',family:'drink',priceCents:500},
 {code:'cheap',name:'另一个汉堡',category:'主食',family:'main',priceCents:1000},
];
const request: QuoteRequest = {mode:'demo',storeId:'store',budgetCents:3800,items:[{productCode:'burger',quantity:1,locked:true},{productCode:'fries',quantity:1},{productCode:'cola',quantity:1}]};
function price(input: QuoteRequest): Promise<QuoteResult> {
 const items=input.items.map(item=>({productCode:item.productCode,name:meals.find(m=>m.code===item.productCode)!.name,quantity:item.quantity,subtotalCents:meals.find(m=>m.code===item.productCode)!.priceCents!*item.quantity}));
 const priceCents=items.reduce((sum,item)=>sum+item.subtotalCents,0);
 return Promise.resolve({mode:input.mode,verified:false,priceCents,withinBudget:priceCents<=input.budgetCents,queriedAt:'2026-10-17T00:00:00Z',items});
}
test('minimum changes and lower cost are selected from quoted results',async()=>{
 const result=await compareMeal(request,meals,price);
 assert.equal(result.original.quote.priceCents,4400);
 assert.equal(result.alternatives[0].quote.priceCents,3700);
 assert.equal(result.alternatives[0].changes.length,1);
 assert.equal(result.alternatives[1].quote.priceCents,3300);
 assert.equal(result.alternatives[1].changes.length,2);
});
test('all trials preserve exact locked SKU, quantity, cart line count and category',()=>{
 const input={...request,items:request.items.map(item=>({...item,quantity:2}))};
 for(const trial of candidateTrials(input.items,meals)) {
  assert.deepEqual(trial.items.find(i=>i.productCode==='burger'),{productCode:'burger',quantity:2,locked:true});
  assert.equal(trial.items.length,input.items.length);
  assert.ok(trial.items.every(i=>i.quantity===2));
  for(const change of trial.changes)assert.equal(change.from.family,change.to.family);
 }
});
test('fully locked cart returns original and an explicit explanation',async()=>{
 const result=await compareMeal({...request,items:request.items.map(i=>({...i,locked:true}))},meals,price);
 assert.equal(result.checkedCount,1);assert.equal(result.alternatives.length,0);assert.match(result.notice!,/全部锁定/);
});
test('impossible budget never removes locked food or fabricates an alternative',async()=>{
 const result=await compareMeal({...request,budgetCents:100},meals,price);
 assert.equal(result.alternatives.length,0);assert.equal(result.lowestPriceCents,3300);assert.match(result.notice!,/未找到/);
});
test('at most twelve entire cart quotes are attempted',async()=>{
 const many=Array.from({length:20},(_,i)=>({code:`side${i}`,name:`薯条${i}`,category:'小食',family:'side' as const,priceCents:100+i}));
 let calls=0;
 const result=await compareMeal({...request,items:request.items.map(i=>({...i,locked:false}))},[...meals,...many],async input=>{calls++;return price(input);});
 assert.ok(calls<=12);assert.equal(result.checkedCount,calls);
});
test('only actual quotes determine savings, never menu display prices',async()=>{
 const result=await compareMeal(request,meals,async input=>{
  const result=await price(input); if(input.items.some(i=>i.productCode==='tea'))result.priceCents=9999; return result;
 });
 assert.ok(result.alternatives.every(v=>!v.items.some(i=>i.productCode==='tea')));
});
test('partial failures are excluded and reported',async()=>{
 const result=await compareMeal(request,meals,async input=>{if(input.items.some(i=>i.productCode==='tea'))throw Error('temporarily unavailable');return price(input);});
 assert.ok(result.failedCount>0);assert.ok(result.alternatives.every(v=>!v.items.some(i=>i.productCode==='tea')));
});
test('credential errors and rate limits propagate instead of looking like no results',async()=>{
 for(const status of [401,429])await assert.rejects(compareMeal(request,meals,async()=>{throw Object.assign(Error('upstream unavailable'),{status});}));
});
test('baseline quote failure aborts comparison',async()=>{await assert.rejects(compareMeal(request,meals,async()=>{throw Error('baseline failed');}),/baseline/);});
test('unknown product and empty cart fail at the boundary',async()=>{
 assert.equal(quoteSchema.safeParse({...request,items:[]}).success,false);
 await assert.rejects(compareMeal({...request,items:[{productCode:'missing',quantity:1}]},meals,price),/不在/);
});
test('duplicate SKUs, invalid cents, quantities, modes and extra fields are rejected',()=>{
 for(const input of [{...request,budgetCents:38.1},{...request,budgetCents:-1},{...request,mode:'automatic'},{...request,items:[request.items[0],request.items[0]]},{...request,items:[{productCode:'burger',quantity:0}]},{...request,priceCents:1}])assert.equal(quoteSchema.safeParse(input).success,false);
 assert.equal(searchSchema.safeParse({mode:'live',city:'',keyword:'广场'}).success,false);
});
test('mixed promotional categories do not replace burgers with drinks or combo meals',()=>{
 assert.equal(mealFamily('麦辣鸡腿汉堡'),'main');assert.equal(mealFamily('汉堡开心乐园餐'),undefined);
 assert.equal(mealFamily('鸡肉堡单品精选'),undefined);assert.equal(mealFamily('咖啡阿芙佳朵'),undefined);
 assert.equal(mealFamily('中份薯条'),'side');assert.equal(mealFamily('锡兰红茶'),'drink');
});
test('missing menu prices do not become zero-priced replacements',()=>{
 const menu=meals.map(meal=>meal.code==='tea'?{...meal,priceCents:undefined}:meal);
 assert.ok(candidateTrials(request.items,menu).every(trial=>trial.changes.every(c=>c.to.code!=='tea')));
});
test('same input produces identical trial order',()=>{assert.deepEqual(candidateTrials(request.items,meals),candidateTrials(request.items,meals));});
test('tool envelope rejects prose, errors, absent data and failed business result',()=>{
 for(const result of [{isError:true},{content:[{type:'text',text:'not JSON'}]},{structuredContent:{success:false,data:[]}},{structuredContent:{message:'no data'}}])assert.throws(()=>unpackTool(result));
 assert.deepEqual(unpackTool({content:[{type:'text',text:'{"data":[]}'}]}).data,[]);
});
test('official cents are retained and returned line items must match the request',()=>{
 const body={data:{price:1650,productList:[{productCode:'burger',productName:'汉堡',quantity:1,subtotal:1650}]},traceId:'public-trace'};
 const quoted=quoteFromWire(body,{...request,items:[request.items[0]]});
 assert.equal(quoted.priceCents,1650);assert.equal(quoted.verified,true);
 assert.throws(()=>quoteFromWire({...body,data:{...body.data,price:'16.5'}},request));
 assert.throws(()=>quoteFromWire(body,request));
});
test('default modification includes unselectedKey without losing explicit zero quantity',()=>{
 assert.deepEqual(defaultModification({items:[{minValues:1,maxValues:1,values:[{code:'a',selectedQuantity:1,selectedKey:'yes'},{code:'b',selectedQuantity:0,unselectedKey:'no'}]}]}),{values:[{code:'a',key:'yes',quantity:1},{code:'b',key:'no',quantity:0}]});
});
test('incomplete combo defaults are rejected, valid defaults retain round IDs',()=>{
 assert.throws(()=>defaultItem({code:'combo',rounds:[{id:1,minQuantity:1,choices:[]}]},1));
 assert.deepEqual(defaultItem({code:'combo',rounds:[{id:1,minQuantity:1,maxQuantity:1,choices:[{code:'burger',isDefault:1,quantity:1}]}]},2),{productCode:'combo',quantity:2,roundList:[{round:'1',comboItemList:[{code:'burger',quantity:1}]}]});
});
test('receipt exports only public store, cart and price fields',async()=>{
 const result=await compareMeal(request,meals,price);
 const text=receiptText({id:'store',name:'真实门店',address:'公开地址'},result,result.alternatives[0]);
 assert.match(text,/真实门店/);assert.match(text,/演示试算/);assert.doesNotMatch(text,/traceId|Authorization|Token|MCD_MCP|参赛|比赛|赛事|作品/);
});
test('write tools are absent from the MCP allowlist',()=>{assert.deepEqual([...allowedTools].sort(),['calculate-price','query-meal-detail','query-meals','query-nearby-stores'].sort());});
