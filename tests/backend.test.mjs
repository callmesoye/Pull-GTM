import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackend,configuration,validateWorkspace} from '../server/backend.js';
import {createClient} from '../server/supabase-rest.js';

const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
const payload=()=>({version:1,prospects:[{id:'1',name:'Fictional Person',title:'Founder',company:'Fictional Company',signal:'Hiring',signal_date:'2026-10-08',source_url:'https://example.test/hiring',origin:'example'}],shortlist:['1'],drafts:{},audit:[],mode:'example',identity:'Pull',context:'company',website:'',offer:'Review prospects',setup:true,rules:{roles:'Founder',industries:'',countries:'',min:'',max:'',signals:'',days:'90',evidence:true},duplicates:0});
const request=(path,body,{cookie='',origin='https://pull.example',method,accountId=cookie.match(/(?:^|;\s*)__Host-pull-(?:access=valid-|refresh=refresh-)([^;]+)/)?.[1]}={})=>new Request('https://pull.example/api/'+path,{method:method||(body===undefined?'GET':'POST'),headers:{origin,cookie,'Content-Type':'application/json',...(accountId?{'X-Pull-Account':accountId}:{})},body:body===undefined?undefined:JSON.stringify(body)});
const sessionCookie=id=>'__Host-pull-access=valid-'+id+'; __Host-pull-refresh=refresh-'+id;
const user=id=>({id,email:id+'@example.test',is_anonymous:false});

function fixture({unavailable=false,anonymous=false,confirmSignup=false,authStatus=0,refreshStatus=0,authMetadata={},beforePatch}={}) {
  const rows=new Map(),calls=[];
  const transport=async(input,options)=>{
    const u=new URL(input),body=options.body?JSON.parse(options.body):null;
    calls.push({url:u.href,...options,parsed:body});
    if(unavailable)throw new Error('provider offline');
    const token=options.headers.Authorization?.replace('Bearer ','');
    const id=token?.startsWith('valid-')?token.slice(6):null;
    if(u.pathname==='/auth/v1/user'&&authStatus)return Response.json({error_code:'over_request_rate_limit'},{status:authStatus});
    if(u.pathname==='/auth/v1/user')return id?Response.json({...user(id),is_anonymous:anonymous,...authMetadata}):Response.json({},{status:401});
    if(u.pathname==='/auth/v1/token'){
      if(body.refresh_token&&refreshStatus)return Response.json({error_code:'over_request_rate_limit'},{status:refreshStatus});
      if(!body.refresh_token&&authStatus)return Response.json({error_code:'provider_unavailable'},{status:authStatus});
      const sessionId=body.refresh_token?.replace('refresh-','')||'A';
      return Response.json({access_token:'valid-'+sessionId,refresh_token:'refresh-'+sessionId,expires_in:3600,user:user(sessionId)});
    }
    if(u.pathname==='/auth/v1/signup')return confirmSignup?Response.json(user('A')):Response.json({access_token:'valid-A',refresh_token:'refresh-A',expires_in:3600,user:user('A')});
    if(u.pathname==='/auth/v1/logout')return new Response(null,{status:204});
    if(!id)return Response.json({},{status:401});
    if(options.method==='POST'){
      if(body.user_id!==id)return Response.json({code:'42501'},{status:403});
      if(rows.has(id))return Response.json({code:'23505'},{status:409});
      rows.set(id,body);return Response.json([body],{status:201});
    }
    if(u.searchParams.get('user_id')!=='eq.'+id)return Response.json([]);
    const row=rows.get(id);
    if(options.method==='PATCH'){
      if(beforePatch)await beforePatch({id,row,rows,body});
      if(!row||u.searchParams.get('revision')!=='eq.'+row.revision)return Response.json([]);
      rows.set(id,body);return Response.json([body]);
    }
    return Response.json(row?[row]:[]);
  };
  const backend=createBackend({env,now:()=>new Date('2026-10-08T12:00:00Z'),clientFactory:(url,key,options)=>createClient(url,key,{...options,global:{...options.global,fetch:transport}})});
  return {backend,rows,calls};
}

test('An unconfigured deployment says so and does not accept cloud writes',async()=>{
  const backend=createBackend({env:{}});const r=await backend.session(request('session'));assert.deepEqual(await r.json(),{configured:false,user:null});assert.equal((await backend.workspace(request('workspace',{workspace:payload(),revision:0}))).status,503);
});
test('Local sign-out clears cookies even if backend configuration is unavailable',async()=>{
  const backend=createBackend({env:{}});const response=await backend.session(request('session',{action:'logout'},{cookie:sessionCookie('A')}));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{user:null,revocationConfirmed:false});assert.ok(response.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
});
test('Secret or service-role keys are never accepted as the application key',()=>{
  assert.equal(configuration({...env,SUPABASE_PUBLISHABLE_KEY:'sb_secret_bad'}),null);
  const key='x.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.x';assert.equal(configuration({...env,SUPABASE_PUBLISHABLE_KEY:key}),null);
});
test('Cross-site requests are rejected before reaching the provider',async()=>{
  const {backend,calls}=fixture();assert.equal((await backend.session(request('session',{action:'login',email:'a@example.test',password:'12345678'},{origin:'https://malicious.example'}))).status,403);assert.equal(calls.length,0);
});
test('Anonymous and unauthenticated visitors cannot read saved workspaces',async()=>{
  assert.equal((await fixture().backend.workspace(request('workspace'))).status,401);
  assert.equal((await fixture({anonymous:true}).backend.workspace(request('workspace',undefined,{cookie:sessionCookie('A')}))).status,401);
});
test('Login stores HttpOnly secure cookies without returning tokens to JavaScript',async()=>{
  const {backend}=fixture();const r=await backend.session(request('session',{action:'login',email:'a@example.test',password:'12345678'}));assert.equal(r.status,200);
  const body=await r.text();assert.ok(!body.includes('valid-A'));assert.ok(!body.includes('refresh-A'));const cookies=r.headers.getSetCookie();assert.equal(cookies.length,2);for(const c of cookies){assert.ok(c.includes('HttpOnly'));assert.ok(c.includes('Secure'));assert.ok(c.includes('SameSite=Lax'));assert.ok(c.startsWith('__Host-pull-'));}
});
test('Account avatar is returned only from a verified Google identity and trusted image host',async()=>{
  const good=fixture({authMetadata:{app_metadata:{provider:'google'},user_metadata:{avatar_url:'https://lh3.googleusercontent.com/photo'}}});
  assert.equal((await(await good.backend.session(request('session',undefined,{cookie:sessionCookie('A')}))).json()).user.avatar_url,'https://lh3.googleusercontent.com/photo');
  for(const authMetadata of [
    {app_metadata:{provider:'email'},user_metadata:{avatar_url:'https://lh3.googleusercontent.com/photo'}},
    {app_metadata:{provider:'google'},user_metadata:{avatar_url:'https://evil.example/photo'}},
    {app_metadata:{provider:'google'},user_metadata:{avatar_url:'https://googleusercontent.com.evil.example/photo'}}
  ]){
    const item=fixture({authMetadata});
    assert.equal((await(await item.backend.session(request('session',undefined,{cookie:sessionCookie('A')}))).json()).user.avatar_url,undefined);
  }
});
test('Email confirmation is reported without creating a signed-in session',async()=>{
  const {backend}=fixture({confirmSignup:true});const r=await backend.session(request('session',{action:'signup',email:'a@example.test',password:'12345678'}));assert.deepEqual(await r.json(),{user:null,confirmationRequired:true});assert.equal(r.headers.getSetCookie().length,0);
});
test('A refresh is verified against the auth provider before reading a workspace',async()=>{
  const {backend,calls}=fixture();const r=await backend.session(request('session',undefined,{cookie:'__Host-pull-access=expired; __Host-pull-refresh=refresh-B'}));assert.equal((await r.json()).user.id,'B');assert.ok(calls.some(c=>c.url.includes('grant_type=refresh_token')));assert.ok(calls.some(c=>c.headers.Authorization==='Bearer valid-B'));
});
test('Workspace ownership is taken from verified identity, not a submitted user ID',async()=>{
  const {backend,rows}=fixture();const r=await backend.workspace(request('workspace',{workspace:{...payload(),user_id:'B'},user_id:'B',revision:0},{cookie:sessionCookie('A')}));assert.equal(r.status,200);assert.ok(rows.has('A'));assert.ok(!rows.has('B'));assert.ok(!Object.hasOwn(rows.get('A').payload,'user_id'));
});
test('Different accounts retrieve only their own saved work',async()=>{
  const {backend}=fixture();for(const id of ['A','B'])assert.equal((await backend.workspace(request('workspace',{workspace:{...payload(),identity:id},revision:0},{cookie:sessionCookie(id)}))).status,200);
  for(const id of ['A','B']){const r=await backend.workspace(request('workspace',undefined,{cookie:sessionCookie(id)}));assert.equal((await r.json()).workspace.payload.identity,id);}
});
test('A stale revision cannot overwrite a newer cloud save',async()=>{
  const {backend,rows}=fixture();const options={cookie:sessionCookie('A')};
  assert.equal((await backend.workspace(request('workspace',{workspace:payload(),revision:0},options))).status,200);
  assert.equal((await backend.workspace(request('workspace',{workspace:payload(),revision:1},options))).status,200);
  assert.equal((await backend.workspace(request('workspace',{workspace:{...payload(),identity:'Wrong'},revision:1},options))).status,409);
  assert.equal(rows.get('A').payload.identity,'Pull');assert.equal(rows.get('A').revision,2);
  assert.equal((await backend.workspace(request('workspace',{workspace:payload(),revision:0},options))).status,409);
});
test('Replacement and cleared workspaces preserve this account\'s saved suppression ledger',async()=>{
  const {backend,rows}=fixture(),options={cookie:sessionCookie('A')};
  const original=payload();original.mode='import';original.prospects[0].email='Blocked@Example.test';original.prospects[0].suppressed=true;
  assert.equal((await backend.workspace(request('workspace',{workspace:original,revision:0},options))).status,200);
  const ledger=structuredClone(rows.get('A').payload.suppressions);
  assert.ok(ledger.includes('email:blocked@example.test'));
  const replacement=payload();replacement.mode='import';replacement.prospects[0]={...replacement.prospects[0],id:'replacement',email:'blocked@example.test',suppressed:false};replacement.shortlist=['replacement'];
  replacement.drafts={replacement:{subject:'Hello',body:'A saved draft',channel:'email',ready:true}};
  assert.equal((await backend.workspace(request('workspace',{workspace:replacement,revision:1},options))).status,200);
  assert.deepEqual(rows.get('A').payload.suppressions,ledger);
  assert.equal(rows.get('A').payload.prospects[0].suppressed,true);
  assert.deepEqual(rows.get('A').payload.shortlist,[]);
  assert.equal(rows.get('A').payload.drafts.replacement.ready,false);
  const cleared={...payload(),mode:'empty',prospects:[],shortlist:[],drafts:{},suppressions:[]};
  assert.equal((await backend.workspace(request('workspace',{workspace:cleared,revision:2},options))).status,200);
  assert.deepEqual(rows.get('A').payload.suppressions,ledger);
  assert.deepEqual(rows.get('A').payload.prospects,[]);
});
test('Saved suppression preferences do not leak into another account',async()=>{
  const {backend,rows}=fixture();
  const blocked=payload();blocked.prospects[0].email='owner@example.test';blocked.prospects[0].suppressed=true;
  assert.equal((await backend.workspace(request('workspace',{workspace:blocked,revision:0},{cookie:sessionCookie('A')}))).status,200);
  const other=payload();other.prospects[0].email='owner@example.test';
  assert.equal((await backend.workspace(request('workspace',{workspace:other,revision:0},{cookie:sessionCookie('B')}))).status,200);
  assert.deepEqual(rows.get('B').payload.suppressions,[]);
  assert.notEqual(rows.get('B').payload.prospects[0].suppressed,true);
  const response=await backend.workspace(request('workspace',undefined,{cookie:sessionCookie('B')}));
  assert.deepEqual((await response.json()).workspace.payload.suppressions,[]);
});
test('Saving a shared-inbox match never promotes another person\'s other identities into the suppression ledger',async()=>{
  const {backend,rows}=fixture(),options={cookie:sessionCookie('A')};
  const original=payload();
  Object.assign(original.prospects[0],{email:'shared@example.test',profile_url:'https://x.com/FirstPerson',suppressed:true,suppression_origin:'explicit'});
  original.prospects.push({...original.prospects[0],id:'2',name:'Fictional Other Person',company:'Fictional Other Company',profile_url:'https://x.com/OtherPerson',suppressed:false,suppression_origin:'matched'});
  assert.equal((await backend.workspace(request('workspace',{workspace:original,revision:0},options))).status,200);
  const ledger=structuredClone(rows.get('A').payload.suppressions);
  assert.equal(rows.get('A').payload.prospects[1].suppression_origin,'matched');
  assert.ok(!ledger.includes('profile:https://x.com/otherperson'));
  assert.ok(!ledger.includes('entity:fictional other person|fictional other company'));
  const next=structuredClone(rows.get('A').payload);delete next.suppressions;
  assert.equal((await backend.workspace(request('workspace',{workspace:next,revision:1},options))).status,200);
  assert.deepEqual(rows.get('A').payload.suppressions,ledger);
  const changedContact=structuredClone(rows.get('A').payload);changedContact.prospects[1].email='other-person@example.test';
  assert.equal((await backend.workspace(request('workspace',{workspace:changedContact,revision:2},options))).status,200);
  assert.equal(rows.get('A').payload.prospects[1].suppressed,false);
  assert.equal(rows.get('A').payload.prospects[0].suppressed,true);
  assert.deepEqual(rows.get('A').payload.suppressions,ledger);
  const resaved=structuredClone(rows.get('A').payload);
  assert.equal((await backend.workspace(request('workspace',{workspace:resaved,revision:3},options))).status,200);
  assert.equal(rows.get('A').payload.prospects[1].suppressed,false);
  assert.deepEqual(rows.get('A').payload.suppressions,ledger);
});
test('A material cloud record change invalidates an older client\'s retained shortlist and prepared flag',async()=>{
  const {backend,rows}=fixture(),options={cookie:sessionCookie('A')};
  const original=payload();original.drafts={'1':{subject:'Hello',body:'A reviewed message',channel:'email',ready:true}};
  assert.equal((await backend.workspace(request('workspace',{workspace:original,revision:0},options))).status,200);
  assert.deepEqual(rows.get('A').payload.shortlist,['1']);
  assert.equal(rows.get('A').payload.drafts['1'].ready,true);
  const changed=structuredClone(original);changed.prospects[0].company='Different Private Company';
  assert.equal((await backend.workspace(request('workspace',{workspace:changed,revision:1},options))).status,200);
  assert.deepEqual(rows.get('A').payload.shortlist,[]);
  assert.equal(rows.get('A').payload.drafts['1'].ready,false);
  assert.equal(rows.get('A').payload.drafts['1'].body,'A reviewed message');
});
test('A save racing after the suppression-preservation read still fails its final revision comparison',async()=>{
  const {backend,rows}=fixture({beforePatch:({row})=>{row.revision++;row.payload.identity='Concurrent save';row.payload.suppressions=['email:newer@example.test'];}});
  const options={cookie:sessionCookie('A')};
  assert.equal((await backend.workspace(request('workspace',{workspace:payload(),revision:0},options))).status,200);
  const response=await backend.workspace(request('workspace',{workspace:{...payload(),identity:'Stale save'},revision:1},options));
  assert.equal(response.status,409);
  assert.equal(rows.get('A').revision,2);
  assert.equal(rows.get('A').payload.identity,'Concurrent save');
  assert.deepEqual(rows.get('A').payload.suppressions,['email:newer@example.test']);
});
test('Malformed references and missing revisions fail without writing data',async()=>{
  const {backend,rows}=fixture();for(const body of [{workspace:{...payload(),shortlist:['missing']},revision:0},{workspace:payload()},{workspace:null,revision:0}])assert.equal((await backend.workspace(request('workspace',body,{cookie:sessionCookie('A')}))).status,400);assert.equal(rows.size,0);
  assert.throws(()=>validateWorkspace({...payload(),prospects:[{id:'1'},{id:'1'}]}));
  assert.throws(()=>validateWorkspace({...payload(),drafts:{'1':null}}));
  assert.throws(()=>validateWorkspace({...payload(),audit:[null]}));
});
test('Provider failures return an honest retryable error and no private data',async()=>{
  const {backend}=fixture({unavailable:true});const r=await backend.workspace(request('workspace',undefined,{cookie:sessionCookie('A')}));assert.equal(r.status,503);assert.ok(!(await r.text()).includes('valid-A'));
});
test('Logout revokes the local provider session and clears both browser cookies',async()=>{
  const {backend,calls}=fixture();const r=await backend.session(request('session',{action:'logout'},{cookie:sessionCookie('A')}));assert.equal(r.status,200);assert.ok(calls.some(c=>c.url.endsWith('/logout?scope=local')));assert.ok(r.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
});

test('A stale account header cannot read or overwrite another account after a cookie switch',async()=>{
  const {backend,rows,calls}=fixture();
  const options={cookie:sessionCookie('B')};
  assert.equal((await backend.workspace(request('workspace',{workspace:{...payload(),identity:'B private workspace'},revision:0},options))).status,200);
  const before=structuredClone(rows.get('B'));
  const start=calls.length;
  for(const body of [undefined,{workspace:{...payload(),identity:'A accidentally uploaded'},revision:1}]){
    const response=await backend.workspace(request('workspace',body,{...options,accountId:'A'}));
    assert.equal(response.status,409);
    assert.equal((await response.json()).code,'ACCOUNT_CHANGED');
  }
  assert.deepEqual(rows.get('B'),before);
  assert.ok(calls.slice(start).every(c=>!c.url.includes('/rest/v1/')));
});

test('A stale account header cannot sign out the newly selected account',async()=>{
  const {backend,calls}=fixture();
  const response=await backend.session(request('session',{action:'logout'},{cookie:sessionCookie('B'),accountId:'A'}));
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'ACCOUNT_CHANGED');
  assert.equal(response.headers.getSetCookie().length,0);
  assert.ok(!calls.some(c=>c.url.includes('/logout')));
});

test('An expired access cookie does not bypass the account check during logout',async()=>{
  const {backend,calls}=fixture();
  const response=await backend.session(request('session',{action:'logout'},{cookie:'__Host-pull-refresh=refresh-B',accountId:'A'}));
  assert.equal(response.status,409);
  assert.equal((await response.json()).code,'ACCOUNT_CHANGED');
  assert.ok(!response.headers.getSetCookie().some(c=>c.includes('Max-Age=0')));
  assert.ok(!calls.some(c=>c.url.includes('/logout')));
});

test('A provider outage still clears the browser session on explicit sign out',async()=>{
  const {backend}=fixture({unavailable:true});
  const response=await backend.session(request('session',{action:'logout'},{cookie:sessionCookie('A')}));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{user:null,revocationConfirmed:false});
  const cookies=response.headers.getSetCookie();
  assert.equal(cookies.length,2);
  assert.ok(cookies.every(c=>c.includes('Max-Age=0')&&c.includes('HttpOnly')&&c.includes('Secure')));
});


test('Temporary authentication limits do not sign out the browser or reach its data',async()=>{
  for(const options of [{authStatus:429},{refreshStatus:429},{refreshStatus:503}]){
    const {backend,calls}=fixture(options);
    const response=await backend.workspace(request('workspace',undefined,{cookie:'__Host-pull-access=expired; __Host-pull-refresh=refresh-A',accountId:'A'}));
    assert.equal(response.status,503);assert.equal(response.headers.getSetCookie().length,0);
    assert.ok(!calls.some(c=>c.url.includes('/rest/v1/')));
  }
});
test('Provider outage and rate limits give honest login errors',async()=>{
  for(const [authStatus,status] of [[503,503],[429,429]]){
    const {backend}=fixture({authStatus});const response=await backend.session(request('session',{action:'login',email:'a@example.test',password:'12345678'}));
    assert.equal(response.status,status);assert.equal(response.headers.getSetCookie().length,0);
    assert.ok(!(await response.text()).includes('Check your details'));
  }
});
test('Malformed backup values cannot become cloud work that crashes the interface',()=>{
  for(const changes of [
    {prospects:[{id:'1',name:{}}]},
    {prospects:[{id:'1',name:'Person',conflicts:'title'}]},
    {prospects:[{id:'constructor',name:'Person'}],shortlist:[]},
    {setup:'false'}, {duplicates:-1},
    {rules:{...payload().rules,min:'100',max:'10'}},
    {rules:{...payload().rules,days:'invalid'}}
  ])assert.throws(()=>validateWorkspace({...payload(),...changes}));
  const original=payload(),validated=validateWorkspace(original);validated.prospects[0].name='Changed';
  assert.equal(original.prospects[0].name,'Fictional Person');assert.equal(validated.remember,false);
});
