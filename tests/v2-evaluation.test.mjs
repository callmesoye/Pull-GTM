import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOpportunityLabels,evaluateBuyerFinding} from '../server/v2-evaluation.js';

test('precision is distinct from recall and unknown labels are not treated as wins',()=>{
  const row=(predictedTier,truthQualified,category='used_vehicle',geography='Lagos')=>({predictedTier,truthQualified,category,geography});
  const result=evaluateOpportunityLabels([
    row('qualified_opportunity',true),row('qualified_opportunity',false),
    row('research_lead',true),row('research_lead',false),
    row('qualified_opportunity',null),row('qualified_opportunity',true,'wholesale_material','Kano')
  ]);
  assert.equal(result.overall.precision,2/3);
  assert.equal(result.overall.recall,2/3);
  assert.equal(result.overall.unknown,1);
  assert.ok(result.overall.precisionLower95<result.overall.precision);
  assert.equal(result.byCategoryAndGeography.length,2);
  assert.equal(result.byCategoryAndGeography[0].category,'used_vehicle');
});

test('empty or unlabelled evaluations never claim 98 percent',()=>{
  assert.equal(evaluateOpportunityLabels([]).overall.precision,null);
  const result=evaluateOpportunityLabels([{predictedTier:'qualified_opportunity',truthQualified:null,category:'generic',geography:'Abuja'}]);
  assert.equal(result.overall.precision,null);
  assert.equal(result.overall.unknown,1);
  assert.throws(()=>evaluateOpportunityLabels([{predictedTier:'qualified_opportunity',truthQualified:'yes',category:'generic',geography:'Abuja'}]),/Truth/);
});

test('buyer finding measures offers with verified buyers, not number of leads',()=>{
  const buyer=(buyerId,truthQualified=true)=>({buyerId,qualifiedAt:'2026-10-05T12:00:00Z',truthQualified,reachable:true,contactPermitted:true});
  const offer=(offerId,buyerEvidence=[],other={})=>({offerId,category:'used_vehicle',geography:'Lagos',submittedAt:'2026-10-01T00:00:00Z',eligible:true,buyerEvidence,...other});
  const result=evaluateBuyerFinding([
    offer('found',[buyer('one'),buyer('two'),buyer('two')]),
    offer('zero',[]),
    offer('unknown',[buyer('three',null)]),
    offer('late',[{...buyer('four'),qualifiedAt:'2026-10-17T00:00:00Z'}]),
    offer('pending',[],{submittedAt:'2026-10-20T00:00:00Z'}),
    offer('excluded',[],{eligible:false,ineligibilityReason:'unsupported item'})
  ],{asOf:'2026-10-23T00:00:00Z'});
  assert.equal(result.overall.submitted,6);
  assert.equal(result.overall.submittedMatured,5);
  assert.equal(result.overall.eligible,5);
  assert.equal(result.overall.matured,4);
  assert.equal(result.overall.found,1);
  assert.equal(result.overall.qualifiedBuyers,2);
  assert.equal(result.overall.unknown,1);
  assert.equal(result.overall.pending,1);
  assert.equal(result.overall.buyerFindingRate,0.25);
  assert.equal(result.overall.allSubmittedRate,0.2);
  assert.equal(result.overall.resolvedRate,1/3);
  assert.ok(result.overall.buyerFindingLower95<0.25);
});

test('buyer finding cannot silently count early wins, unknowns or duplicate offers',()=>{
  const row={offerId:'one',category:'generic',geography:'Abuja',submittedAt:'2026-10-01',eligible:true,buyerEvidence:[]};
  assert.equal(evaluateBuyerFinding([],{asOf:'2026-10-23'}).overall.buyerFindingRate,null);
  assert.throws(()=>evaluateBuyerFinding([row,row],{asOf:'2026-10-23'}),/duplicate/);
  assert.throws(()=>evaluateBuyerFinding([{...row,eligible:false}],{asOf:'2026-10-23'}),/ineligibility/);
  const unverified={buyerId:'buyer',qualifiedAt:'2026-10-02',truthQualified:true,reachable:false,contactPermitted:true};
  assert.equal(evaluateBuyerFinding([{...row,buyerEvidence:[unverified]}],{asOf:'2026-10-23'}).overall.found,0);
});
