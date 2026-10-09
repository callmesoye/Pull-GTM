import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackend} from '../server/backend.js';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',AI_GATEWAY_API_KEY:'would-cost-money'};
const request=(body,account=owner,origin='https://pull.example')=>new Request('https://pull.example/api/agent-chat',{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Host-pull-access=fixture', 'X-Pull-Account':account},body:body===undefined?undefined:JSON.stringify(body)});
function fixture({chatScope=true,saved=true}={}){
  const calls=[];const messages=[];
  const transport=async(input,options={})=>{
    const url=new URL(input),body=options.body?JSON.parse(options.body):null;calls.push({url,options,body});
    if(url.pathname==='/auth/v1/user')return Response.json({id:owner,email:'owner@example.test'});
    if(url.pathname==='/rest/v1/pull_agent_tokens')return Response.json([{scopes:chatScope?['workspace:read','chat:relay']:['workspace:read'],expires_at:'2026-11-01T00:00:00Z',revoked_at:null}]);
    if(url.pathname==='/rest/v1/pull_workspaces')return Response.json(saved?[{revision:1}]:[]);
    if(url.pathname==='/rest/v1/pull_agent_chat_requests'){
      if(options.method==='POST'){
        const row={id:'11111111-1111-4111-8111-111111111111',question:body.question,use_workspace:body.use_workspace,answer:null,status:'pending',created_at:'2026-10-09T00:00:00Z',expires_at:'2026-10-09T00:10:00Z'};
        messages.push(row);return Response.json([row],{status:201});
      }
      return Response.json(messages);
    }
    throw new Error('Unexpected network request');
  };
  return {backend:createBackend({env,transport,now:()=>new Date('2026-10-09T00:00:00Z')}),calls,messages};
}

test('Signed-in owners can queue a scoped question and read only their own conversation',async()=>{
  const f=fixture();const response=await f.backend.agentChat(request({action:'ask',question:' Help me prioritize. ',use_workspace:true}));
  assert.equal(response.status,201);assert.equal((await response.json()).message.question,'Help me prioritize.');
  const history=await f.backend.agentChat(request());assert.equal((await history.json()).messages.length,1);
  assert.ok(f.calls.filter(c=>c.url.pathname.startsWith('/rest/v1/')&&c.options.method!=='POST').every(c=>c.url.searchParams.get('user_id')==='eq.'+owner));
  assert.ok(f.calls.filter(c=>c.options.method==='POST').every(c=>c.body.user_id===owner));
  assert.ok(!f.calls.some(c=>c.url.host==='ai-gateway.vercel.sh'));
});

test('Relay requires explicit agent scope and saved workspace; browser cannot claim an answer',async()=>{
  assert.equal((await fixture({chatScope:false}).backend.agentChat(request({action:'ask',question:'Help',use_workspace:false}))).status,409);
  assert.equal((await fixture({saved:false}).backend.agentChat(request({action:'ask',question:'Help',use_workspace:false}))).status,409);
  const f=fixture();
  assert.equal((await f.backend.agentChat(request({action:'ask',question:'Help',use_workspace:false,answer:'fabricated'}))).status,400);
  assert.equal((await f.backend.agentChat(request({action:'ask',question:'Help',use_workspace:false},owner,'https://evil.example'))).status,403);
  assert.equal((await f.backend.agentChat(request(undefined,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))).status,409);
  assert.equal(f.messages.length,0);
});
