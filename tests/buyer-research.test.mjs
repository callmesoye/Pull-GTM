import test from 'node:test';
import assert from 'node:assert/strict';
import {buyerResearchInput,assessBuyerObservation,discoverBuyerRoutes,mergeBuyerResearch} from '../server/buyer-research.js';
import {createIntelligenceTools} from '../server/intelligence.js';
import {generateReply} from '../server/ai.js';
import {evidenceLedger,validateResearchLinks} from '../server/intelligence-policy.js';
import {renderResearchResults} from '../dist/intelligence-ui.js';

const now=()=>new Date('2026-10-22T12:00:00Z');
const brief=()=>({product:'Mercedes Benz C300 2026 available for sale',productTerms:['C300'],location:'Lagos',limit:10,hypotheses:[
  {buyerType:'People explicitly requesting this model',reason:'A specific request may reveal a current need.',route:'expressed_demand',keywords:['C300'],queries:['C300 wanted Lagos','looking for C300 Lagos']},
  {buyerType:'Dealers accepting vehicles',reason:'A dealership might buy or broker suitable stock.',route:'intermediary',keywords:['dealership'],queries:['car dealership Lagos','dealership vehicle sourcing Lagos']},
  {buyerType:'Vehicle discussion channels',reason:'Research purchase questions and suitable channels.',route:'market_context',keywords:['Mercedes'],queries:['Mercedes discussion Lagos']}
]});
const source=(description,changes={})=>({title:'Vehicle discussion Lagos',url:'https://market.example/request',description,...changes});
const opts=(transport,extra={})=>({provider:'brave',key:'fixture-search-secret',transport,beforeRequest:async()=>true,now,...extra});
const brave=rows=>Response.json({web:{results:rows}});
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('The product-led contract permits multiple buyer routes but preserves seller terms and location',()=>{
  assert.equal(buyerResearchInput(brief()).hypotheses.length,3);
  assert.throws(()=>buyerResearchInput({...brief(),productTerms:['billionaires']}),/seller product/);
  const altered=brief();altered.hypotheses[0].queries=['C300 wanted Abuja'];
  assert.throws(()=>buyerResearchInput(altered),/location/);
  assert.throws(()=>buyerResearchInput({...brief(),limit:1000}));
  assert.throws(()=>buyerResearchInput({...brief(),send:true}));
  assert.throws(()=>buyerResearchInput({...brief(),hypotheses:Array(5).fill(brief().hypotheses[0])}));
});
test('A model-specific request remains unverified with affordability and contact permission unknown',()=>{
  const b=buyerResearchInput(brief()),r=assessBuyerObservation(source('I am looking for a C300 in Lagos.'),b,b.hypotheses[0],{now:now()});
  assert.equal(r.kind,'possible_request');assert.equal(r.need_status,'unconfirmed');
  assert.equal(r.affordability_status,'unknown');assert.equal(r.contact_permission,'unknown');
  assert.equal(r.published_at,null);assert.equal(r.evidence_status,'search-excerpt-unverified');
  assert.ok(r.missing.includes('Original source verification'));
});
test('Lifestyle, admiration and price questions do not become buying requests',()=>{
  const b=buyerResearchInput(brief());
  for(const text of ['I love this car, C300 Lagos.','C300 is my dream car in Lagos.','How much is a C300 in Lagos?','Luxury lifestyle and Mercedes C300 in Lagos.']){
    const r=assessBuyerObservation(source(text),b,b.hypotheses[0],{now:now()});
    assert.equal(r.kind,'market_context');assert.equal(r.affordability_status,'unknown');
  }
});
test('Selling listings and fulfilled requests never become buying requests',()=>{
  const b=buyerResearchInput(brief());
  for(const text of ['Looking for a C300? C300 for sale in Lagos.','I was looking for C300 in Lagos but already bought one.','C300 Lagos buying request: request closed.']){
    assert.notEqual(assessBuyerObservation(source(text),b,b.hypotheses[0],{now:now()}).kind,'possible_request');
  }
});
test('Unrelated demand phrases cannot manufacture a product-specific request',()=>{
  const b=buyerResearchInput(brief());
  const r=assessBuyerObservation(source('Looking for a laptop in Lagos. '+('Separate article. '.repeat(30))+'Mercedes C300 review.'),b,b.hypotheses[0],{now:now()});
  assert.equal(r.kind,'market_context');assert.equal(r.request_excerpt,'');
});
test('Intermediaries are research routes, not invented consumers or confirmed buyers',()=>{
  const b=buyerResearchInput(brief()),r=assessBuyerObservation(source('Independent car dealership in Lagos.'),b,b.hypotheses[1],{now:now()});
  assert.equal(r.kind,'buying_route');assert.equal(r.need_status,'unconfirmed');assert.equal(r.name,undefined);
});
test('Old or invalid publication dates cannot be presented as current buying requests',()=>{
  const b=buyerResearchInput(brief());
  const old=assessBuyerObservation(source('Looking for C300 Lagos.',{published_at:'2013-05-09'}),b,b.hypotheses[0],{now:now()});
  assert.equal(old.kind,'market_context');assert.equal(old.excluded_as_request,'stale_request');
  for(const date of ['yesterday','not-a-date','2099-01-01']){
    const r=assessBuyerObservation(source('Looking for C300 Lagos.',{published_at:date}),b,b.hypotheses[0],{now:now()});
    assert.equal(r.published_at,null);assert.equal(r.need_status,'unconfirmed');
  }
});
test('Source geography is not inferred from the query',()=>{
  const b=buyerResearchInput(brief()),r=assessBuyerObservation(source('Looking for C300.',{title:'Vehicle request'}),b,b.hypotheses[0],{now:now()});
  assert.equal(r.location_status,'unknown');assert.ok(r.missing.includes('Location'));
});
test('Existing public-sector and unsafe-source exclusions remain enforced',()=>{
  const b=buyerResearchInput(brief());
  for(const url of ['https://ministry.gov.ng/request','https://127.0.0.1/request','javascript:alert(1)','https://worldbank.org/request','https://user:password@market.example/request']){
    assert.equal(assessBuyerObservation(source('Looking for C300 Lagos.',{url}),b,b.hypotheses[0]),null);
  }
});
test('Different initial hypotheses get a turn before fallback searches and failures do not erase results',async()=>{
  const queries=[];
  const result=await discoverBuyerRoutes(brief(),opts(async url=>{
    const q=new URL(url).searchParams.get('q');queries.push(q);
    if(q==='C300 wanted Lagos')throw new Error('transient');
    return brave(q.includes('dealership')?[source('Independent car dealership Lagos.',{url:'https://dealer.example/about'})]:[source('I am looking for C300 Lagos.')]);
  }));
  assert.deepEqual(queries.slice(0,3),['C300 wanted Lagos','car dealership Lagos','Mercedes discussion Lagos']);
  assert.ok(queries.includes('looking for C300 Lagos'));
  assert.equal(result.coverage.status,'partial');assert.equal(result.summary.confirmedBuyers,0);
  assert.equal(result.opportunities.length,2);assert.equal(result.trace[0].status,'unavailable');
});
test('Repeated URLs consolidate with provenance but do not increase buyer counts',async()=>{
  const result=await discoverBuyerRoutes(brief(),opts(async()=>brave([source('I am looking for C300 Lagos.'),source('I am looking for C300 Lagos.',{url:'https://market.example/request?utm_source=copy'})])));
  assert.equal(result.opportunities.length,1);assert.equal(result.opportunities[0].hypothesis_ids.length,3);
  assert.equal(result.summary.possibleRequests,1);assert.equal(result.summary.confirmedBuyers,0);
  assert.ok(result.trace.some(t=>t.duplicates>0));
});
test('Budget is mandatory and enforced before every source request',async()=>{
  let calls=0,claims=0;
  await assert.rejects(()=>discoverBuyerRoutes(brief(),{provider:'brave',key:'x',transport:async()=>{calls++;}}),/budget/);
  const result=await discoverBuyerRoutes(brief(),opts(async()=>{calls++;return brave([]);},{beforeRequest:async()=>++claims===1}));
  assert.equal(calls,1);assert.equal(result.requestsUsed,1);assert.equal(result.coverage.stopReason,'source_budget_reached');
});
test('Broken quota verification fails closed without exposing backend details',async()=>{
  const result=await discoverBuyerRoutes(brief(),opts(async()=>{throw new Error('must not call');},{beforeRequest:async()=>{throw new Error('private database details');}}));
  assert.equal(result.requestsUsed,0);assert.equal(result.coverage.stopReason,'budget_unavailable');
  assert.ok(!JSON.stringify(result).includes('private database'));
});
test('Provider credit exhaustion stops the run with honest partial coverage',async()=>{
  let requests=0;
  const result=await discoverBuyerRoutes(brief(),opts(async()=>{requests++;return Response.json({private:'not propagated'},{status:402});}));
  assert.equal(requests,1);assert.equal(result.coverage.stopReason,'credits_exhausted');
  assert.equal(result.summary.sources,0);assert.equal(result.coverage.status,'partial');
  assert.ok(!JSON.stringify(result).includes('fixture-search-secret'));
});
test('The query cap applies to fallback work as well as initial routes',async()=>{
  const result=await discoverBuyerRoutes(brief(),opts(async()=>brave([]),{maxQueries:2}));
  assert.equal(result.requestsUsed,2);assert.equal(result.coverage.stopReason,'request_budget_reached');
  assert.equal(result.coverage.attemptedHypotheses,2);
});
test('All supported provider response shapes use the same source classification',async()=>{
  for(const provider of ['exa','serper','brave']){
    const result=await discoverBuyerRoutes(brief(),opts(async(url,options)=>{
      if(provider==='brave')return brave([source('Looking for C300 Lagos.')]);
      const payload=JSON.parse(options.body);assert.ok(provider==='exa'?payload.query:payload.q);
      return provider==='exa'?Response.json({results:[{title:'C300 Lagos',url:'https://market.example/request',highlights:['Looking for C300 Lagos.']}]}):Response.json({organic:[{title:'C300 Lagos',link:'https://market.example/request',snippet:'Looking for C300 Lagos.'}]});
    },{provider,maxQueries:1}));
    assert.equal(result.summary.possibleRequests,1);assert.equal(result.summary.confirmedBuyers,0);
  }
});
test('The mechanism also handles service products without automotive templates',async()=>{
  const service={product:'Website design for online shops',productTerms:['website design'],location:'Abuja',limit:4,hypotheses:[{buyerType:'Businesses requesting a website',reason:'An explicit project brief can establish relevance.',route:'expressed_demand',keywords:['website'],queries:['website design wanted Abuja']}]};
  const result=await discoverBuyerRoutes(service,opts(async()=>brave([source('Looking for website design in Abuja.',{title:'Website request Abuja'})])));
  assert.equal(result.summary.possibleRequests,1);assert.equal(result.input.product,service.product);
});
test('Feature availability requires both explicit research permission and the server flag',()=>{
  for(const [allowResearch,flag,enabled] of [[false,'true',false],[true,'false',false],[true,'true',true]]){
    const tools=createIntelligenceTools({db:{},ownerId:'A',env:{PULL_BUYER_RESEARCH_ENABLED:flag},allowResearch});
    assert.equal(Object.hasOwn(tools,'discover_buyer_routes'),enabled);
  }
});
test('The integrated tool uses the existing database quota RPC for each request',async()=>{
  const claims=[];
  const tools=createIntelligenceTools({ownerId:'A',env:{PULL_BUYER_RESEARCH_ENABLED:'true',PULL_SEARCH_PROVIDER:'brave',BRAVE_SEARCH_API_KEY:'test',PULL_SEARCH_MAX_QUERIES:'1'},allowResearch:true,now,db:{rpc:async(name,args)=>{claims.push({name,args});return {data:true};}},transport:async()=>brave([])});
  const result=await tools.discover_buyer_routes(brief());
  assert.equal(result.type,'buyer_research');assert.deepEqual(claims,[{name:'claim_pull_search_requests',args:{p_requests:1}}]);
});
test('Buyer research remains available as source cards after a model-summary outage',async()=>{
  const research=await discoverBuyerRoutes(brief(),opts(async()=>brave([source('Looking for C300 Lagos.')]),{maxQueries:1}));
  let round=0;
  const result=await generateReply({env:{AI_GATEWAY_API_KEY:'fixture'},userId:'A',body:{message:'Find buyers for my C300 in Lagos'},tools:{discover_buyer_routes:async()=>research},transport:async()=>++round===1?Response.json({choices:[{message:{tool_calls:[{id:'one',type:'function',function:{name:'discover_buyer_routes',arguments:JSON.stringify(brief())}}]}}]}):Response.json({error:'secret'},{status:503})});
  assert.equal(result.status,200);assert.equal(result.research[0].type,'buyer_research');assert.match(result.reply,/not confirmed buyers/);
});
test('A single model turn cannot run both buyer-route and professional research',async()=>{
  const executed=[];let round=0;
  await generateReply({env:{AI_GATEWAY_API_KEY:'fixture'},userId:'A',body:{message:'Research buyers'},tools:{discover_buyer_routes:async()=>{executed.push('buyers');return {type:'buyer_research',opportunities:[]};},search_prospects:async()=>{executed.push('people');return {type:'research',people:[]};}},transport:async()=>Response.json({choices:[{message:++round===1?{tool_calls:['discover_buyer_routes','search_prospects'].map((name,i)=>({id:String(i),type:'function',function:{name,arguments:'{}'}}))}:{content:'Review research sources.'}}]})});
  assert.deepEqual(executed,['buyers']);
});
test('Source citations include buyer-route research and reject invented links',()=>{
  const ledger=evidenceLedger({},[{type:'buyer_research',opportunities:[{title:'Candidate source',source_url:'https://market.example/request',source_excerpt:'Source passage'}]}]);
  assert.equal(ledger.length,1);assert.equal(ledger[0].name,'Candidate source');
  assert.equal(validateResearchLinks('https://market.example/request',ledger),true);
  assert.equal(validateResearchLinks('https://invented.example/buyer',ledger),false);
});
test('Source-card UI escapes content and never offers unverified pages as importable people',()=>{
  const rendered=renderResearchResults([{type:'buyer_research',opportunities:[{title:'<script>bad</script>',source_excerpt:'<img src=x>',kind:'possible_request',missing:['Identity'],source_url:'javascript:alert(1)'}],coverage:{completedQueries:1,plannedQueries:3,status:'partial'}}],0,escape);
  assert.ok(!rendered.includes('<script>'));assert.ok(!rendered.includes('<img'));assert.ok(!rendered.includes('href="javascript:'));
  assert.ok(!rendered.includes('data-ai-research='));assert.match(rendered,/Possible buying request/);assert.match(rendered,/No buyers were confirmed/);
});

test('An evidence-informed second pass shares the original source cap and fixed seller constraints',async()=>{
  let calls=0;
  const tools=createIntelligenceTools({ownerId:'A',env:{PULL_BUYER_RESEARCH_ENABLED:'true',PULL_SEARCH_PROVIDER:'brave',BRAVE_SEARCH_API_KEY:'test',PULL_SEARCH_MAX_QUERIES:'5'},allowResearch:true,now,db:{rpc:async()=>({data:true})},transport:async()=>{calls++;return brave([source('Independent dealership Lagos. C300 vehicles.')]);}});
  const first=await tools.discover_buyer_routes(brief());
  assert.equal(first.requestsUsed,4);assert.equal(first.remainingSourceRequests,1);
  const revised={buyerType:'Dealer acquisition desks',reason:'The first results mention dealerships; investigate their buying process.',route:'intermediary',keywords:['dealership'],queries:['dealership acquisition desk C300 Lagos','dealer consignment C300 Lagos']};
  const second=await tools.refine_buyer_routes({hypotheses:[revised]});
  assert.equal(calls,5);assert.equal(second.requestsUsed,5);assert.equal(second.run_id,first.run_id);
  assert.equal(second.input.product,first.input.product);assert.equal(second.input.location,first.input.location);
  assert.equal(second.summary.sources,1);assert.equal(second.remainingSourceRequests,0);
  assert.ok(second.opportunities[0].hypothesis_ids.includes('H4'));
  assert.match((await tools.refine_buyer_routes({hypotheses:[revised]})).error,/one refinement/);
});
test('Refinement cannot run first, alter the product or repeat an already executed query',async()=>{
  const config={ownerId:'A',env:{PULL_BUYER_RESEARCH_ENABLED:'true',PULL_SEARCH_PROVIDER:'brave',BRAVE_SEARCH_API_KEY:'test'},allowResearch:true,now,db:{rpc:async()=>({data:true})},transport:async()=>brave([])};
  assert.match((await createIntelligenceTools(config).refine_buyer_routes({hypotheses:[]})).error,/initial/);
  const a=createIntelligenceTools(config);await a.discover_buyer_routes(brief());
  await assert.rejects(()=>a.refine_buyer_routes({product:'Different',hypotheses:[]}),/only revised/);
  const b=createIntelligenceTools(config);await b.discover_buyer_routes(brief());
  await assert.rejects(()=>b.refine_buyer_routes({hypotheses:[brief().hypotheses[0]]}),/new queries/);
});
test('The model can revise its route after seeing evidence and the UI receives one merged batch',async()=>{
  let modelCalls=0,sourceCalls=0;
  const env={AI_GATEWAY_API_KEY:'fixture',PULL_BUYER_RESEARCH_ENABLED:'true',PULL_SEARCH_PROVIDER:'brave',BRAVE_SEARCH_API_KEY:'test',PULL_SEARCH_MAX_QUERIES:'5'};
  const transport=async(url,options)=>{
    if(new URL(url).hostname!=='ai-gateway.vercel.sh'){sourceCalls++;return brave([source('C300 Lagos. Independent dealership with vehicle acquisition service.')]);}
    const request=JSON.parse(options.body);modelCalls++;
    if(modelCalls===1){assert.ok(!request.tools.some(t=>t.function.name==='refine_buyer_routes'));return Response.json({choices:[{message:{tool_calls:[{id:'initial',type:'function',function:{name:'discover_buyer_routes',arguments:JSON.stringify(brief())}}]}}]});}
    if(modelCalls===2){
      assert.deepEqual(request.tools.map(t=>t.function.name),['refine_buyer_routes']);
      const evidence=JSON.parse(request.messages.at(-1).content);assert.equal(evidence.summary.buyingRoutes,1);
      return Response.json({choices:[{message:{tool_calls:[{id:'refinement',type:'function',function:{name:'refine_buyer_routes',arguments:JSON.stringify({hypotheses:[{buyerType:'Dealer acquisition offices',reason:'The first source describes vehicle acquisition; check the purchasing route.',route:'intermediary',keywords:['dealership'],queries:['C300 dealer acquisition Lagos']}]})}}]}}]});
    }
    assert.equal(request.tool_choice,'none');return Response.json({choices:[{message:{content:'Review the dealer acquisition route and confirm whether the business buys this model.'}}]});
  };
  const tools=createIntelligenceTools({ownerId:'A',env,allowResearch:true,transport,now,db:{rpc:async()=>({data:true})}});
  const result=await generateReply({env,userId:'A',body:{message:'Find buyers for my C300 in Lagos'},tools,transport});
  assert.equal(result.status,200);assert.equal(modelCalls,3);assert.equal(sourceCalls,5);
  assert.equal(result.research.length,1);assert.equal(result.research[0].refinement,'completed');
  assert.equal(result.research[0].summary.confirmedBuyers,0);
});
test('Cross-pass source counts include undisplayed results without exposing their URLs in payloads',async()=>{
  const b={...brief(),limit:1};
  const first=await discoverBuyerRoutes(b,opts(async()=>brave([source('Looking for C300 Lagos.',{url:'https://market.example/one'}),source('Looking for C300 Lagos.',{url:'https://market.example/two'})]),{maxQueries:1}));
  const next=await discoverBuyerRoutes(b,opts(async()=>brave([source('Looking for C300 Lagos.',{url:'https://market.example/two'}),source('Looking for C300 Lagos.',{url:'https://market.example/three'})]),{maxQueries:1,hypothesisOffset:3}));
  assert.equal(mergeBuyerResearch(first,next).coverage.uniqueSourcesFound,3);
  assert.ok(!JSON.stringify(first).includes('https://market.example/two'));
});

test('Uncertain reservations are skipped and saved source failures never trigger another HTTP request',async()=>{
  let requests=0;
  const result=await discoverBuyerRoutes(brief(),opts(async()=>{throw new Error('must not reach provider');},{beforeRequest:async()=>++requests===1?{state:'uncertain'}:{state:'replay',response:{error:'CREDITS_EXHAUSTED'}}}));
  assert.equal(result.requestsUsed,0);assert.equal(result.trace[0].status,'uncertain');assert.equal(result.trace[1].replayed,true);assert.equal(result.coverage.stopReason,'credits_exhausted');
});
test('A failed receipt write stops further source spending with explicit partial coverage',async()=>{
  let calls=0;
  const result=await discoverBuyerRoutes(brief(),opts(async()=>{calls++;return brave([source('Looking for C300 Lagos.')]);},{beforeRequest:async()=>({state:'claimed'}),afterRequest:async()=>{throw new Error('private DB details');}}));
  assert.equal(calls,1);assert.equal(result.coverage.status,'partial');assert.equal(result.coverage.stopReason,'persistence_unavailable');assert.ok(!JSON.stringify(result).includes('private DB details'));
});
