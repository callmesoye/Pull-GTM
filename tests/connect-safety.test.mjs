import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectExperience,MCP_ENDPOINT} from '../dist/connect.js';
const token='pull_agent_'+'z'.repeat(43);
const metadata={configured:true,endpoint:MCP_ENDPOINT,tokens:[]};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

async function exercise(request,run){
 const originals=new Map(['document','window','FormData'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const listeners=new Map(),calls=[];
 globalThis.document={addEventListener(name,callback){listeners.set(name,callback);}};
 globalThis.window={confirm:()=>true};
 globalThis.FormData=class {constructor(form){this.values=form.values;}get(key){return this.values[key];}};
 let cloud={user:{id:'A'},verified:true},epoch=0,view='connect',html='',renders=0;
 const api=createConnectExperience({getCloud:()=>cloud,getWorkspace:()=>({}),request:async(...args)=>{calls.push(args);return request(...args);},getAccountTicket:()=>({id:cloud.user.id,epoch}),isAccountCurrent:ticket=>ticket.id===cloud.user?.id&&ticket.epoch===epoch,navigate(){},toast(){},account(){},render(){paint();}});
 function paint(){if(++renders>40)throw new Error('Unexpected render loop');html=view==='connect'?api.renderConnect():api.renderSupport();api.afterRender(view);}
 const harness={api,calls,html:()=>html,renders:()=>renders,paint,show(next){if(view==='connect'&&next!=='connect')api.leave();view=next;paint();},switchAccount(id){cloud={user:{id},verified:true};epoch++;api.accountChanged();paint();},submit(values={label:'My tool',permission:'read'}){return listeners.get('submit')({preventDefault(){},target:{id:'connect-create',values}});},click(action){const target={dataset:{connectAction:action},closest:()=>({})};return listeners.get('click')({target:{closest:()=>target}});},select(client){const target={dataset:{connectClient:client},closest:()=>({})};return listeners.get('click')({target:{closest:()=>target}});}};
 try{paint();await settle();await run(harness);}
 finally{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

test('Failed agent metadata renders one error and requires explicit retry',async()=>{
 let failed=true;
 await exercise(async()=>{if(failed)throw new Error('Account access is unavailable');return metadata;},async h=>{
  assert.equal(h.calls.length,1);assert.match(h.html(),/Account access is unavailable/);
  h.paint();await settle();assert.equal(h.calls.length,1);
  await h.submit();assert.equal(h.calls.length,1,'Metadata failure cannot be bypassed by submitting');
  failed=false;await h.click('refresh');assert.equal(h.calls.length,2);assert.match(h.html(),/Your account is ready/);
 });
});

test('A create finishing after navigation never restores the displayed key, and duplicate submits are blocked',async()=>{
 const created=deferred();let activeKeys=[];
 await exercise(async(_path,body)=>{if(body?.action==='create')return created.promise;return {...metadata,tokens:activeKeys};},async h=>{
  const pending=h.submit();await h.submit();assert.equal(h.calls.filter(([,body])=>body?.action==='create').length,1);
  await h.select('cursor');assert.match(h.html(),/Claude Code setup/,'Client changes are blocked during creation');
  h.show('support');activeKeys=[{id:'key',label:'My tool',scopes:['workspace:read'],expires_at:'2026-11-01'}];created.resolve({id:'key',token});await pending;
  h.show('connect');await settle();assert.ok(!h.html().includes(token));assert.match(h.html(),/My tool/,'The active key remains manageable after its response is discarded');
 });
});

test('Displayed secrets clear immediately when changing accounts or leaving Connect',async()=>{
 await exercise(async(_path,body)=>body?.action==='create'?{id:'key',token}:metadata,async h=>{
  await h.submit();assert.ok(h.html().includes(token));
  h.switchAccount('B');await settle();assert.ok(!h.html().includes(token));
  await h.submit();assert.ok(h.html().includes(token));
  h.show('support');h.show('connect');await settle();assert.ok(!h.html().includes(token));
 });
});

test('Old metadata cannot overwrite a new account or release its loading guard',async()=>{
 const old=deferred(),next=deferred();
 await exercise(async(_path,_body,account)=>account==='A'?old.promise:next.promise,async h=>{
  h.switchAccount('B');old.resolve({...metadata,tokens:[{id:'private',label:'Private A key'}]});await settle();
  assert.ok(!h.html().includes('Private A key'));h.paint();await settle();assert.equal(h.calls.length,2,'The newer metadata request stays locked');
  next.resolve({...metadata,tokens:[{id:'new',label:'B connection'}]});await settle();assert.match(h.html(),/B connection/);assert.ok(!h.html().includes('Private A key'));
 });
});

test('A stale create cannot expose another account secret or release its in-flight create lock',async()=>{
 const old=deferred(),next=deferred();
 await exercise(async(_path,body,account)=>body?.action==='create'?(account==='A'?old.promise:next.promise):metadata,async h=>{
  const first=h.submit();h.switchAccount('B');await settle();const second=h.submit();
  old.resolve({id:'old',token});await first;assert.ok(!h.html().includes(token));await h.submit();
  assert.equal(h.calls.filter(([,body,account])=>body?.action==='create'&&account==='B').length,1);
  const nextToken='pull_agent_'+'y'.repeat(43);next.resolve({id:'new',token:nextToken});await second;
  assert.ok(h.html().includes(nextToken));assert.ok(!h.html().includes(token));
 });
});

test('Metadata failure after key creation preserves its one-time display and prevents another creation',async()=>{
 let reads=0;
 await exercise(async(_path,body)=>{if(body?.action==='create')return {id:'key',token};if(++reads>1)throw new Error('Listing is temporarily unavailable');return metadata;},async h=>{
  await h.submit();assert.ok(h.html().includes(token));assert.match(h.html(),/Listing is temporarily unavailable/);
  await h.submit();assert.equal(h.calls.filter(([,body])=>body?.action==='create').length,1);
  h.paint();await settle();assert.equal(reads,2,'Failed listing does not keep retrying');
 });
});

test('Unknown create results require a metadata refresh before another key can be requested',async()=>{
 await exercise(async(_path,body)=>{if(body?.action==='create')throw new Error('The response was interrupted');return metadata;},async h=>{
  await h.submit();await h.submit();assert.equal(h.calls.filter(([,body])=>body?.action==='create').length,1);
  assert.match(h.html(),/The response was interrupted/);await h.click('refresh');await h.submit();assert.equal(h.calls.filter(([,body])=>body?.action==='create').length,2);
 });
});

test('A failed test clears an earlier success and a late test cannot restore it after navigation',async()=>{
 let checks=0;const late=deferred();
 await exercise(async(_path,body)=>{if(body?.action==='create')return {id:'key',token};if(body?.action==='test'){checks++;if(checks===1)return {reachable:true,tools:[{name:'summary'}]};if(checks===2)throw new Error('Access was revoked');return late.promise;}return metadata;},async h=>{
  await h.submit();await h.click('test');assert.match(h.html(),/Server check passed/);
  await h.click('test');assert.ok(!h.html().includes('Server check passed'));assert.match(h.html(),/Access was revoked/);
  const pending=h.click('test');h.show('support');late.resolve({reachable:true,tools:[{name:'summary'}]});await pending;
  h.show('connect');await settle();assert.ok(!h.html().includes('Server check passed'));assert.ok(!h.html().includes(token));
 });
});
