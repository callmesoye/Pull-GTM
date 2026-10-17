import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceLedger,intelligenceContract,validateResearchLinks} from '../server/intelligence-policy.js';
test('Evidence ledger excludes unsafe links, deduplicates and bounds private context',()=>{
 const ledger=evidenceLedger({reviewed:[{name:'A',source_url:'https://example.com/a',email:'private@test.example'},{source_url:'javascript:alert(1)'},{source_url:'https://secret:password@example.com'}]},[{people:[{name:'Duplicate',source_url:'https://example.com/a'},...Array.from({length:80},(_,i)=>({source_url:'https://example.com/'+i,source_excerpt:'x'.repeat(2000)}))]}]);
 assert.equal(ledger.length,58);assert.equal(ledger[0].name,'A');assert.ok(!JSON.stringify(ledger).includes('private@test.example'));assert.equal(ledger[1].excerpt.length,1200);
});
test('Research summaries cannot introduce fabricated contact or citation URLs',()=>{
 const ledger=[{url:'https://example.com/profile'}];
 assert.equal(validateResearchLinks('Source: https://example.com/profile.',ledger),true);
 assert.equal(validateResearchLinks('[Source](https://example.com/profile)',ledger),true);
 assert.equal(validateResearchLinks('Contact https://invented.example/person',ledger),false);
});
test('Pull contract exposes only actual capabilities and distinguishes facts from intent',()=>{
 const contract=intelligenceContract({context:{},capabilities:['review_workspace']});
 assert.deepEqual(contract.capabilities,['review_workspace']);assert.match(contract.rules.join(' '),/not confirmed buying intent/);assert.match(contract.rules.join(' '),/does not grant access/);
});
