import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createBuyerRequestsWorkspace,renderBuyerRequestsWorkspace} from '../dist/buyer-requests-workspace.js';
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function fixture(respond){
  const handlers=new Map(),requests=[];let owner='buyer-A',generation=1,opened=false,html='',values={};
  const document={addEventListener(name,fn){handlers.set(name,fn);},removeEventListener(name){handlers.delete(name);}};
  const ui=createBuyerRequestsWorkspace({document,request:async(...args)=>{requests.push(args);return respond(...args);},ticket:()=>({id:owner,generation}),current:t=>t.id===owner&&t.generation===generation,signedIn:()=>Boolean(owner),signIn(){},modal(_title,content){opened=true;html=content;},isOpen:()=>opened,escape:e,uuid:randomUUID,readForm:()=>({get:key=>values[key]??null})});
  return {ui,requests,get html(){return html;},changeOwner(id){owner=id;generation++;ui.leave();},close(){opened=false;ui.leave();},values(v){values=v;},
    input:async(name,value,checked=false)=>handlers.get('input')({target:{name,value,checked,closest:()=>({id:'buyer-request-form'})}}),
    submit:()=>handlers.get('submit')({target:{id:'buyer-request-form'},preventDefault(){}}),click:dataset=>handlers.get('click')({target:{closest:()=>({dataset})}})};
}
const payload={product:'Office cleaning',location:'Abuja',category:'service',requirements:{},budget:null,validForDays:7,status:'open',discoverable:false,contactAllowed:false};

test('Buyer request forms default to private with separate contact permission and escape untrusted records',()=>{
  const html=renderBuyerRequestsWorkspace({mode:'mine',records:[{id:'row',revision:1,payload:{...payload,product:'<script>bad</script>'},expires_at:'2026-11-01'}]},e);
  assert.ok(!html.includes('<script>'));assert.ok(!/name="discoverable"[^>]*checked/.test(html));assert.ok(!/name="contactAllowed"[^>]*checked/.test(html));
  assert.match(html,/aria-describedby="request-sharing-help"/);assert.match(html,/does not send a message/);
});
test('Buying requests preserve a failed save and retry with stable request and idempotency IDs, reading actual form values',async()=>{
  let fail=true;
  const f=fixture(async(path,body)=>{
    if(!body)return {requests:[]};
    if(fail){fail=false;throw Error('Connection lost after save');}
    return {request:{id:body.requestId,revision:1,payload:body.payload,expires_at:'2026-11-01'}};
  });
  await f.ui.openMine();f.values({product:'Office cleaning',location:'Abuja',category:'service',validForDays:'7',status:'open',budgetMax:'',discoverable:'on'});
  await f.submit();assert.match(f.html,/Connection lost after save/);assert.match(f.html,/Office cleaning/);
  await f.submit();const saves=f.requests.filter(([,body])=>body);
  assert.equal(saves[0][1].requestId,saves[1][1].requestId);assert.equal(saves[0][1].requestKey,saves[1][1].requestKey);
  assert.equal(saves[1][1].payload.discoverable,true);assert.equal(saves[1][1].payload.contactAllowed,false);assert.equal(saves[1][1].payload.category,'service');assert.match(f.html,/was saved/);
});
test('Pending saves disable the form and cannot be submitted twice',async()=>{
  let finish;
  const f=fixture(async(_path,body)=>body?new Promise(resolve=>{finish=()=>resolve({request:{id:body.requestId,revision:1,payload:body.payload,expires_at:'2026-11-01'}});}):{requests:[]});
  await f.ui.openMine();f.values({product:'Rice',location:'Kano'});const pending=f.submit();
  assert.match(f.html,/<fieldset disabled/);await f.submit();assert.equal(f.requests.filter(([,b])=>b).length,1);finish();await pending;
});
test('Late private requests cannot repaint a closed dialog or a different account',async()=>{
  for(const close of [f=>f.close(),f=>f.changeOwner('buyer-B')]){
    let finish;const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=f.ui.openMine();close(f);finish({requests:[{id:'secret',revision:1,payload:{...payload,product:'Private secret'},expires_at:'2026-11-01'}]});await pending;
    assert.ok(!f.html.includes('Private secret'));
  }
});
test('Matching uses only the saved offer reference and presents a genuine empty result without placeholder buyers',async()=>{
  const f=fixture(async(_path,body)=>({matches:[],notice:'Buyer-submitted requests, not independently verified.',offerReference:{id:body.offerId,version:body.offerVersion}}));
  await f.ui.openMatches({id:'saved-offer',version:3,fields:{product:'C300',location:'Lagos'}});
  assert.deepEqual(f.requests[0][1],{action:'match',offerId:'saved-offer',offerVersion:3});
  assert.match(f.html,/No shared requests matched/);assert.match(f.html,/web research remains available/);
});
test('Closing sends only a canonical reference, retries stably and preserves an unfinished edit',async()=>{
  const row={id:randomUUID(),revision:101,payload:{...payload,discoverable:true,contactAllowed:true},expires_at:'2026-11-01'};
  let fail=true;
  const f=fixture(async(_path,body)=>{
    if(!body)return {requests:[row]};
    if(fail){fail=false;throw Error('Connection lost');}
    return {request:{...row,revision:102,payload:{...row.payload,status:'closed',discoverable:false,contactAllowed:false}}};
  });
  await f.ui.openMine();await f.click({buyerRequestEdit:row.id});await f.input('location','An unfinished location edit');
  await f.click({buyerRequestClose:row.id});assert.match(f.html,/Connection lost/);
  await f.click({buyerRequestClose:row.id});
  const writes=f.requests.filter(([,body])=>body);assert.equal(writes[0][1].requestKey,writes[1][1].requestKey);
  assert.equal(writes[1][1].action,'withdraw');assert.equal(writes[1][1].expectedRevision,101);assert.equal(writes[1][1].payload,undefined);
  assert.match(f.html,/Request closed/);assert.match(f.html,/An unfinished location edit/);
  assert.ok(!/name="discoverable"[^>]*checked/.test(f.html));assert.ok(!/data-buyer-request-close=/.test(f.html));
});
