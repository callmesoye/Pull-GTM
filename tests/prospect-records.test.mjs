import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {qualify,parseCSV,planCSVImport,deduplicate,recordFingerprint,privateReviewFingerprint,suppressionKeys,reconcileReviews,mergeSuppressions,normalizeProspect} from '../dist/engine.js';
import {validateWorkspace} from '../dist/workspace.js';

const now=new Date('2026-10-15T00:00:00Z');
const rules={roles:'Founder',industries:'Agriculture',countries:'Nigeria',min:'',max:'',signals:'',evidence:false,days:'90'};
const person=extra=>({id:'ada',name:'Ada Okafor',company:'Green Acre',title:'Founder',industry:'Agriculture',country:'Nigeria',origin:'import',profile_url:'https://www.linkedin.com/in/ada/',email:'ada@greenacre.test',private_verified:'yes',suppressed:false,...extra});
const workspace=extra=>({version:1,prospects:[person()],shortlist:['ada'],drafts:{ada:{subject:'A question',body:'My own carefully written message',channel:'email',ready:true}},audit:[],mode:'import',identity:'PULL',context:'company',website:'',offer:'Creative services',setup:true,duplicates:0,rules,suppressions:[],...extra});

test('Imports and native records have the same private-sector gate even with evidence switched off',()=>{
  for(const origin of ['import','discovery']){
    assert.equal(qualify(person({origin,private_verified:'no'}),rules,now).status,'review');
    assert.equal(qualify(person({origin,company:'State Government Ministry of Education',source_url:'https://agency.gov.ng/people/ada'}),rules,now).status,'excluded');
  }
});

test('CSV cannot award private ownership verification or transplant a review key',()=>{
  const [imported]=parseCSV('name,company,title,private_verified,review_key,private_review_key\nAda Okafor,Green Acre,Founder,yes,forged,forged');
  assert.equal(imported.private_verified,'no');assert.equal(imported.review_key,undefined);assert.equal(imported.private_review_key,undefined);
  assert.equal(qualify(imported,rules,now).status,'review');
});

test('Known public-sector CSV rows are rejected while private candidates remain available for review',()=>{
  const result=planCSVImport('name,company,source_url\nAda Okafor,Green Acre,https://greenacre.test\nFixture Person,Fixture public school,https://school.gov.ng');
  assert.equal(result.prospects.length,1);assert.equal(result.rejected.length,1);assert.equal(result.rejected[0].row,3);
});

test('An identity matches across email availability and canonical profile variants',()=>{
  const result=deduplicate([person({email:'',profile_url:'https://www.linkedin.com/in/ada/?trk=old'}),person({id:'other',profile_url:'https://linkedin.com/in/ada'})]);
  assert.equal(result.prospects.length,1);assert.equal(result.duplicates,1);assert.equal(result.prospects[0].email,'ada@greenacre.test');
});

test('Shared business inboxes and same-name people with different profiles stay separate',()=>{
  const a=person({email:'hello@greenacre.test'}),b=person({id:'ben',name:'Ben Okafor',profile_url:'https://linkedin.com/in/ben',email:'hello@greenacre.test'});
  assert.equal(deduplicate([a,b]).prospects.length,2);
  assert.equal(deduplicate([person(),person({id:'different',profile_url:'https://linkedin.com/in/another-ada',email:''})]).prospects.length,2);
});

test('Company-only records are normalized as businesses and retain unknown imported fields',()=>{
  const record=normalizeProspect({id:'company',company:'Green Acre',custom_segment:'Local growers',origin:'import'});
  assert.equal(record.entity_type,'business');assert.equal(record.custom_segment,'Local growers');assert.equal(record.name,undefined);
});

test('Replacement, rediscovery, and clearing records retain do-not-contact decisions',()=>{
  const original=workspace({prospects:[person({suppressed:true})]});
  const saved=validateWorkspace(original,{now});
  assert.ok(saved.suppressions.includes('email:ada@greenacre.test'));assert.equal(saved.shortlist.length,0);assert.equal(saved.drafts.ada.ready,false);
  const replacement=workspace({prospects:[person({id:'new-row',email:'',profile_url:'https://linkedin.com/in/ada',suppressed:false})],shortlist:['new-row'],drafts:{}});
  const next=validateWorkspace(replacement,{previous:saved,now});
  assert.equal(next.prospects[0].suppressed,true);assert.equal(next.shortlist.length,0);
  const cleared=validateWorkspace(workspace({prospects:[],shortlist:[],drafts:{},suppressions:[]}),{previous:next,now});
  assert.deepEqual(cleared.suppressions,next.suppressions);
});

test('Separate unsuppressed accounts never inherit a different workspace ledger',()=>{
  const a=validateWorkspace(workspace({prospects:[person({suppressed:true})]}),{now});
  const b=validateWorkspace(workspace(),{now});
  assert.ok(a.suppressions.length);assert.equal(b.suppressions.length,0);assert.equal(b.prospects[0].suppressed,false);
});

test('A shared-inbox match cannot spread suppression into another person’s private identifiers',()=>{
  const a=person({suppressed:true,email:'team@example.test'}),b=person({id:'ben',name:'Ben Okafor',profile_url:'https://linkedin.com/in/ben',email:'team@example.test'});
  const first=validateWorkspace(workspace({prospects:[a,b],shortlist:[],drafts:{}}),{now});
  assert.equal(first.prospects[1].suppression_origin,'matched');
  const second=validateWorkspace(first,{previous:first,now});
  assert.deepEqual(second.suppressions,first.suppressions);assert.ok(!second.suppressions.includes('profile:https://linkedin.com/in/ben'));
  const changed=structuredClone(second);changed.prospects[1].email='ben@own-business.test';
  const third=validateWorkspace(changed,{previous:second,now});
  assert.equal(third.prospects[0].suppressed,true);assert.equal(third.prospects[1].suppressed,false);
});

test('Material changes invalidate shortlist approval and prepared state while preserving text',()=>{
  const before=workspace();before.prospects[0].review_key=recordFingerprint(before.prospects[0]);
  const next=structuredClone(before);next.prospects[0].company='Another Business';
  const result=validateWorkspace(next,{previous:before,now});
  assert.equal(result.shortlist.length,0);assert.equal(result.drafts.ada.ready,false);assert.equal(result.drafts.ada.body,before.drafts.ada.body);assert.equal(result.prospects[0].private_verified,'no');
});

test('Cosmetic search timestamps do not undo a current reviewed choice',()=>{
  const before=workspace();before.prospects[0].review_key=recordFingerprint(before.prospects[0]);
  const next=structuredClone(before);next.prospects[0].discovered_at=now.toISOString();next.prospects[0].search_relevance='9';
  const result=validateWorkspace(next,{previous:before,now});assert.deepEqual(result.shortlist,['ada']);assert.equal(result.drafts.ada.ready,true);
});

test('An explicit new source review and shortlist decision can approve corrected details',()=>{
  const before=workspace(),next=structuredClone(before),record=next.prospects[0];
  record.company='Another Business';record.private_review_key=privateReviewFingerprint(record);record.review_key=recordFingerprint(record);
  const result=reconcileReviews(next,before,qualify,now);assert.deepEqual(result.shortlist,['ada']);assert.equal(result.prospects[0].private_verified,'yes');
});

test('Duplicate material disagreements retain both supplied values for the repair editor',()=>{
  const result=deduplicate([person(),person({id:'other',company:'Another Business'})]);
  assert.equal(result.prospects.length,1);assert.ok(result.prospects[0].conflicts.includes('company'));
  assert.deepEqual(JSON.parse(result.prospects[0].conflict_details).company,['Green Acre','Another Business']);
});

test('Suppression keys never reuse CSV row IDs or a shared team-page source',()=>{
  assert.deepEqual(suppressionKeys({id:'import-0',source_url:'https://example.test/team'}),[]);
  assert.notDeepEqual(suppressionKeys(person()),suppressionKeys(person({name:'Ben Okafor',email:'ben@greenacre.test',profile_url:'https://linkedin.com/in/ben'})));
  assert.throws(()=>mergeSuppressions(['invalid:key']),/do-not-contact/);
});

test('The agent runtime uses the exact same record lifecycle implementation',()=>{
  assert.equal(readFileSync(new URL('../dist/prospect-records.js',import.meta.url),'utf8'),readFileSync(new URL('../supabase/functions/pull-mcp/prospect-records.js',import.meta.url),'utf8'));
});

test('Identity query parameters, path case, and shared company profiles cannot merge different people',()=>{
  for(const [a,b] of [
    [person({profile_url:'https://directory.example/member?id=1'}),person({id:'ben',name:'Ben Okafor',profile_url:'https://directory.example/member?id=2',email:'ben@example.test'})],
    [person({profile_url:'https://directory.example/team/Ada'}),person({id:'ben',name:'Ben Okafor',profile_url:'https://directory.example/team/ada',email:'ben@example.test'})],
    [person({x_url:'https://x.com/greenacre',profile_url:'',email:'hello@example.test'}),person({id:'ben',name:'Ben Okafor',x_url:'https://x.com/greenacre',profile_url:'',email:'hello@example.test'})]
  ])assert.equal(deduplicate([a,b]).prospects.length,2);
});

test('Corrected discovery profiles retain one ID and expose disagreements on rediscovery',()=>{
  const result=deduplicate([person({origin:'discovery',id:'source-ada',profile_url:'https://linkedin.com/in/corrected'}),person({origin:'discovery',id:'source-ada',profile_url:'https://linkedin.com/in/original'})]);
  assert.equal(result.prospects.length,1);assert.ok(result.prospects[0].conflicts.includes('profile_url'));
});

test('A proven duplicate alias is indexed for later records in the same batch',()=>{
  const result=deduplicate([person(),person({id:'new-company',company:'New Farm'}),person({id:'alias-only',company:'New Farm',profile_url:'',email:''})]);
  assert.equal(result.prospects.length,1);assert.equal(result.duplicates,2);assert.ok(result.prospects[0].conflicts.includes('company'));
});

test('Merging a suppressed alias preserves old and new identifiers across later replacements',()=>{
  const old=person({email:'old@example.test'}),blocked=person({email:'new@example.test',company:'New Farm',suppressed:true});
  const merged=deduplicate([old,blocked]).prospects;
  const saved=validateWorkspace(workspace({prospects:merged}),{now});
  const next=validateWorkspace(workspace({prospects:[person({email:'new@example.test',profile_url:'',company:'New Farm'})]}),{previous:saved,now});
  assert.equal(next.prospects[0].suppressed,true);assert.ok(saved.suppressions.includes('email:new@example.test'));
});

test('Company-only suppression survives a later import without a website',()=>{
  const saved=validateWorkspace(workspace({prospects:[{id:'business',company:'Green Acre',suppressed:true}],shortlist:[],drafts:{}}),{now});
  const next=validateWorkspace(workspace({prospects:[{id:'new-business',company:'Green Acre'}],shortlist:[],drafts:{}}),{previous:saved,now});
  assert.equal(next.prospects[0].suppressed,true);assert.ok(saved.suppressions.includes('entity:|green acre'));
});

test('A case-sensitive source URL change invalidates earlier review',()=>{
  const before=workspace();before.prospects[0].source_url='https://example.test/team/Ada';before.prospects[0].review_key=recordFingerprint(before.prospects[0]);
  const next=structuredClone(before);next.prospects[0].source_url='https://example.test/team/ada';
  assert.equal(validateWorkspace(next,{previous:before,now}).shortlist.length,0);
});

test('Malformed stored conflict metadata does not prevent repairing duplicate records',()=>{
  for(const conflict_details of ['null','[]','{"company":"not-an-array"}']){
    const merged=deduplicate([person({conflict_details}),person({company:'New Farm'})]);
    assert.deepEqual(JSON.parse(merged.prospects[0].conflict_details).company,['Green Acre','New Farm']);
  }
});
