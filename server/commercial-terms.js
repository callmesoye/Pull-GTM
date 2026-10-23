const units={g:['mass',1,'g'],gram:['mass',1,'g'],grams:['mass',1,'g'],kg:['mass',1000,'kg'],kilogram:['mass',1000,'kg'],kilograms:['mass',1000,'kg'],tonne:['mass',1000000,'tonne'],tonnes:['mass',1000000,'tonne'],
 ml:['volume',1,'ml'],l:['volume',1000,'l'],litre:['volume',1000,'l'],litres:['volume',1000,'l'],liter:['volume',1000,'l'],liters:['volume',1000,'l'],
 piece:['count',1,'piece'],pieces:['count',1,'piece'],unit:['count',1,'piece'],units:['count',1,'piece'],pair:['pairs',1,'pair'],pairs:['pairs',1,'pair'],hour:['time',1,'hour'],hours:['time',1,'hour']};
const number='((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)';
function positive(v){const n=Number(v.replaceAll(',',''));return Number.isFinite(n)&&n>0&&n<=1e12?n:null;}
export function parseTradeQuantity(value){
  const m=String(value||'').normalize('NFKC').trim().toLowerCase().match(new RegExp('^'+number+'\\s+([a-z]+)$'));
  if(!m||!units[m[2]])return null;const amount=positive(m[1]);if(!amount)return null;
  const [dimension,scale,unit]=units[m[2]];if(!Number.isSafeInteger(Math.round(amount*scale*1000)))return null;
  return {amount,unit,dimension,baseAmount:amount*scale,scale};
}
export function parseTradePrice(value){
  const m=String(value||'').normalize('NFKC').trim().match(new RegExp('^(NGN|₦|USD|GBP|£|EUR|€)\\s*'+number+'\\s*(million|thousand|m|k)?(?:\\s*(?:per\\s+|/)\\s*([a-z]+)|\\s+(total))?$','i'));
  if(!m)return null;let amount=positive(m[2]);if(!amount)return null;
  amount*= /^(m|million)$/i.test(m[3])?1e6:/^(k|thousand)$/i.test(m[3])?1000:1;
  if(amount>1e12)return null;
  const unit=m[4]?.toLowerCase(),spec=unit?units[unit]:null;if(unit&&!spec)return null;
  return {currency:{NGN:'NGN','₦':'NGN',USD:'USD',GBP:'GBP','£':'GBP',EUR:'EUR','€':'EUR'}[m[1].toUpperCase()],amount,unit:spec?.[2]||null,dimension:spec?.[0]||null,unitScale:spec?.[1]||null,explicitTotal:Boolean(m[5])};
}
export function compareCommercialTerms(fields,request){
  const available=parseTradeQuantity(fields.quantity),wanted=parseTradeQuantity(request.requirements?.quantity),minimum=parseTradeQuantity(fields.minimum_order),price=parseTradePrice(fields.price),budget=request.budget;
  const compatible=(a,b)=>a&&b&&a.dimension===b.dimension;
  const quantity={field:'quantity',state:compatible(available,wanted)?available.baseAmount<wanted.baseAmount?'conflict':'match':'unknown',basis:compatible(available,wanted)?'explicit_comparable_quantity':'quantity_or_comparable_unit_missing'};
  const minimumOrder={field:'minimum_order',state:compatible(minimum,wanted)?wanted.baseAmount<minimum.baseAmount?'conflict':'match':'unknown',basis:compatible(minimum,wanted)?'explicit_comparable_minimum_order':'minimum_order_or_comparable_unit_missing'};
  let goodsSubtotal=null,basis='budget_or_comparable_price_unknown';
  if(price&&budget&&price.currency===budget.currency&&budget.basis==='total'){
    if(price.unit&&wanted&&price.dimension===wanted.dimension){goodsSubtotal=price.amount*wanted.baseAmount/price.unitScale;basis='explicit_unit_price_times_requested_quantity';}
    else if(!price.unit&&(!available&&!wanted&&!minimum||price.explicitTotal&&compatible(available,wanted)&&available.baseAmount===wanted.baseAmount)){goodsSubtotal=price.amount;basis='stated_asking_price';}
  }
  if(!Number.isFinite(goodsSubtotal)||goodsSubtotal>1e15)goodsSubtotal=null;
  const above=goodsSubtotal!==null&&goodsSubtotal-budget.maxAmount>Number.EPSILON*16*Math.max(1,goodsSubtotal,budget.maxAmount);
  return {quantity,minimumOrder,budget:{field:'budget',state:above?'conflict':'unknown',basis:above?'goods_subtotal_above_stated_total_budget':goodsSubtotal!==null?'goods_subtotal_within_budget_delivery_and_quote_basis_unconfirmed':basis,
    calculation:goodsSubtotal===null?null:{currency:price.currency,goodsSubtotal,basis,includesDelivery:false}},buyerConfirmed:false};
}
