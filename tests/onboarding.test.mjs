import test from 'node:test';
import assert from 'node:assert/strict';
import {accountConfirmation,onboardingForm,applyOnboarding} from '../dist/onboarding.js';

const existing=()=>({identity:'Existing',offer:'Design',context:'company',persona:'business',setup:false,prospects:[{id:'kept'}],shortlist:['kept'],drafts:{kept:{body:'Keep me'}},rules:{roles:'Founder',industries:'Design',countries:'Canada',signals:'Hiring',days:'90',evidence:true}});
const values={mode:'commerce',identity:'My shop',offer:'Fresh produce',roles:'Restaurant owners',industries:'Hospitality',countries:'Nigeria'};
test('Commerce setup preserves existing prospect data and qualification settings',()=>{
  const original=existing(),result=applyOnboarding(original,values);
  assert.equal(result.persona,'trade');assert.equal(result.setup,true);
  for(const key of ['prospects','shortlist','drafts'])assert.deepEqual(result[key],original[key]);
  assert.equal(result.rules.evidence,true);assert.equal(result.rules.signals,'Hiring');assert.equal(original.identity,'Existing');
});
test('Professional career setup supports personal context and worldwide scope',()=>{
  const result=applyOnboarding(existing(),{...values,mode:'professional',persona:'career',countries:''});
  assert.equal(result.persona,'career');assert.equal(result.context,'personal');assert.equal(result.rules.countries,'');
});
test('Unknown modes, empty briefs and oversized fields cannot complete onboarding',()=>{
  for(const change of [{mode:'government'},{identity:'  '},{offer:''},{roles:'x'.repeat(301)}])assert.throws(()=>applyOnboarding(existing(),{...values,...change}));
});
test('Account confirmation and setup escape supplied values and separate pending verification',()=>{
  assert.ok(!accountConfirmation('<script>bad</script>').includes('<script>'));
  assert.match(accountConfirmation('person@example.test',{pending:true}),/Check your inbox/);
  assert.match(accountConfirmation('person@example.test',{pending:true}),/welcome-signin/);
  assert.match(accountConfirmation('person@example.test'),/welcome-continue/);
  assert.ok(!onboardingForm({...existing(),identity:'"><script>bad</script>'},'commerce').includes('<script>'));
});
