import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProductFeedbackHandler} from '../server/product-feedback.js';
import {createProductAdminHandler} from '../server/product-admin.js';
import {renderProductFeedback,renderProductAdmin} from '../dist/product-feedback.js';

const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const request=(path,{method='POST',origin='https://pull.example',cookie='__Host-pull-access=test-token',body={kind:'bug',message:'The test screen did not load.'}}={})=>new Request('https://pull.example/api/'+path,{
  method,headers:{origin,cookie,'content-type':'application/json'},...(method==='GET'||method==='DELETE'?{}:{body:JSON.stringify(body)})
});
const dbFixture=({used=[],insertError=null,role=null,entries=[]}={})=>{
  const record={inserted:[],membershipChecks:0};
  const db={from:table=>{
    if(table==='pull_admin_members')return {
      select:()=>({eq:()=>({maybeSingle:async()=>{record.membershipChecks++;return {data:role?{role}:null,error:null};}})})
    };
    assert.equal(table,'pull_product_feedback');
    const query={
      select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,
      insert:data=>{record.inserted.push(data);return query;},
      all:async()=>({data:entries.length?entries:used.map(slot=>({slot})),error:null}),
      maybeSingle:async()=>insertError?{data:null,error:{code:insertError}}:{data:{id:'sample-id'},error:null}
    };
    return query;
  }};
  const deps={env,clientFactory:()=>({auth:{getUser:async()=>({data:{user:{id:'user-1',is_anonymous:false}},error:null})},...db})};
  return {deps,record};
};
const escape=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

test('feedback rejects unsupported methods and origin before opening a user session',async()=>{
  const {deps,record}=dbFixture();
  assert.equal((await createProductFeedbackHandler(deps)(request('product-feedback',{method:'DELETE'}))).status,405);
  assert.equal((await createProductFeedbackHandler(deps)(request('product-feedback',{origin:'https://malicious.test'}))).status,403);
  assert.equal(record.inserted.length,0);
});

test('feedback uses the lowest free database-constrained daily slot and only accepted fields',async()=>{
  const {deps,record}=dbFixture({used:[1,3]});
  const response=await createProductFeedbackHandler(deps)(request('product-feedback'));
  assert.equal(response.status,201);
  assert.deepEqual(record.inserted,[{user_id:'user-1',kind:'bug',message:'The test screen did not load.',slot:2}]);
  assert.deepEqual(await response.json(),{received:true});
});

test('feedback enforces the UTC daily bound and returns a clear limit',async()=>{
  const {deps,record}=dbFixture({used:[1,2,3,4,5]});
  const response=await createProductFeedbackHandler(deps)(request('product-feedback'));
  assert.equal(response.status,429);
  assert.match((await response.json()).error,/Daily feedback limit/);
  assert.equal(record.inserted.length,0);
});

test('feedback handles concurrent slot conflicts without duplicating acknowledged submissions',async()=>{
  const {deps}=dbFixture({used:[1],insertError:'23505'});
  const response=await createProductFeedbackHandler(deps)(request('product-feedback'));
  assert.equal(response.status,409);
  assert.deepEqual((await response.json()).received,undefined);
});

test('feedback requires complete supported text and signed-in identity',async()=>{
  const {deps}=dbFixture();
  const handler=createProductFeedbackHandler(deps);
  assert.equal((await handler(request('product-feedback',{body:{kind:'other',message:'Some feedback is provided'}}))).status,400);
  assert.equal((await handler(request('product-feedback',{body:{kind:'bug',message:'short'}}))).status,400);
  assert.equal((await handler(request('product-feedback',{cookie:''}))).status,401);
});

test('admin route fails closed for unapproved users and rejects mutating methods',async()=>{
  const {deps,record}=dbFixture();
  const handler=createProductAdminHandler(deps);
  assert.equal((await handler(request('product-admin',{method:'POST'}))).status,405);
  assert.equal((await handler(request('product-admin',{method:'GET'}))).status,403);
  assert.equal(record.membershipChecks,1);
});

test('admin returns a strictly bounded recent sample, never an invented total',async()=>{
  const sample=[{id:'feedback-1',kind:'suggestion',message:'Could PULL make this easier?',created_at:'2026-10-22T08:00:00Z'}];
  const {deps}=dbFixture({role:'owner',entries:sample});
  const response=await createProductAdminHandler(deps)(request('product-admin',{method:'GET'}));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.role,'owner');assert.equal(data.entries.length,1);
  assert.equal(data.categories.suggestion,1);
  assert.equal(data.is_total,false);assert.equal(data.scope,'latest_40');
  assert.equal(data.entries[0].user_id,undefined);
});

test('feedback and staff views escape untrusted messages and explain restricted access',()=>{
  assert.doesNotMatch(renderProductFeedback({signedIn:false,escape}),/id="product-feedback-form"/);
  assert.match(renderProductFeedback({signedIn:true,escape}),/id="product-feedback-form"/);
  const dangerous='<img src=x onerror=alert(1)>';
  const html=renderProductAdmin({signedIn:true,loaded:true,error:'',entries:[{kind:'bug',message:dangerous,created_at:'2026-10-22T08:00:00Z'}],categories:{bug:1},escape});
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
  assert.match(html,/recent sample/i);
  assert.match(renderProductAdmin({signedIn:true,loaded:false,error:'Not authorized.',escape}),/Not authorized/);
  const retry=renderProductFeedback({signedIn:true,draft:'<script>untrusted</script>',kind:'suggestion',error:'Try again',escape});
  assert.match(retry,/&lt;script&gt;untrusted&lt;\/script&gt;/);
  assert.doesNotMatch(retry,/<script>untrusted<\/script>/);
  assert.match(retry,/value="suggestion" selected/);
  assert.match(retry,/Try again/);
});

test('feedback migration provides RLS, column restrictions, and hard five-slot quota',()=>{
  const sql=readFileSync(new URL('../database/product-feedback.sql',import.meta.url),'utf8');
  assert.match(sql,/enable row level security/);
  assert.match(sql,/unique\(user_id,feedback_day,slot\)/);
  assert.match(sql,/check \(slot between 1 and 5\)/);
  assert.match(sql,/grant insert \(user_id,kind,message,slot\)/);
  assert.doesNotMatch(sql,/grant insert \(.*feedback_day/);
  assert.match(sql,/staff\.user_id=\(select auth\.uid\(\)\)/);
  assert.doesNotMatch(sql,/service_role/i);
});
