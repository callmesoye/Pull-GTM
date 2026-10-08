import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackend,configuration,validateWorkspace} from '../server/backend.js';
import {createClient} from '../server/supabase-rest.js';

const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
const payload=()=>({version:1,prospects:[{id:'1',name:'Fictional Person'}],shortlist:['1'],drafts:{},audit:[],mode:'example',identity:'Pull',context:'company',website:'',offer:'Review prospects',setup:true,rules:{roles:'Founder',industries:'',countries:'',min:'',max:'',signals:'',days:'90',evidence:true},duplicates:0});
const request=(path,body,{cookie='',origin='https://pull.example',method,accountId=cookie.match(/(?:^|;\s*)__Host-pull-(?:access=valid-|refresh=refresh-)([^;]+)/)?.[1]}={})=>new Request('https://pull.example/api/'+path,{method:method||(body===undefined?'GET':'POST'),headers:{origin,cookie,'Content-Type':'application/json',...(accountId?{'X-Pull-Account':accountId}:{})},body:body===undefined?undefined:JSON.stringify(body)});
const sessionCookie=id=>'__Host-pull-access=valid-'+id+'; __Host-pull-refresh=refresh-'+id;
const user=id=>({id,email:id+'@example.test',is_anonymous:false});

function fixture({unavailable=false,anonymous=false,confirmSignup=false}={}) {
  const rows=new Map(),calls=[];
  const transport=async(input,options)=>{
    const u=new URL(input),body=options.body?JSON.parse(options.body):null;
    calls.push({url:u.href,...options,parsed:body});
    if(unavailable)throw new Error('provider offline');
    const token=options.headers.Authorization?.replace('Bearer ','');
    const id=token?.startsWith('valid-')?token.slice(6):null;
    if(u.pathname==='/auth/v1/user')return id?Response.json({...user(id),is_anonymous:anonymous}):Response.json({},{status:401});
    if(u.pathname==='/auth/v1/token'){
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
