import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfferDraft,confirmOfferDraft,bindResearchPlan,classifyOpportunity} from '../server/v2-handoff.js';
import {createIntelligenceTools} from '../server/intelligence.js';

const offer=()=>{
  const draft=createOfferDraft({ownerId:'seller-1',source:{kind:'image',ref:'asset-1'},sellerInput:{product:'Mercedes C300 2026',location:'Lagos',price:'₦42m'},modelObservations:[{field:'model',value:'C300'},{field:'year',value:'2024'}]});
  return confirmOfferDraft(draft,{ownerId:'seller-1',fields:{product:'Mercedes C300 2026',location:'Lagos',price:'₦42m',year:'2026'},exactTerms:['C300']});
};
const hypothesis=()=>[{buyerType:'People requesting this model',reason:'Current need might be public.',route:'expressed_demand',keywords:['C300'],queries:['C300 wanted Lagos']}];

test('vision observations remain visible but seller confirmation wins the exact offer',()=>{
  const confirmed=offer();
  assert.equal(confirmed.fields.year,'2026');
  assert.ok(confirmed.claims.some(c=>c.origin==='image_observed'&&c.field==='year'&&c.value==='2024'));
  assert.ok(confirmed.claims.some(c=>c.origin==='seller_confirmed'&&c.field==='year'&&c.value==='2026'));
  assert.throws(()=>bindResearchPlan(createOfferDraft({ownerId:'seller-1',source:{kind:'description',ref:'brief-1'},sellerInput:{product:'Car',location:'Lagos'}}),{hypotheses:hypothesis()}),/confirmed/);
});

test('research plan is bound to the confirmed product and location, even if the model proposes others',()=>{
  const confirmed=offer(),plan=bindResearchPlan(confirmed,{hypotheses:hypothesis()});
  assert.equal(plan.offerId,confirmed.id);assert.equal(plan.input.product,'Mercedes C300 2026');assert.equal(plan.input.location,'Lagos');
  assert.deepEqual(plan.input.productTerms,['C300']);
  assert.throws(()=>bindResearchPlan(confirmed,{hypotheses:[{...hypothesis()[0],queries:['C300 wanted Abuja']}]}),/location/);
  assert.throws(()=>confirmOfferDraft(createOfferDraft({ownerId:'seller-1',source:{kind:'page',ref:'page-1'},sellerInput:{product:'Cotton fabric',location:'Abuja'}}),{ownerId:'seller-2',fields:{product:'Cotton fabric',location:'Abuja'}}),/owner/);
  assert.throws(()=>confirmOfferDraft(createOfferDraft({ownerId:'seller-1',source:{kind:'description',ref:'brief-2'},sellerInput:{product:'Website design',location:'Lagos'}}),{ownerId:'seller-1',fields:{product:'Website design',location:'Lagos'},exactTerms:['C300']}),/confirmed offer/);
});

test('an excerpt or mismatched request never becomes a qualified buyer',()=>{
  const candidate={kind:'possible_request'};
  assert.deepEqual(classifyOpportunity(candidate,{}),{tier:'research_lead',reason:'original_source_unchecked'});
  assert.deepEqual(classifyOpportunity(candidate,{originalChecked:true,authorRole:'seller',active:true}),{tier:'excluded',reason:'seller_listing'});
  assert.deepEqual(classifyOpportunity(candidate,{originalChecked:true,authorRole:'buyer',active:true,productFit:false,locationFit:true}),{tier:'excluded',reason:'incompatible'});
  assert.deepEqual(classifyOpportunity(candidate,{originalChecked:true,authorRole:'buyer',active:true,productFit:true,locationFit:true,needConfirmed:true,termsFit:null,contactAllowed:null}),{tier:'verified_request',reason:'further_qualification_needed'});
  assert.deepEqual(classifyOpportunity(candidate,{originalChecked:true,authorRole:'buyer',active:true,productFit:true,locationFit:true,needConfirmed:true,termsFit:true,contactAllowed:true}),{tier:'qualified_opportunity',reason:'need_terms_and_contact_checked'});
});

test('a dealer route stays a route and market context stays context',()=>{
  assert.deepEqual(classifyOpportunity({kind:'buying_route'},{originalChecked:true,businessRole:'intermediary',productFit:true,locationFit:true}),{tier:'buying_route',reason:'intermediary_fit_checked'});
  assert.deepEqual(classifyOpportunity({kind:'market_context'},{originalChecked:true,authorRole:'buyer',active:true,productFit:true,locationFit:true,needConfirmed:true,termsFit:true,contactAllowed:true}),{tier:'market_context',reason:'no_buying_request'});
});

test('service and wholesale offers use the same binding contract',()=>{
  for(const [product,term,location] of [['Brand identity service','Brand identity','Abuja'],['Cotton fabric wholesale','Cotton fabric','Kano']]){
    const draft=createOfferDraft({ownerId:'seller-1',source:{kind:'description',ref:'brief-3'},sellerInput:{product,location}});
    const confirmed=confirmOfferDraft(draft,{ownerId:'seller-1',fields:{product,location},exactTerms:[term]});
    const plan=bindResearchPlan(confirmed,{hypotheses:[{buyerType:'Explicit project request',reason:'Search for an actual requirement.',route:'expressed_demand',keywords:[term],queries:[`${term} request ${location}`]}]});
    assert.equal(plan.input.productTerms[0],term);
  }
});

test('existing buyer research ignores model-swapped offer fields when a confirmed V2 offer is supplied',async()=>{
  const searches=[];
  const tools=createIntelligenceTools({ownerId:'seller-1',confirmedOffer:offer(),allowResearch:true,
    env:{PULL_BUYER_RESEARCH_ENABLED:'true',PULL_SEARCH_PROVIDER:'brave',BRAVE_SEARCH_API_KEY:'fixture',PULL_SEARCH_MAX_QUERIES:'1'},
    db:{rpc:async()=>({data:true})},transport:async url=>{searches.push(new URL(url).searchParams.get('q'));return Response.json({web:{results:[]}});}});
  const result=await tools.discover_buyer_routes({product:'Other car',location:'Abuja',productTerms:['Other'],hypotheses:hypothesis(),limit:5});
  assert.equal(result.input.product,'Mercedes C300 2026');
  assert.equal(result.input.location,'Lagos');
  assert.deepEqual(searches,['C300 wanted Lagos']);
  assert.equal(result.summary.confirmedBuyers,0);
  const other=createIntelligenceTools({ownerId:'seller-2',confirmedOffer:offer(),allowResearch:true,
    env:{PULL_BUYER_RESEARCH_ENABLED:'true',PULL_SEARCH_PROVIDER:'brave',BRAVE_SEARCH_API_KEY:'fixture'},db:{rpc:async()=>({data:true})}});
  await assert.rejects(()=>other.discover_buyer_routes({hypotheses:hypothesis()}),/owner/);
});
