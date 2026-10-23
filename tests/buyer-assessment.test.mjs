import test from 'node:test';
import assert from 'node:assert/strict';
import {observeBuyerRequest,validateBuyerReview,assessBuyerReview,reviewFields} from '../server/buyer-assessment.js';
const offer={exactTerms:['C300'],fields:{product:'Mercedes C300',location:'Lagos',year:'2026',price:'NGN 42 million'}};
const positive={actorRole:'buyer',...Object.fromEntries(reviewFields.map(key=>[key,'yes']))};
test('Original text observations require request language near the exact product and preserve unknown facts',()=>{
  const observed=observeBuyerRequest('Looking for C300 2026 in Lagos, budget up to NGN 45 million.',offer);
  assert.equal(observed.state,'request_language_found');assert.equal(observed.locationMentioned,true);assert.equal(observed.conflicts.length,0);assert.equal(observed.buyerConfirmed,false);assert.ok(observed.unknown.includes('author_identity'));
  assert.equal(observeBuyerRequest('I am looking for a cook. C300 is a car.',offer).state,'no_local_request');
  assert.equal(observeBuyerRequest('For example, looking for C300 in Lagos.',offer).state,'no_local_request');
  assert.equal(observeBuyerRequest('C300 for sale in Lagos.',offer).state,'seller_language_found');
  assert.equal(observeBuyerRequest('Looking for C300 in Lagos but already bought one.',offer).state,'closure_language_found');
  assert.equal(observeBuyerRequest('I am not looking for C300 in Lagos.',offer).state,'closure_language_found');
  assert.equal(observeBuyerRequest('Looking for a buyer for my C300 in Lagos.',offer).state,'seller_language_found');
});
test('Explicit budget and model year conflicts are captured without inferring wealth or exchange rates',()=>{
  const result=observeBuyerRequest('Looking for C300 2024 in Lagos, budget up to NGN 35m.',offer);
  assert.deepEqual(result.conflicts.map(x=>x.field),['price','year']);
  assert.equal(observeBuyerRequest('Looking for C300 2026 in Lagos with budget USD 35000.',offer).conflicts.length,0);
  assert.equal(observeBuyerRequest('Looking for C300 in Lagos; my budget is flexible.',offer).conflicts.length,0);
  assert.equal(observeBuyerRequest('Looking for C300 in Lagos, budget NGN 35m to 50m.',offer).conflicts.length,0);
  assert.equal(observeBuyerRequest('Looking for C300 in Lagos, budget NGN 35m but flexible.',offer).conflicts.length,0);
  assert.equal(observeBuyerRequest('Looking for C300 in Lagos. A different buyer has budget NGN 35m.',offer).conflicts.length,0);
});
test('Seller answers cannot award an independently verified buyer or ignore source conflicts',()=>{
  assert.throws(()=>validateBuyerReview({...positive,verified:true},'I checked the request and spoken details.'),/every review/);
  assert.throws(()=>validateBuyerReview(positive,'yes'),/20/);
  validateBuyerReview(positive,'I checked the request and spoken details.');
  const result=assessBuyerReview({},positive);
  assert.equal(result.state,'seller_reviewed_match');assert.equal(result.basis,'seller_reported');assert.equal(result.buyerConfirmed,false);
  assert.equal(assessBuyerReview({sourceCheck:{assessment:{state:'request_language_found',conflicts:[{field:'price'}]}}},positive).state,'source_needs_review');
  assert.equal(assessBuyerReview({}, {...positive,productFit:'no'}).state,'seller_marked_unsuitable');
  assert.equal(assessBuyerReview({}, {...positive,reachable:'unknown'}).state,'needs_more_checks');
});
