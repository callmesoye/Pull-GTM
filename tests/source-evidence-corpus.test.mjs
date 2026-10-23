import test from 'node:test';
import assert from 'node:assert/strict';
import {checkBuyerSource} from '../server/source-check.js';
import {assessBuyerReview,reviewFields} from '../server/buyer-assessment.js';

// Handwritten adversarial regression fixtures. These measure our extraction
// contract on synthetic pages, not buyer precision, recall or finding rate.
const car={exactTerms:['C300'],fields:{product:'Mercedes C300',location:'Lagos',year:'2026',price:'NGN 42 million'}};
const service={exactTerms:['office cleaning'],fields:{product:'Office cleaning',location:'Abuja',price:'NGN 200000'}};
const wholesale={exactTerms:['rice'],fields:{product:'Wholesale rice',location:'Kano',price:'NGN 80000'}};
const cases=[
  ['car request with inline markup',car,'<p>Looking for <strong>C300</strong> 2026 in Lagos, budget NGN 45m.</p>','request_language_found',[]],
  ['different model year and budget',car,'<p>Looking for C300 2024 in Lagos, budget NGN 35m.</p>','request_language_found',['price','year']],
  ['separate cards cannot create a request',car,'<article>Looking for a tablet</article><article>C300 Lagos NGN 35m</article>','no_local_request',[]],
  ['table cells cannot create a request',car,'<table><tr><td>Looking for a tablet</td><td>C300 Lagos</td></tr></table>','no_local_request',[]],
  ['line breaks cannot create a request',car,'<div>Looking for a tablet<br>C300 Lagos</div>','no_local_request',[]],
  ['plain text lines stay separate',car,'Looking for a tablet\nC300 Lagos','no_local_request',[],'text/plain'],
  ['unrelated paragraph budget is not borrowed',car,'<p>Looking for C300 in Lagos</p><p>Budget NGN 20m for another purchase</p>','request_language_found',[]],
  ['multiple buyers require attribution',car,'<article>Looking for C300 in Lagos, budget NGN 35m</article><article>Looking for C300 in Abuja, budget NGN 50m</article>','ambiguous_page',[]],
  ['separate seller post does not identify the buyer',car,'<p>Looking for C300 in Lagos</p><p>C300 for sale in Abuja</p>','ambiguous_page',[]],
  ['separate closure does not identify the open request',car,'<p>Looking for C300 in Lagos</p><p>C300 request closed</p>','ambiguous_page',[]],
  ['known closed request',car,'<p>Looking for C300 in Lagos but already bought one.</p>','closure_language_found',[]],
  ['negative buying statement',car,"<p>I don't want to buy C300 in Lagos.</p>",'closure_language_found',[]],
  ['currently not looking',car,'<p>Not currently looking for C300 in Lagos.</p>','closure_language_found',[]],
  ['seller asking for a buyer',car,'<p>Looking for a buyer for my C300 in Lagos.</p>','seller_language_found',[]],
  ['example is not demand',car,'<p>Sample request: looking for C300 in Lagos.</p>','no_local_request',[]],
  ['exact product boundaries',car,'<p>Looking for C3000 in Lagos.</p>','no_local_request',[]],
  ['scripts and templates do not create requests',car,'<script>Looking for C300 Lagos</script><template>Looking for C300 Lagos</template><p>Cars guide</p>','no_local_request',[]],
  ['bare dollar is ambiguous', {...car,fields:{...car.fields,price:'USD 50000'}},'<p>Looking for C300 in Lagos, budget $35000.</p>','request_language_found',[]],
  ['same explicit USD currency', {...car,fields:{...car.fields,price:'USD 50000'}},'<p>Looking for C300 in Lagos, budget USD 35000.</p>','request_language_found',['price']],
  ['malformed number stays unresolved',car,'<p>Looking for C300 in Lagos, budget NGN 35,00.</p>','request_language_found',[]],
  ['minimum budget is not a ceiling',car,'<p>Looking for C300 in Lagos, budget NGN 35m minimum.</p>','request_language_found',[]],
  ['budget range is not a ceiling',car,'<p>Looking for C300 in Lagos, budget NGN 35m to 50m.</p>','request_language_found',[]],
  ['service request',service,'<p>Seeking a supplier for office cleaning in Abuja, budget NGN 250000.</p>','request_language_found',[]],
  ['service budget conflict',service,'<p>Request for quotation for office cleaning in Abuja, budget NGN 150000.</p>','request_language_found',['price']],
  ['wholesale request',wholesale,'<p>Want to buy rice in Kano, budget NGN 90000.</p>','request_language_found',[]],
  ['wholesale selling listing',wholesale,'<p>We sell rice in Kano.</p>','seller_language_found',[]],
  ['unsupported language stays unresolved',car,'<p>Je cherche une C300 à Lagos.</p>','no_local_request',[]],
  ['missing exact terms cannot match everything',{exactTerms:[],fields:{}},'<p>Looking for something.</p>','no_local_request',[]]
];
const positive={actorRole:'buyer',...Object.fromEntries(reviewFields.map(key=>[key,'yes']))};
for(const [name,offer,html,expected,fields,type='text/html'] of cases)test('Evidence corpus: '+name,async()=>{
  const url='https://requests.example/fixture';
  const source=await checkBuyerSource({source_url:url},offer,{hosts:['requests.example'],reader:async()=>({html,type,url})});
  assert.equal(source.originalChecked,true);
  assert.equal(source.assessment.state,expected);
  assert.deepEqual(source.assessment.conflicts.map(c=>c.field),fields);
  assert.equal(source.assessment.attribution,'unverified');
  assert.equal(source.assessment.buyerConfirmed,false);
  const reviewed=assessBuyerReview({sourceCheck:source},positive);
  assert.equal(reviewed.buyerConfirmed,false);
  if(expected==='ambiguous_page'){
    assert.equal(source.assessment.requestQuote,null);
    assert.equal(reviewed.state,'source_needs_review');
  }
});
