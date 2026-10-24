import test from 'node:test';
import assert from 'node:assert/strict';
import {buyerDiscoveryFeedback} from '../server/buyer-discovery-feedback.js';
import {buyerResearchInput,assessBuyerObservation,compareBuyerSources} from '../server/buyer-research.js';
import {createIntelligenceTools,modelToolResult} from '../server/intelligence.js';
import {readFile} from 'node:fs/promises';

const offer={id:'saved-yam',version:1,status:'confirmed',ownerId:'A',fields:{product:'Fresh yam',location:'Ojuelegba Lagos'},exactTerms:['yam']};
const input=()=>buyerResearchInput({product:'Fresh yam',location:'Ojuelegba Lagos',productTerms:['yam'],limit:5,hypotheses:[{buyerType:'Businesses using yam',reason:'Investigate a consumption requirement.',route:'market_context',keywords:['yam'],queries:['yam stock Ojuelegba Lagos']}]});
test('Empty or supply-only results produce new downstream buying-job research within the original location and allowance',()=>{
  for(const opportunities of [[],[{id:'seller',kind:'market_context',excluded_as_request:'seller_listing'}]]){
    const r=buyerDiscoveryFeedback(offer,{input:input(),opportunities,trace:[],remainingSourceRequests:1});
    assert.equal(r.suggestedQueries.length,1);assert.ok(r.suggestedQueries[0].query.includes('Ojuelegba Lagos'));assert.ok(r.suggestedQueries[0].query.includes('restaurant'));
    assert.equal(r.actions.at(-1).action,'refine_buyer_job_route');assert.equal(r.observed.confirmedBuyers,0);assert.equal(r.executesContact,false);
  }
});
test('An observed request routes to original review while exhausted research routes to permissioned demand capture',()=>{
  const request=buyerDiscoveryFeedback(offer,{input:input(),opportunities:[{id:'r',kind:'possible_request'}],trace:[],remainingSourceRequests:2});
  assert.equal(request.actions[0].action,'check_original_request');assert.deepEqual(request.actions[0].sourceIds,['r']);assert.equal(request.buyerConfirmed,false);
  const exhausted=buyerDiscoveryFeedback(offer,{input:input(),opportunities:[],trace:[],remainingSourceRequests:0});assert.equal(exhausted.suggestedQueries.length,0);assert.equal(exhausted.actions[0].action,'propose_permissioned_demand_capture');assert.ok(exhausted.unexecutedQueries.length);
  const hypothesis=buyerDiscoveryFeedback({...offer,status:undefined,researchScenario:true},{input:input(),opportunities:[],remainingSourceRequests:1});assert.equal(hypothesis.evidenceChain[0].state,'hypothetical_scenario');
});
test('Generic business words cannot stand in for a product or a specific buying role',()=>{
  const b=input(),h={...b.hypotheses[0],keywords:['buyer','request','private company','purchasing manager']};
  assert.equal(assessBuyerObservation({url:'https://example.com/about',title:'Private company',description:'A buyer request from our purchasing manager.'},b,h),null);
  const retained=assessBuyerObservation({url:'https://example.com/menu',title:'Restaurant in Ojuelegba Lagos',description:'A restaurant serving yam dishes.'},b,{...h,keywords:['restaurant']});assert.equal(retained.kind,'market_context');
});
test('Retail now-in-stock advertising found in live S140 research cannot become a buying request',()=>{
  const b=buyerResearchInput({product:'Blackout curtains',location:'Kisumu Kenya',productTerms:['Blackout curtains'],limit:5,hypotheses:[{buyerType:'Small cinema',reason:'Investigate blackout needs.',route:'expressed_demand',keywords:['curtains'],queries:['Blackout curtains Kisumu Kenya']}]});
  const r=assessBuyerObservation({url:'https://example.com/retail',title:'Blackout curtains in Kisumu',description:'Now in stock. Looking for blackout curtains? We deliver. Place your order.'},b,b.hypotheses[0]);
  assert.equal(r.kind,'market_context');assert.equal(r.excluded_as_request,'seller_listing');assert.equal(r.need_status,'unconfirmed');
});
test('A relevant business route ranks above a supply advertisement within the same evidence tier',()=>{
  const rows=[{title:'A retail offer',kind:'market_context',location_status:'source-asserted',excluded_as_request:'seller_listing'},{title:'Z restaurant',kind:'market_context',location_status:'source-asserted',excluded_as_request:null}];
  rows.sort(compareBuyerSources);assert.equal(rows[0].title,'Z restaurant');
});
test('The production research tool can move from stock advertising to a downstream business through one bounded refinement',async()=>{
  let calls=0;
  const tools=createIntelligenceTools({ownerId:'A',confirmedOffer:offer,allowResearch:true,env:{PULL_BUYER_RESEARCH_ENABLED:'true',PULL_SEARCH_PROVIDER:'brave',BRAVE_SEARCH_API_KEY:'fixture',PULL_SEARCH_MAX_QUERIES:'2'},db:{rpc:async()=>({data:true})},transport:async()=>{
    calls++;return Response.json({web:{results:calls===1?[{title:'Yam stock Ojuelegba Lagos',url:'https://example.com/stock',description:'Yam now in stock. Place your order.'}]:[{title:'Restaurant listing Ojuelegba Lagos',url:'https://chowdeck.com/store/surulere/restaurants/my-village-kitchen-yaba',description:'Restaurant listing for local dishes in Ojuelegba Lagos. Current purchasing requirements are not established.'}]}});
  }});
  const raw=input();raw.hypotheses=raw.hypotheses.map(({id,...h})=>h);
  const first=await tools.discover_buyer_routes(raw);assert.equal(first.remainingSourceRequests,1);assert.equal(first.discoveryFeedback.diagnosis,'supply_results_need_downstream_search');
  const query=first.discoveryFeedback.suggestedQueries[0].query;
  const second=await tools.refine_buyer_routes({hypotheses:[{buyerType:'Restaurant use',reason:'The first result advertises stock; investigate downstream restaurants.',route:'market_context',keywords:['restaurant'],queries:[query]}]});
  assert.equal(calls,2);assert.equal(second.requestsUsed,2);assert.equal(second.remainingSourceRequests,0);assert.ok(second.opportunities.some(s=>s.source_url.includes('chowdeck.com')));assert.equal(second.opportunities[0].source_url.includes('chowdeck.com'),true);
  assert.equal(second.summary.confirmedBuyers,0);assert.ok(modelToolResult(second).discoveryFeedback);assert.equal(second.input.location,offer.fields.location);
});
test('The live corpus contains an attributable investigation for every scenario and exposes unknown buyer outcomes',async()=>{
  const root=new URL('../research/scenario-lab/live-2026-10-24/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
  const cases=(await readFile(new URL('cases.jsonl',root),'utf8')).trim().split('\n').map(JSON.parse);
  const sources=(await readFile(new URL('sources.jsonl',root),'utf8')).trim().split('\n').map(JSON.parse),byId=new Map(sources.map(s=>[s.id,s]));
  assert.equal(cases.length,520);assert.equal(new Set(cases.map(c=>c.caseId)).size,520);assert.equal(manifest.summary.executedSearches,656);
  for(const c of cases){assert.ok(c.query.includes(c.location),c.caseId);assert.equal(c.buyerFindingOutcome,null);assert.equal(c.independentlyRelevant,null);assert.ok(c.sourceObservations.every(s=>byId.has(s.sourceId)));if(c.adaptive)assert.ok(c.adaptive.query.includes(c.location));}
  for(const s of sources){assert.ok((s.title+' '+s.excerpt).trim().split(/\s+/).length<=24);assert.equal(s.buyerConfirmed,false);assert.equal(s.requestDate,null);}
  assert.equal(manifest.summary.buyerFindingRate,null);
});

test('Low-evidence initial results reserve an original-page check for the refined business route',async()=>{
  let calls=0;const opened=[];
  const hypothesis=(query,keyword)=>({buyerType:'Restaurant purchasing route',reason:'Investigate downstream use.',route:'market_context',keywords:[keyword],queries:[query]});
  const tools=createIntelligenceTools({ownerId:'A',confirmedOffer:offer,allowResearch:true,env:{PULL_BUYER_RESEARCH_ENABLED:'true',PULL_SEARCH_PROVIDER:'brave',BRAVE_SEARCH_API_KEY:'fixture',PULL_SEARCH_MAX_QUERIES:'2',PULL_SOURCE_CHECK_ENABLED:'true',PULL_SOURCE_CHECK_HOSTS:'supply.example,business.example'},db:{rpc:async()=>({data:true})},
    sourceReader:async url=>{opened.push(url);return {url,type:'text/html',html:'<p>A published business page. No current buying request established.</p>'};},
    transport:async()=>{calls++;return Response.json({web:{results:calls===1?[1,2].map(n=>({title:'Yam stock Ojuelegba Lagos',url:'https://supply.example/'+n,description:'Yam now in stock. Place your order.'})):[{title:'Restaurant Ojuelegba Lagos',url:'https://business.example/restaurant',description:'Restaurant serving local dishes in Ojuelegba Lagos.'}]}});}});
  const first=await tools.discover_buyer_routes({limit:5,hypotheses:[hypothesis('yam stock Ojuelegba Lagos','yam')]});assert.equal(opened.length,1);
  const result=await tools.refine_buyer_routes({hypotheses:[hypothesis(first.discoveryFeedback.suggestedQueries[0].query,'restaurant')]});
  assert.equal(opened.length,2);assert.ok(opened.some(url=>url.includes('business.example')));assert.equal(result.sourceChecks.max,2);assert.equal(result.summary.confirmedBuyers,0);
});
