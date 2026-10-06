(function(root){
'use strict';
const ADD=['sales','qty','ads','adSales','clicks','impressions','refundQty','refund','refundFees','refundOther','promo','reimb','shipRevenue','fees','ship','iceQty','ice','packEst','shipments','grossShipping','shippingDiscount','chargebackPosted','chargebackEstimated','promoFees'];
const total=(items,key)=>items.some(x=>x[key]===null)?null:items.reduce((a,x)=>a+(x[key]||0),0);
const ratio=(a,b,m=1)=>a!==null&&b? a/b*m:null;
const rounded=x=>Math.round((x+Number.EPSILON)*100)/100;
function calculate(model,start,end){
 const a=model.dates.indexOf(start),b=model.dates.indexOf(end);if(a<0||b<a)throw new Error('Choose loaded dates, with the start on or before the end.');
 const days=b-a+1,poolUse={};
 const products=model.products.map(p=>{
  const v={...p,need:p.needDays?p.needDays[b]:p.need};for(const k of ADD)v[k]=total(p.days.slice(a,b+1),k);
  v.price=ratio(v.sales,v.qty);v.storage=p.storageDays?(p.storageDays.slice(a,b+1).every(x=>x===null)?null:rounded(p.storageDays.slice(a,b+1).reduce((s,x)=>s+(x||0),0))):p.storagePerDay===null?null:rounded(p.storagePerDay*days);
  v.fulfill=v.ship===null||v.ice===null?null:v.ship+v.ice;
  v.net=v.ads===null||v.fees===null||v.fulfill===null?null:v.sales+v.shipRevenue+v.ads+v.promo+v.refund+v.refundOther+v.refundFees+v.fees+v.fulfill+v.reimb+(v.storage||0)+(v.promoFees||0);
  v.cogCost=p.cog===null&&v.qty>0?null:(p.cog||0)*v.qty;
  v.profit=v.net===null||v.cogCost===null?null:v.net-v.reimb-v.cogCost;
  if(p.pool&&p.unitsPerPack)poolUse[p.pool]=(poolUse[p.pool]||0)+v.qty*p.unitsPerPack;
  return v;
 });
 function metrics(v){v.unitProfit=ratio(v.profit,v.qty);v.ctr=ratio(v.clicks,v.impressions,100);v.cpc=ratio(v.ads===null?null:Math.abs(v.ads),v.clicks);v.acos=ratio(v.ads===null?null:Math.abs(v.ads),v.adSales,100);v.tacos=ratio(v.ads===null?null:Math.abs(v.ads),v.sales,100);v.velDays=v.pool?(poolUse[v.pool]?v.poolUnits*days/poolUse[v.pool]:null):(v.stock!==null&&v.qty?v.stock*days/v.qty:null);return v;}
 products.forEach(metrics);
 const groups=['pistachio','kataifi','choco'].map(category=>{
  const ps=products.filter(p=>p.category===category),v={sku:category==='choco'?'CHOCO_TOTALS':category.toUpperCase()+'_TOTALS',category,stock:null,bsr:null,cog:null,price:null,need:null,velDays:null};
  for(const k of [...ADD,'net','profit','cogCost','fulfill'])v[k]=total(ps,k);
  v.storage=rounded(ps.reduce((s,p)=>s+(p.storage||0),0));metrics(v);v.velDays=null;return v;
 });
 return{start,end,days,products,groups,accountFees:(model.accountFeesByDay||[]).filter(x=>x.date>=start&&x.date<=end),unallocatedShipping: model.unallocatedShippingByDay.slice(a,b+1).reduce((s,x)=>s+x,0)};
}
const MONEY=new Set([2,3,4,6,7,10,14,17,18,20,21,22,150,152,153,154,155,156,157,158]),PERCENT=new Set([9,11,12]),COUNTS=new Set([5,8,13,15,16,23,151]);
const map={2:'price',3:'cog',4:'unitProfit',5:'bsr',6:'sales',7:'ads',8:'qty',9:'ctr',10:'cpc',11:'acos',12:'tacos',13:'refundQty',14:'refund',15:'velDays',16:'need',17:'promo',18:'reimb',20:'profit',21:'net',22:'fulfill',23:'stock',150:'ship',151:'iceQty',152:'ice',153:'packEst',154:'fees',155:'promoFees',156:'storage',157:'refundFees',158:'shipRevenue'};
function format(value,ci){if(value===null||value===undefined||!Number.isFinite(value)||value===0)return'';if(MONEY.has(ci)){const n=rounded(Math.abs(value));if(!n)return'';return(value<0?'-$':'$')+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}if(PERCENT.has(ci))return rounded(value)===0?'':value.toFixed(2)+'%';if(COUNTS.has(ci)){const n=Math.round(value);return n===0?'':ci===5?n.toLocaleString('de-DE'):String(n);}return String(value);}
function sheet(template,result){
 const data=template.data.map(r=>r.map(c=>({...c}))),lookup=new Map([...result.products,...result.groups].map(p=>[p.sku,p]));
 for(const row of data){if(row[0].v==='IMG')continue;const v=lookup.get(row[1].v);if(!v)continue;
  for(const [ci,key] of Object.entries(map)){const value=Number(ci)===14?v.refund+v.refundOther:v[key];const c=row[ci];c.rawValue=value;c.v=format(value,Number(ci));c.note='';}
  row[3].note=v.cogSource||'Product COG per sold pack.';
  const issues=[];if(v.ads===null)issues.push('Advertising history is unavailable for July 1–2; dependent profit is blank.');if(v.cogCost===null)issues.push('Product COG is unconfirmed.');if(v.ship===null)issues.push('Per-SKU shipping allocation is unconfirmed.');if(v.ice===null)issues.push('Historical ice quantities are unconfirmed.');if(v.fees===null)issues.push('Amazon fees unavailable.');
  const common=`${result.start} to ${result.end}: ${result.days} days. Posted selling fees are used when matched to the exact order/SKU; otherwise current Amazon estimates are used. Known estimated FBA storage deducted once. Insulated pack estimates and unallocated account fees are excluded. ${issues.join(' ')}`;
  for(const ci of [4,20,21,22,150,152,154,157])row[ci].note=common;
  row[155].rawValue=null;row[155].v='';row[155].note='Coupon/deal service fees are shown under the ACCOUNT_FEES row when Amazon provides no exact SKU allocation. They are not customer discounts in PROMO. Blank does not mean zero.';
  row[156].note='July/August: historical monthly FBA storage report estimated charges / days in the month, matched by exact FNSKU. September/October: approved August-cost proxy using October 2 warehouse stock. Prorated over selected days and deducted once; unallocated storage excluded.';
  row[17].note='Product discounts only. Shipping discounts are already deducted in SHIP_REVENUE; coupon/deal service fees are separate.';
  row[158].note=`Net retained shipping: $${v.grossShipping.toFixed(2)} gross − $${v.shippingDiscount.toFixed(2)} shipping discounts + $${v.chargebackPosted.toFixed(2)} posted chargeback + $${v.chargebackEstimated.toFixed(2)} estimated chargeback = $${v.shipRevenue.toFixed(2)}. FBA credits are offset; FBM retained shipping is preserved.`;
  row[153].note='Separate estimate: one $0.62 insulated pack per shipment. Historical rate and quantities unconfirmed. Excluded from profit.';
  row[16].note=v.expiry?`VEL_NEED: ${v.need===null?'unknown':v.need} sale packs per day; expiry ${v.expiry}, cutoff 50 days earlier. Stock source ${v.stockDate}. ${v.pool?'Alternative pack listings share '+v.pool+'; never add their targets.':'Current-stock expiry follows the previously approved lot/date assumption.'}`:'Expiration date is unconfirmed; VEL_NEED is blank.';
  row[15].note='Whole days of stock coverage at the selected-period sales pace. '+(v.pool?'Shared pool consumption includes all mapped pack listings.':'Uses the approved stock snapshot.')+' Blank without sales.';
  row[23].note=v.pool?`Stock snapshot ${v.stockDate}: ${v.poolUnits} inventory units in ${v.pool}; ${v.unitsPerPack} per sale pack. Shared capacities must not be added.`:`Approved stock snapshot ${v.stockDate||'October 2–3, 2026'}; not a historical closing balance.`;
 }
 const accountRow=data.find(r=>r[1].v==='ACCOUNT_FEES');if(accountRow){const fees=result.accountFees.filter(e=>/Coupon|Deal/.test(e.type)),amount=fees.reduce((a,e)=>a+e.amount,0);accountRow[155].rawValue=amount;accountRow[155].v=format(amount,155);accountRow[155].note='Unallocated account-level coupon/deal service fees posted in the selected period. Included here once; excluded from product profit until SKU allocation is confirmed. the ACCOUNT_FEES row shows all dated charges.';}
 return{data};
}
root.MonthAccounting={calculate,sheet,format};
if(typeof module!=='undefined')module.exports=root.MonthAccounting;
})(typeof globalThis!=='undefined'?globalThis:window);
