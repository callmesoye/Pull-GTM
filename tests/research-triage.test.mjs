import test from 'node:test';
import assert from 'node:assert/strict';
import {buildResearchTriage} from '../server/research-triage.js';

const partial=(changes={})=>({
 title:'Ada Okafor — Founder at Green Acre',
 url:'https://greenacre.example/team/ada',
 description:'Ada Okafor is Founder at Green Acre, a private agriculture company.',
 private_sector_basis:'explicit-private-sector',
 matched:[{label:'Audience',terms:['founder']},{label:'Industry or need',terms:['agriculture']}],
 missing:['Location'],
 ...changes
});

test('strictly marks partial named research as needing verification, never as a lead or outreach permission',()=>{
 const result=buildResearchTriage({input:{limit:30},candidates:[partial()],people:[{name:'Someone Else',company:'Another'}],diagnostics:{providerResults:80,missingTargetEvidence:18},requestsUsed:8});
 assert.equal(result.reviewQueue.length,1);
 const item=result.reviewQueue[0];
 assert.equal(item.name,'Ada Okafor');assert.equal(item.company,'Green Acre');
 assert.deepEqual(item.missing,['Location']);
 assert.equal(item.status,'needs_research');assert.equal(item.eligible_for_outreach,false);
 assert.equal(item.email,undefined);assert.equal(item.contact_url,undefined);
 assert.equal(result.researchQuality.qualified,1);assert.equal(result.researchQuality.needs_research,1);
 assert.equal(result.researchQuality.qualified_per_request,0.13);
 assert.equal(result.researchQuality.qualified_per_100_results,1.25);
 assert.equal(result.researchQuality.shortfall,29);
});

test('wrong audience, source mismatch, fully matched, unsafe links and source-only pages never enter review queue',()=>{
 const r=buildResearchTriage({input:{limit:30},candidates:[
  partial({missing:['Audience','Location']}),
  partial({missing:['Preferred source','Location']}),
  partial({missing:[]}),
  partial({url:'http://greenacre.example/team/ada'}),
  partial({url:'https://localhost/team/ada'}),
  partial({title:'Green Acre farming company in Lagos'}),
  partial({matched:[]}),
  partial({private_sector_basis:''})
 ]});
 assert.deepEqual(r.reviewQueue,[]);
});

test('deduplicates source and identity and excludes already qualified people',()=>{
 const candidate=partial();
 const r=buildResearchTriage({input:{limit:30},candidates:[candidate,candidate,{...candidate,url:'https://greenacre.example/team/ada?ref=search'}],people:[{name:'Ada Okafor',company:'Green Acre',source_url:'https://other.example/profile'}]});
 assert.equal(r.reviewQueue.length,0);
 const noPeople=buildResearchTriage({input:{limit:30},candidates:[candidate,candidate,{...candidate,url:'https://greenacre.example/team/ada?ref=search'}]});
 assert.equal(noPeople.reviewQueue.length,1);
});

test('caps review queue and keeps analytics distinct from precision or independently verified fit',()=>{
 const list=Array.from({length:30},(_,i)=>partial({title:'Ada'+String.fromCharCode(65+i)+' Okafor — Founder at Green Acre',url:'https://greenacre.example/team/ada'+i}));
 const r=buildResearchTriage({input:{limit:30},candidates:list,diagnostics:{providerResults:80,missingIdentity:15,missingTargetEvidence:12},requestsUsed:8});
 assert.equal(r.reviewQueue.length,12);
 assert.equal(r.researchQuality.dominant_observed_blocker.code,'missingIdentity');
 assert.equal(r.researchQuality.stage_observations_not_exclusive,true);
 assert.equal(r.researchQuality.qualified_per_100_results,0);
 assert.equal(r.researchQuality.qualified_per_request,0);
 assert.equal(r.researchQuality.note.includes('unverified'),true);
});

test('zero provider observations do not create false success ratios',()=>{
 const r=buildResearchTriage();
 assert.equal(r.researchQuality.qualified_per_100_results,null);
 assert.equal(r.researchQuality.qualified_per_request,null);
 assert.deepEqual(r.reviewQueue,[]);
});

test('research UI displays unresolved sources separately and never offers to add them to Buyers',async()=>{
  const {renderResearchResults}=await import('../dist/intelligence-ui.js');
  const html=renderResearchResults([{people:[],reviewQueue:[{name:'Ada Okafor',title:'Founder',company:'Green Acre',source_url:'https://greenacre.example/team/ada',missing:['Location']}],target:{requested:30},notice:'No verified records.'}],0,s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));
  assert.match(html,/sources need research/);
  assert.match(html,/Missing: Location/);
  assert.match(html,/not qualified prospects/i);
  assert.doesNotMatch(html,/Add \d+ to Buyers/);
});

test('end-to-end discovery preserves incomplete location evidence without qualifying the person',async()=>{
  const {discoveryInput,discoverPrivatePages}=await import('../server/discovery.js');
  const input=discoveryInput({audience:'Founder',industry:'Agriculture',location:'Lagos',limit:2});
  let requests=0;
  const result=await discoverPrivatePages(input,{key:'fixture',provider:'serper',maxQueries:1,
    transport:async()=>{requests++;return Response.json({organic:[{
      title:'Ada Okafor — Founder at Green Acre',
      link:'https://greenacre.example/team/ada',
      snippet:'Ada Okafor is founder at Green Acre, a private company active in agriculture.'
    }]});}
  });
  assert.equal(requests,1);
  assert.equal(result.people.length,0);
  assert.equal(result.target.returned,0);
  assert.equal(result.reviewQueue.length,1);
  assert.deepEqual(result.reviewQueue[0].missing,['Location']);
  assert.equal(result.reviewQueue[0].eligible_for_outreach,false);
  assert.equal(result.researchQuality.qualified,0);
  assert.equal(result.researchQuality.needs_research,1);
});
