import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTradeQuantity,parseTradePrice,compareCommercialTerms} from '../server/commercial-terms.js';
import {qualifyBuyerRequest} from '../server/request-qualification.js';

test('Trade quantities convert explicit compatible units and abstain on unknown packaging or density',()=>{
  assert.equal(parseTradeQuantity('1.5 tonnes').baseAmount,1500000);
  assert.equal(parseTradeQuantity('1,000 kg').baseAmount,1000000);
  assert.equal(parseTradeQuantity('250 ml').dimension,'volume');
  for(const v of ['10 bags','1 carton','1 ram','20kg','-10 kg','1,00 kg','0 kg','2e3 kg','10000000000000 kg','1 kg or 2 kg'])assert.equal(parseTradeQuantity(v),null,v);
  const c=compareCommercialTerms({quantity:'100 kg',minimum_order:'1 kg',price:'NGN 500 per kg'},{requirements:{quantity:'10 litres'},budget:{currency:'NGN',basis:'total',maxAmount:6000}});
  assert.equal(c.quantity.state,'unknown');assert.equal(c.minimumOrder.state,'unknown');assert.equal(c.budget.calculation,null);
});
test('Unit pricing and MOQ expose an uneconomic wholesale match without inventing delivered fit',()=>{
  const request={requirements:{quantity:'20 kg'},budget:{currency:'NGN',basis:'total',maxAmount:9000}};
  const c=compareCommercialTerms({quantity:'0.1 tonnes',minimum_order:'30 kg',price:'NGN 500/kg'},request);
  assert.equal(c.quantity.state,'match');assert.equal(c.minimumOrder.state,'conflict');assert.equal(c.budget.state,'conflict');assert.equal(c.budget.calculation.goodsSubtotal,10000);assert.equal(c.buyerConfirmed,false);
  const within=compareCommercialTerms({quantity:'100 kg',price:'NGN 500 per kg'},{...request,budget:{...request.budget,maxAmount:11000}});
  assert.equal(within.budget.state,'unknown');assert.equal(within.budget.calculation.includesDelivery,false);
  assert.equal(compareCommercialTerms({quantity:'10 kg'},{requirements:{quantity:'10001 g'}}).quantity.state,'conflict');
});
test('Money parsing preserves basis, currency and arithmetic uncertainty',()=>{
  assert.equal(parseTradePrice('₦40 million').amount,40000000);assert.equal(parseTradePrice('USD 2 per litre').unit,'l');
  for(const p of ['$ 200','NGN 5 per bag','NGN 1,00','NGN 10-20','NGN -1','USD 2 each'])assert.equal(parseTradePrice(p),null,p);
  const request={requirements:{quantity:'3 pieces'},budget:{currency:'USD',basis:'total',maxAmount:.3}};
  assert.equal(compareCommercialTerms({price:'USD 0.1/piece'},request).budget.state,'unknown');
  for(const [price,budget] of [['NGN 500',{currency:'NGN',basis:'total',maxAmount:1}],['NGN 500/kg',{currency:'USD',basis:'total',maxAmount:1}],['NGN 500/kg',{currency:'NGN',basis:'per_unit',maxAmount:1}]])assert.equal(compareCommercialTerms({price,quantity:'10 kg'},{requirements:{quantity:'1 kg'},budget}).budget.calculation,null);
  assert.equal(compareCommercialTerms({price:'USD 100 total',quantity:'100 kg'},{requirements:{quantity:'1 kg'},budget:{currency:'USD',basis:'total',maxAmount:80}}).budget.calculation,null);
});
test('Buyer request qualification uses commercial conflicts but never confirms a buyer',()=>{
  const offer={id:'a',version:1,exactTerms:['yam'],fields:{product:'yam',location:'Ojuelegba',quantity:'100 kg',minimum_order:'20 kg',price:'NGN 1000 per kg'}};
  const record={id:'b',revision:1,expires_at:'2027-01-01',payload:{product:'yam',location:'Ojuelegba',status:'open',discoverable:true,requirements:{quantity:'10 kg'},budget:{currency:'NGN',basis:'total',maxAmount:9000}}};
  const result=qualifyBuyerRequest(offer,record,{now:new Date('2026-10-23')});
  assert.equal(result.state,'conflicting_terms');assert.deepEqual(result.conflicts.map(c=>c.field),['budget','minimum_order']);assert.equal(result.buyerConfirmed,false);
  assert.equal(result.checks.filter(c=>c.field==='quantity').length,1);
});
