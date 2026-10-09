import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMCPHandler,hashAgentToken} from '../supabase/functions/pull-mcp/handler.js';
import {createAgentStore} from '../supabase/functions/pull-mcp/store.js';

const now=new Date('2026-10-08T12:00:00Z');
const raw='pull_agent_'+'A'.repeat(43);
const prospect=(id='A-good',extra={})=>({id,name:'Example Owner',title:'Founder',company:'Example Company',country:'Nigeria',industry:'Retail',signal:'Expanding locations',signal_date:'2026-10-07',source_url:'https://example.test/supplied-evidence',email:'private@example.test',origin:'import',...extra});
const payload=()=>({version:1,identity:'Example Business',context:'company',offer:'Inventory support',website:'https://example.test',prospects:[prospect(),prospect('A-unreviewed'),prospect('A-excluded',{title:'Student'}),prospect('A-stale',{signal_date:'2020-01-01'}),prospect('A-suppressed',{suppressed:true})],shortlist:['A-good','A-excluded','A-stale','A-suppressed'],drafts:{},audit:[],mode:'import',rules:{roles:'Founder',industries:'Retail',countries:'Nigeria',min:'',max:'',signals:'',evidence:true,days:'90'}});
const rpc=(method,params={},id=1)=>({jsonrpc:'2.0',id,method,params});
const request=(body,{method='POST',origin,authorization='Bearer '+raw,accept='application/json, text/event-stream',type='application/json',protocol}={})=>new Request('https://project.supabase.co/functions/v1/pull-mcp',{method,headers:{Authorization:authorization,Accept:accept,'Content-Type':type,...(origin===undefined?{}:{Origin:origin}),...(protocol?{'MCP-Protocol-Version':protocol}:{})},body:method==='POST'?(typeof body==='string'?body:JSON.stringify(body)):undefined});
async function fixture({scopes=['workspace:read','drafts:write'],revoked=false,expired=false,limited=false}={}){
  const tokenHash=await hashAgentToken(raw);
  const token={id:'tokenA',user_id:'ownerA',token_hash:tokenHash,scopes,expires_at:expired?'2026-10-07T12:00:00Z':'2026-11-01T12:00:00Z',revoked_at:revoked?'2026-10-08T10:00:00Z':null};
  const rows=new Map([['ownerA',{user_id:'ownerA',payload:payload(),revision:3,updated_at:now.toISOString()}],['ownerB',{user_id:'ownerB',payload:{...payload(),identity:'Other private business'},revision:5,updated_at:now.toISOString()}]]);
  const calls=[];
  const store={
    authenticate:async hash=>{calls.push(['auth',hash]);return hash===tokenHash?(limited?{limited:true}:structuredClone(token)):null;},
    loadWorkspace:async owner=>{calls.push(['load',owner]);return structuredClone(rows.get(owner)||null);},
    claimQuestion:async hash=>{calls.push(['claim',hash]);return {pending:true,id:'11111111-1111-4111-8111-111111111111',question:'Help me plan.',useWorkspace:true};},
    answerQuestion:async(hash,id,answer)=>{calls.push(['answer',hash,id,answer]);return id==='11111111-1111-4111-8111-111111111111'?{answered:true,id}:{error:'QUESTION_UNAVAILABLE'};},
    commitDraft:async(hash,args)=>{
      calls.push(['commit',hash,structuredClone(args)]);
      if(hash!==tokenHash||token.revoked_at||new Date(token.expires_at)<=now||!token.scopes.includes('drafts:write'))return {error:'ACCESS_DENIED'};
      const row=rows.get(token.user_id);if(!row)return {error:'WORKSPACE_MISSING'};
      if(row.revision!==args.expectedRevision)return {error:'REVISION_CONFLICT'};
      row.payload.drafts[args.prospectId]={subject:args.subject,body:args.body,channel:args.channel,ready:false};
      row.payload.audit.push({action:'Agent draft proposed',detail:'Nothing sent.',at:now.toISOString()});
      row.revision++;return {revision:row.revision,ready:false,delivery:'not_sent'};
    }
  };
  return {handler:createMCPHandler({store,now:()=>now}),store,token,rows,calls};
}
const invoke=async(f,name,args={})=>{
  const response=await f.handler(request(rpc('tools/call',{name,arguments:args})));return {response,message:await response.json()};
};
const proposed=extra=>({prospectId:'A-good',expectedRevision:3,subject:'A helpful conversation',body:'A draft supplied by the agent.',channel:'company',...extra});

test('MCP initializes without exposing authentication material and accepts notifications with 202',async()=>{
  const f=await fixture();const response=await f.handler(request(rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'QA',version:'1'}})));
  const message=await response.json();assert.equal(response.status,200);assert.equal(message.result.protocolVersion,'2025-06-18');assert.deepEqual(message.result.capabilities,{tools:{listChanged:false}});
  assert.ok(!JSON.stringify(message).includes(raw));assert.ok(!JSON.stringify(message).includes(f.token.token_hash));
  const notification=await f.handler(request({jsonrpc:'2.0',method:'notifications/initialized'}));assert.equal(notification.status,202);assert.equal(await notification.text(),'');
});
test('MCP rejects foreign browser origins before touching private storage',async()=>{
  const f=await fixture();assert.equal((await f.handler(request(rpc('ping'),{origin:'https://hostile.example'}))).status,403);assert.deepEqual(f.calls,[]);
  assert.equal((await f.handler(request(rpc('ping'),{origin:'https://pull-gtm.vercel.app'}))).status,200);
});
test('Only a valid owner-issued PAT authenticates, rather than Supabase public keys',async()=>{
  const f=await fixture();for(const authorization of ['','Bearer sb_publishable_example','Bearer '+'pull_agent_'+'B'.repeat(43)])assert.equal((await f.handler(request(rpc('ping'),{authorization}))).status,401);
  assert.ok(f.calls.every(call=>!JSON.stringify(call).includes(raw)));assert.equal((await f.handler(request(rpc('ping')))).status,200);
});
test('Revoked, expired, and quota-exhausted tokens cannot reach workspace data',async()=>{
  for(const [options,status] of [[{revoked:true},401],[{expired:true},401],[{limited:true},429]]){
    const f=await fixture(options);assert.equal((await f.handler(request(rpc('tools/call',{name:'get_workspace_summary'})))).status,status);assert.ok(!f.calls.some(c=>c[0]==='load'));
  }
});
test('Read-only tokens advertise no write tool and cannot invoke a hidden write',async()=>{
  const f=await fixture({scopes:['workspace:read']});const listed=await f.handler(request(rpc('tools/list')));assert.deepEqual((await listed.json()).result.tools.map(t=>t.name),['get_workspace_summary','list_reviewed_prospects']);
  const {message}=await invoke(f,'propose_draft',proposed());assert.equal(message.result.isError,true);assert.ok(!f.calls.some(c=>c[0]==='commit'));assert.deepEqual(f.rows.get('ownerA').payload.drafts,{});
});
test('Conversation relay tools appear only with explicit permission and preserve the agent response',async()=>{
  const denied=await fixture({scopes:['workspace:read']});
  assert.equal((await invoke(denied,'get_pull_question')).message.result.isError,true);
  assert.ok(!denied.calls.some(c=>c[0]==='claim'));
  const f=await fixture({scopes:['workspace:read','chat:relay']});
  const listed=await f.handler(request(rpc('tools/list')));
  assert.deepEqual((await listed.json()).result.tools.map(t=>t.name),['get_workspace_summary','list_reviewed_prospects','get_pull_question','answer_pull_question']);
  const claimed=await invoke(f,'get_pull_question');assert.equal(JSON.parse(claimed.message.result.content[0].text).useWorkspace,true);
  const answered=await invoke(f,'answer_pull_question',{questionId:'11111111-1111-4111-8111-111111111111',answer:'A tailored answer.'});
  assert.equal(JSON.parse(answered.message.result.content[0].text).answered,true);
  assert.ok(f.calls.some(c=>c[0]==='answer'&&c[3]==='A tailored answer.'));
  assert.ok(!f.calls.some(c=>c[0]==='load'));
});
test('Workspace access derives ownership from the token and rejects client-supplied owner IDs',async()=>{
  const f=await fixture();const own=await invoke(f,'get_workspace_summary');assert.equal(JSON.parse(own.message.result.content[0].text).identity,'Example Business');assert.deepEqual(f.calls.find(c=>c[0]==='load'),['load','ownerA']);
  const attack=await invoke(f,'get_workspace_summary',{user_id:'ownerB'});assert.equal(attack.message.result.isError,true);assert.ok(!f.calls.some(c=>c[0]==='load'&&c[1]==='ownerB'));
});
test('An inconsistent provider row fails closed instead of returning another owner’s data',async()=>{
  const f=await fixture();f.store.loadWorkspace=async()=>f.rows.get('ownerB');const {message}=await invoke(f,'get_workspace_summary');assert.equal(message.error.code,-32603);assert.ok(!JSON.stringify(message).includes('Other private business'));
});
test('Reviewed prospect reads recheck eligibility and exclude contact emails and token metadata',async()=>{
  const f=await fixture();const {message}=await invoke(f,'list_reviewed_prospects',{limit:50});const data=JSON.parse(message.result.content[0].text);
  assert.deepEqual(data.prospects.map(p=>p.id),['A-good']);assert.equal(data.total,1);assert.equal(data.prospects[0].reviewed,true);assert.match(data.prospects[0].evidenceStatus,/not independently verified/);
  assert.ok(!JSON.stringify(message).includes('private@example.test'));assert.ok(!JSON.stringify(message).includes('token_hash'));
});
test('Only an already reviewed eligible prospect can receive a proposed draft',async()=>{
  for(const prospectId of ['ownerB-good','A-unreviewed','A-excluded','A-stale','A-suppressed']){
    const f=await fixture();const {message}=await invoke(f,'propose_draft',proposed({prospectId}));assert.equal(message.result.isError,true);assert.ok(!f.calls.some(c=>c[0]==='commit'));
  }
});
test('A draft proposal only changes the owner’s draft and activity; it cannot send or approve',async()=>{
  const f=await fixture();const original=structuredClone(f.rows.get('ownerA').payload),other=structuredClone(f.rows.get('ownerB'));
  const {message}=await invoke(f,'propose_draft',proposed({body:'  A reviewable draft.  '}));const result=JSON.parse(message.result.content[0].text);
  assert.deepEqual(result,{revision:4,prospectId:'A-good',ready:false,delivery:'not_sent',reviewRequired:true});
  const updated=f.rows.get('ownerA').payload;assert.equal(updated.drafts['A-good'].body,'A reviewable draft.');assert.equal(updated.drafts['A-good'].ready,false);
  assert.deepEqual(updated.prospects,original.prospects);assert.deepEqual(updated.rules,original.rules);assert.deepEqual(updated.shortlist,original.shortlist);assert.equal(updated.identity,original.identity);assert.deepEqual(f.rows.get('ownerB'),other);
});
test('Agent-supplied ready flags, owner IDs, and invented delivery fields are rejected',async()=>{
  const f=await fixture();for(const extra of [{ready:true},{user_id:'ownerB'},{sent:100}]){
    const {message}=await invoke(f,'propose_draft',proposed(extra));assert.equal(message.result.isError,true);
  }
  assert.ok(!f.calls.some(c=>c[0]==='commit'));
});
test('A stale revision cannot overwrite user changes, including a change made during the request',async()=>{
  const f=await fixture();assert.equal((await invoke(f,'propose_draft',proposed({expectedRevision:2}))).message.result.isError,true);
  const originalLoad=f.store.loadWorkspace;f.store.loadWorkspace=async owner=>{const snapshot=await originalLoad(owner);f.rows.get(owner).revision++;f.rows.get(owner).payload.offer='New offer kept';return snapshot;};
  const {message}=await invoke(f,'propose_draft',proposed());assert.equal(message.result.isError,true);assert.match(message.result.content[0].text,/newer cloud save/);assert.equal(f.rows.get('ownerA').payload.offer,'New offer kept');assert.deepEqual(f.rows.get('ownerA').payload.drafts,{});
});
test('Revocation between authentication and the write prevents saving a proposal',async()=>{
  const f=await fixture();const originalLoad=f.store.loadWorkspace;f.store.loadWorkspace=async owner=>{const snapshot=await originalLoad(owner);f.token.revoked_at=now.toISOString();return snapshot;};
  const {message}=await invoke(f,'propose_draft',proposed());assert.equal(message.result.isError,true);assert.match(message.result.content[0].text,/revoked/);assert.deepEqual(f.rows.get('ownerA').payload.drafts,{});
});
test('MCP limits request size, paging, methods, and malformed JSON',async()=>{
  const f=await fixture();assert.equal((await f.handler(request(rpc('ping'),{method:'GET'}))).status,405);assert.equal((await f.handler(request(rpc('ping'),{accept:'text/event-stream'}))).status,406);
  assert.equal((await f.handler(request('not json'))).status,400);assert.equal((await f.handler(request(JSON.stringify([rpc('ping')])))).status,400);assert.equal((await f.handler(request(' '.repeat(66000)))).status,413);
  assert.equal((await invoke(f,'list_reviewed_prospects',{limit:51})).message.result.isError,true);assert.equal((await f.handler(request(rpc('ping'),{protocol:'invented'}))).status,400);
});
test('The Supabase adapter filters reads by the token-derived owner and keeps credentials in server headers',async()=>{
  const calls=[];const store=createAgentStore({url:'https://project.supabase.co',key:'sb_secret_fixture',transport:async(input,options)=>{calls.push({url:new URL(input),options});return Response.json(input.includes('pull_workspaces?')?[]:{revision:4});}});
  await store.loadWorkspace('ownerA');await store.commitDraft('a'.repeat(64),proposed());
  assert.equal(calls[0].url.searchParams.get('user_id'),'eq.ownerA');assert.equal(calls[0].options.headers.apikey,'sb_secret_fixture');assert.equal(calls[0].options.headers.Authorization,undefined);
  const body=JSON.parse(calls[1].options.body);assert.equal(body.p_token_hash,'a'.repeat(64));assert.equal(body.p_revision,3);assert.equal(body.user_id,undefined);assert.equal(body.p_prospect_id,'A-good');
});
test('The agent qualification engine stays identical to the browser’s eligibility engine',async()=>{
  const [browser,agent]=await Promise.all([readFile(new URL('../dist/engine.js',import.meta.url),'utf8'),readFile(new URL('../supabase/functions/pull-mcp/engine.js',import.meta.url),'utf8')]);assert.equal(agent,browser);
});
