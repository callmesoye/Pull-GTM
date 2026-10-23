import test from 'node:test';
import assert from 'node:assert/strict';
import {compileScenarioLab} from '../scripts/build-scenario-lab.mjs';
import {offerScenarioGuidance,scenarioResearchPlan} from '../server/scenario-planner.js';
import {assessPrecisionPilot,assessBuyerFindingPilot} from '../server/pilot-release-gates.js';
import {generateReply} from '../server/ai.js';
import {readFile,readdir} from 'node:fs/promises';

test('530-case lab is distinct, complete, source-linked and never populated buyer evidence',async()=>{
  const lab=await compileScenarioLab();
  assert.equal(lab.cases.length,520);assert.equal(lab.stress.length,10);assert.equal(lab.scope.sectors,52);
  assert.equal(new Set(lab.cases.map(c=>c.product.toLowerCase())).size,520);
  assert.equal(new Set([...lab.cases,...lab.stress].map(c=>c.id)).size,530);
  const sources=new Set(lab.sources.map(s=>s.id));
  for(const c of lab.cases){
    assert.equal(c.buyerFindingOutcome,null);assert.equal(c.status,'researched_hypothetical');assert.equal(c.plan.buyerConfirmed,false);
    assert.ok(c.problem&&c.buyerRole&&c.trigger&&c.bindingCheck&&c.plan.successMetric,c.id);
    assert.ok(c.sourceIds.every(id=>sources.has(id)),c.id);
    assert.equal(c.plan.input.hypotheses.flatMap(h=>h.queries).length,4);
    for(const q of c.plan.input.hypotheses.flatMap(h=>h.queries)){assert.ok(q.includes(c.location),c.id);assert.ok(q.includes(c.product),c.id);}
    if(c.plan.directoryHandoff){const u=new URL(c.plan.directoryHandoff.url);assert.equal(u.hostname,'www.google.com');assert.equal(u.searchParams.get('query'),`${c.buyerRole} ${c.location}`);assert.equal(c.plan.directoryHandoff.status,'planned_not_executed');}
  }
  assert.equal(lab.precisionReview.metrics.overall.precision,null);assert.equal(lab.precisionReview.releaseAuthorized,false);
  for(const gap of lab.gaps)assert.ok(gap.status&&gap.action,gap.gap);
});

test('Buyer-finding gate measures offers receiving buyers rather than relevance of cards',()=>{
  const offer={offerId:'o',category:'wholesale',geography:'Ojuelegba',eligible:true,submittedAt:'2026-10-01',buyerEvidence:[{buyerId:'b',qualifiedAt:'2026-10-02',truthQualified:true,reachable:true,contactPermitted:true}]};
  const offers=Array.from({length:200},(_,i)=>({...offer,offerId:'o'+i}));
  const good=assessBuyerFindingPilot(offers,{asOf:'2026-10-23'});assert.equal(good.statisticalCriteriaMet,true);assert.equal(good.releaseAuthorized,false);assert.equal(good.independentEvidenceVerified,false);
  assert.equal(assessBuyerFindingPilot([],{asOf:'2026-10-23'}).metrics.overall.buyerFindingRate,null);
  const noPermission=offers.map(o=>({...o,buyerEvidence:[{...o.buyerEvidence[0],contactPermitted:false}]}));assert.equal(assessBuyerFindingPilot(noPermission,{asOf:'2026-10-23'}).metrics.overall.buyerFindingRate,0);
  const poor=offers.map((o,i)=>i<196?o:{...o,buyerEvidence:[]});const result=assessBuyerFindingPilot(poor,{asOf:'2026-10-23'});assert.equal(result.metrics.overall.buyerFindingRate,.98);assert.equal(result.statisticalCriteriaMet,false);
});

test('Every Node API importing the shared backend includes its runtime scenario assets',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  for(const file of await readdir(new URL('../api/',import.meta.url))){
    if(!file.endsWith('.js'))continue;
    const source=await readFile(new URL('../api/'+file,import.meta.url),'utf8');
    if(source.includes("from '../server/backend.js'"))assert.equal(config.functions['api/'+file]?.includeFiles,'research/scenario-lab/{seeds.txt,mechanisms.json}',file);
  }
});
test('Scenario guidance preserves the actual offer market and leaves unsupported matches absent',async()=>{
  const lab=await compileScenarioLab(),yam=lab.cases[0];
  const offer={id:'saved',version:3,fields:{product:yam.product,location:'Kano'},exactTerms:[yam.product]};
  const guidance=offerScenarioGuidance(offer);assert.equal(guidance.status,'hypothesis_guidance');assert.equal(guidance.cases[0].scenarioId,'S001');assert.equal(guidance.buyerConfirmed,false);
  const plan=scenarioResearchPlan(yam,offer);assert.ok(plan.input.hypotheses.every(h=>h.queries.every(q=>q.includes('Kano')&&!q.includes('Ojuelegba'))));
  assert.equal(offerScenarioGuidance({fields:{product:'Undescribed new invention',location:'Lagos'},exactTerms:['invention']}).status,'no_specific_case');
});
test('AI receives bounded hypothetical mechanism guidance only for a confirmed product-led offer',async()=>{
  let payload;const offer={id:'a',version:1,fields:{product:'Fresh yam',location:'Ojuelegba Lagos'},exactTerms:['yam']};
  const result=await generateReply({body:{message:'Find buyers'},userId:'u',env:{AI_GATEWAY_API_KEY:'fixture'},confirmedOffer:offer,tools:{discover_buyer_routes:async()=>({})},transport:async(url,init)=>{payload=JSON.parse(init.body);return {ok:true,json:async()=>({choices:[{message:{content:'Review the buying requirements.'}}]})};}});
  assert.equal(result.status,200);const msg=payload.messages.find(m=>m.content?.startsWith('Scenario-library guidance'));
  assert.ok(msg.content.includes('S001'));assert.ok(msg.content.includes('never live buyer evidence'));assert.ok(msg.content.length<7000);
});
test('98% review gate requires evidence and a lower confidence bound, never authorizes release or buyer claims',()=>{
  assert.equal(assessPrecisionPilot([]).statisticalCriteriaMet,false);
  const row={predictedTier:'qualified_opportunity',truthQualified:true,category:'goods',geography:'pilot city'};
  assert.equal(assessPrecisionPilot(Array.from({length:10},()=>({...row}))).statisticalCriteriaMet,false);
  const good=assessPrecisionPilot(Array.from({length:200},()=>({...row})));
  assert.equal(good.statisticalCriteriaMet,true);assert.ok(good.metrics.overall.precisionLower95>.98);assert.equal(good.releaseAuthorized,false);assert.equal(good.buyerFindingRate,null);
  const unknown=assessPrecisionPilot([...Array.from({length:200},()=>({...row})),{...row,truthQualified:null}]);assert.equal(unknown.statisticalCriteriaMet,false);
  const bad=assessPrecisionPilot([...Array.from({length:196},()=>({...row})),...Array.from({length:4},()=>({...row,truthQualified:false}))]);assert.equal(bad.metrics.overall.precision,.98);assert.equal(bad.statisticalCriteriaMet,false);
});
