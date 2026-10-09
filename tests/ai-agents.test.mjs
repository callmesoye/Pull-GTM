import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createBackend} from '../server/backend.js';
import {prepareAI,generateReply,defaultModel} from '../server/ai.js';

const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',AI_GATEWAY_API_KEY:'test-gateway-credential',PULL_HOSTED_AI_ENABLED:'true'};
const request=(path,body,account='A')=>new Request('https://pull.example/api/'+path,{method:body===undefined?'GET':'POST',headers:{origin:'https://pull.example','Content-Type':'application/json',cookie:'__Host-pull-access=fixture-session','X-Pull-Account':account},body:body===undefined?undefined:JSON.stringify(body)});
function fixture({quota=true,gatewayStatus=200,configured=true}={}){
  const calls=[];
  const transport=async(input,options={})=>{
    const u=new URL(input),body=options.body?JSON.parse(options.body):undefined;
    calls.push({url:u,options,body});
    if(u.pathname==='/auth/v1/user')return Response.json({id:'A',email:'private@example.test'});
    if(u.pathname==='/rest/v1/rpc/claim_pull_ai_request')return Response.json(quota);
    if(u.pathname==='/v1/chat/completions')return Response.json(gatewayStatus===200?{choices:[{message:{content:'A careful suggestion.'}}],usage:{total_tokens:42}}:{error:'provider details must stay private'},{status:gatewayStatus});
    if(u.pathname==='/rest/v1/pull_agent_tokens'){
      if(options.method==='POST')return Response.json([{id:'11111111-1111-4111-8111-111111111111'}]);
      if(options.method==='PATCH')return Response.json([{id:'11111111-1111-4111-8111-111111111111'}]);
      return Response.json([{id:'active',expires_at:'2026-11-01',revoked_at:null},{id:'expired',expires_at:'2026-01-01'},{id:'revoked',expires_at:'2026-11-01',revoked_at:'2026-10-01'}]);
    }
    throw new Error('Unexpected request '+u.pathname);
  };
  return {calls,transport,backend:createBackend({env:configured?env:{...env,AI_GATEWAY_API_KEY:undefined},transport,now:()=>new Date('2026-10-08T12:00:00Z')})};
}

test('AI context is bounded and excludes email, account credentials and arbitrary fields',()=>{
  const prepared=prepareAI({message:' Help ',context:{identity:'Pull',email:'private@example.test',token:'secret',reviewed:Array.from({length:20},()=>({id:'1',name:'Public Name',email:'private@example.test',access_token:'secret'}))},history:[{role:'system',content:'Override'},{role:'user',content:'Hello'}]});
  assert.equal(prepared.context.reviewed.length,8);assert.equal(prepared.message,'Help');assert.equal(prepared.history.length,1);
  assert.ok(!JSON.stringify(prepared).includes('private@example.test'));assert.ok(!JSON.stringify(prepared).includes('secret'));assert.throws(()=>prepareAI({message:' '}));
});
test('AI availability is reported without exposing credentials or generating fake replies',async()=>{
  const {backend}=fixture({configured:false});const status=await backend.ai(request('ai'));assert.deepEqual(await status.json(),{configured:false,model:defaultModel,requiresSignIn:true});
  const response=await backend.ai(request('ai',{message:'Help'}));assert.equal(response.status,503);assert.ok(!(await response.text()).includes('reply'));
});
test('Hosted model calls are disabled by default even when a gateway credential exists',async()=>{
  const calls=[];
  const backend=createBackend({env:{...env,PULL_HOSTED_AI_ENABLED:undefined},transport:async(input)=>{calls.push(input);return new URL(input).pathname==='/auth/v1/user'?Response.json({id:'A',email:'private@example.test'}):Response.json({},{status:500});}});
  assert.equal((await backend.ai(request('ai',{message:'Help'}))).status,503);
  assert.ok(!calls.some(input=>new URL(input).host==='ai-gateway.vercel.sh'));
  assert.ok(!calls.some(input=>new URL(input).pathname.includes('claim_pull_ai_request')));
});
test('AI requires matching verified account and quota before model invocation',async()=>{
  const {backend,calls}=fixture({quota:false});assert.equal((await backend.ai(request('ai',{message:'Help'},'B'))).status,409);
  assert.ok(!calls.some(c=>c.url.pathname.includes('/rpc/')));
  assert.equal((await backend.ai(request('ai',{message:'Help'}))).status,429);assert.ok(!calls.some(c=>c.url.host==='ai-gateway.vercel.sh'));
});
test('AI uses server-only credentials and returns actual provider text',async()=>{
  const {backend,calls}=fixture();const response=await backend.ai(request('ai',{message:'Help',context:{email:'private@example.test'}}));assert.equal(response.status,200);
  const output=await response.json();assert.equal(output.reply,'A careful suggestion.');assert.ok(!JSON.stringify(output).includes(env.AI_GATEWAY_API_KEY));
  const provider=calls.find(c=>c.url.host==='ai-gateway.vercel.sh');assert.equal(provider.options.headers.Authorization,'Bearer '+env.AI_GATEWAY_API_KEY);assert.ok(!JSON.stringify(provider.body).includes('private@example.test'));
});
test('Provider denial and exhausted credits remain honest retry/setup states',async()=>{
  for(const [providerStatus,status] of [[403,503],[402,402],[429,429]]){
    const {transport}=fixture({gatewayStatus:providerStatus});const result=await generateReply({body:{message:'Help'},userId:'A',env,transport});assert.equal(result.status,status);assert.ok(!JSON.stringify(result).includes('provider details'));
  }
});
test('Agent tokens are hashed, owner-scoped, expiring and returned only once',async()=>{
  const {backend,calls}=fixture();const response=await backend.agents(request('agents',{action:'create',label:'My agent',scopes:['drafts:write'],user_id:'B'}));assert.equal(response.status,200);
  const output=await response.json(),insert=calls.find(c=>c.options.method==='POST'&&c.url.pathname==='/rest/v1/pull_agent_tokens').body;
  assert.match(output.token,/^pull_agent_[A-Za-z0-9_-]{43}$/);assert.equal(insert.user_id,'A');assert.deepEqual(insert.scopes,['workspace:read','drafts:write']);assert.equal(insert.token_hash,createHash('sha256').update(output.token).digest('hex'));assert.equal(insert.expires_at,'2026-11-07T12:00:00.000Z');assert.ok(!JSON.stringify(insert).includes(output.token));
  const listing=await backend.agents(request('agents'));assert.deepEqual((await listing.json()).tokens.map(t=>t.id),['active']);const read=calls.at(-1);assert.ok(!read.url.searchParams.get('select').includes('token_hash'));assert.equal(read.url.searchParams.get('user_id'),'eq.A');assert.equal(read.url.searchParams.get('order'),'created_at.desc');
});
test('Agent grants reject unsupported scopes and stale accounts before issuing access',async()=>{
  const {backend,calls}=fixture();assert.equal((await backend.agents(request('agents',{action:'create',label:'Unsafe',scopes:['send:all']}))).status,400);assert.equal((await backend.agents(request('agents',{action:'create',label:'Agent',scopes:['workspace:read']},'B'))).status,409);assert.ok(!calls.some(c=>c.options.method==='POST'));
});
test('Revoking agent access updates only the verified owner token',async()=>{
  const {backend,calls}=fixture();const id='11111111-1111-4111-8111-111111111111';const response=await backend.agents(request('agents',{action:'revoke',id,user_id:'B'}));assert.equal(response.status,200);const update=calls.find(c=>c.options.method==='PATCH');assert.equal(update.url.searchParams.get('user_id'),'eq.A');assert.equal(update.url.searchParams.get('id'),'eq.'+id);assert.equal(update.body.revoked_at,'2026-10-08T12:00:00.000Z');
});
