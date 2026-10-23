import test from 'node:test';
import assert from 'node:assert/strict';
import {renderBuyerReview} from '../dist/buyer-review-ui.js';
import {renderResearchResults} from '../dist/intelligence-ui.js';
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('Source review controls require a persisted review capability and never present reports as verified buyers',()=>{
  const result={type:'buyer_research',run_id:'run',opportunities:[{title:'<script>bad</script>',source_url:'https://requests.example/item',missing:[]}]};
  assert.ok(!renderResearchResults([result],1,e).includes('data-buyer-review'));
  const html=renderResearchResults([{...result,reviewAvailable:true}],1,e);
  assert.match(html,/data-buyer-review="1:0:0"/);assert.ok(!html.includes('<script>'));
});
test('Review and correction history escapes seller text and keeps self-report labels',()=>{
  const html=renderBuyerReview({context:{candidate:{title:'Request',source_url:'javascript:alert(1)'},offer:{version:1,fields:{product:'C300',location:'Lagos'}},
    notice:'Seller report only',review:{revision:1,answers:{},note:'<script>bad</script>',assessment:{state:'needs_more_checks'}},
    outcomes:[{id:'old',kind:'sale',note:'Original report',reportedAt:'2026-10-23'},{id:'new',kind:'correction',note:'Sale was not completed.',supersedesId:'old',reportedAt:'2026-10-23'}]}},e);
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));
  assert.match(html,/Sale reported · corrected/);assert.match(html,/does not send a message or verify a sale/);
});
