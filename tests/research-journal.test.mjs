import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createResearchJournal,researchCapability} from '../server/research-journal.js';
import {createIntelligenceTools} from '../server/intelligence.js';
import {prepareAI} from '../server/ai.js';
import {createBackend} from '../server/backend.js';

const sha=s=>createHash('sha256').update(s).digest('hex');
const secret='local-test-secret-with-no-production-access';
const capability=researchCapability(secret),ownerA=randomUUID(),ownerB=randomUUID();
const brief=()=>({product:'website design services',location:'Abuja',productTerms:['website design'],limit:5,hypotheses:[{buyerType:'Businesses requesting websites',reason:'An explicit request may reveal a project.',route:'expressed_demand',keywords:['website design'],queries:['website design wanted Abuja']}]});
const env={PULL_BUYER_RESEARCH_ENABLED:'true',PULL_RESEARCH_DURABLE_ENABLED:'true',PULL_RESEARCH_SECRET:secret,BRAVE_SEARCH_API_KEY:'test-provider-key',PULL_SEARCH_MAX_QUERIES:'8'};
const journal=db=>createResearchJournal({db,secret,requestKey:randomUUID(),goalFingerprint:'seller goal'});

test('Durable authorization and request keys fail closed before any database call',()=>{
  assert.throws(()=>researchCapability('short'),/authorization/);
  assert.throws(()=>createResearchJournal({secret,requestKey:'invalid',goalFingerprint:'goal'}),/request ID/);
  assert.throws(()=>prepareAI({message:'Find buyers',researchRequestId:'invalid'}),/request ID/);
  assert.equal(prepareAI({message:'Find buyers',researchRequestId:randomUUID()}).message,'Find buyers');
});

test('Actual PostgreSQL research journal invariants and integrated recovery',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema pull_private;
    create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.jwt(),auth.uid() to authenticated,anon;`);
  await pg.query('insert into auth.users values ($1),($2)',[ownerA,ownerB]);
  await pg.exec(await readFile(new URL('../database/search-budget.sql',import.meta.url),'utf8'));
  const sql=await readFile(new URL('../database/research-runs.sql',import.meta.url),'utf8');
  await pg.exec(sql);await pg.exec(sql); // Candidate schema can safely be reapplied.
  await pg.query('insert into pull_private.research_capability values(true,$1)',[sha(capability)]);
  const claims=async(owner=ownerA,anonymous=false)=>{
    await pg.exec('reset role');
    await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner,is_anonymous:anonymous})]);
    await pg.exec('set role authenticated');
  };
  const admin=async(sql,params=[])=>{await pg.exec('reset role');try{return await pg.query(sql,params);}finally{await claims();}};
  const call=async(name,args)=>{
    const keys=Object.keys(args),values=Object.values(args);
    const result=await pg.query(`select public.${name}(${keys.map((key,i)=>`${key} => $${i+1}`).join(',')}) as data`,values);
    return result.rows[0].data;
  };
  const db={rpc:async(name,args)=>{try{return {data:await call(name,args),error:null};}catch(error){return {data:null,error:{code:error.code}};}}};
  const start=async(overrides={})=>call('start_pull_research',{p_key:randomUUID(),p_goal:sha('goal'),p_input:brief(),p_max:2,p_capability:capability,...overrides});
  const reserve=(run,key=sha('step'))=>call('reserve_pull_research_step',{p_run:run.id,p_lease:run.lease,p_step:key,p_capability:capability});
  const finish=(run,payload,key=sha('step'))=>call('finish_pull_research_step',{p_run:run.id,p_lease:run.lease,p_step:key,p_response:payload,p_capability:capability});
  const save=(run,revision,snapshot={result:{}},complete=false)=>call('checkpoint_pull_research',{p_run:run.id,p_lease:run.lease,p_revision:revision,p_snapshot:snapshot,p_complete:complete,p_capability:capability});
  await claims();

  await t.test('Authentication plus the server capability are both required',async()=>{
    await assert.rejects(start({p_capability:sha('wrong')}),{code:'42501'});
    await claims(ownerA,true);await assert.rejects(start(),{code:'42501'});
    await claims(null);await assert.rejects(start(),{code:'42501'});await claims();
    await pg.exec('set role anon');await assert.rejects(start(),{code:'42501'});await claims();
  });
  await t.test('Client roles cannot modify runs, read worker leases, or access private receipts',async()=>{
    const run=await start();
    await assert.rejects(pg.query('update public.pull_research_runs set requests_used=0 where id=$1',[run.id]),{code:'42501'});
    await assert.rejects(pg.query('select lease_token from public.pull_research_runs'),{code:'42501'});
    await assert.rejects(pg.query('select * from pull_private.research_steps'),{code:'42501'});
    assert.ok((await pg.query('select id from public.pull_research_runs where id=$1',[run.id])).rows.length);
  });
  await t.test('Cross-customer reads and writes are denied even with the server capability',async()=>{
    const run=await start();await claims(ownerB);
    assert.equal((await pg.query('select id from public.pull_research_runs where id=$1',[run.id])).rows.length,0);
    await assert.rejects(reserve(run),{code:'42501'});await claims();
  });
  await t.test('The same request is busy while leased and cannot be rebound to a new seller goal',async()=>{
    const key=randomUUID(),run=await start({p_key:key});
    const busy=await start({p_key:key});assert.equal(busy.state,'busy');assert.equal(busy.id,run.id);assert.equal(busy.lease,null);
    await assert.rejects(start({p_key:key,p_goal:sha('another goal')}),{code:'22023'});
  });
  await t.test('Reservations, run allowance and existing daily quota are committed together',async()=>{
    const run=await start(),before=await admin("select coalesce(sum(requests),0)::int as n from pull_private.search_daily_usage where owner=$1",[ownerA]);
    assert.equal((await reserve(run)).state,'claimed');assert.equal((await reserve(run)).state,'uncertain');
    assert.equal((await reserve(run,sha('step 2'))).state,'claimed');assert.equal((await reserve(run,sha('step 3'))).state,'denied');
    const after=await admin("select sum(requests)::int as n from pull_private.search_daily_usage where owner=$1",[ownerA]);
    assert.equal(after.rows[0].n-before.rows[0].n,2);
  });
  await t.test('Receipts are immutable and replay without spending another source allowance',async()=>{
    const run=await start(),reservation=await reserve(run),payload={rows:[]};
    const saved=await finish(run,payload);assert.ok(saved.revision>reservation.revision);
    assert.deepEqual(await finish(run,payload),saved);
    await assert.rejects(finish(run,{rows:[{title:'altered'}]}),{code:'22023'});
    const replay=await reserve(run);assert.equal(replay.state,'replay');assert.equal(replay.requestsUsed,1);assert.deepEqual(replay.response,payload);
  });
  await t.test('Checkpoints reject stale writers and completed runs replay their saved results',async()=>{
    const key=randomUUID(),run=await start({p_key:key}),reservation=await reserve(run);
    await assert.rejects(save(run,run.revision),{code:'40001'});
    const response=await finish(run,{rows:[]}),snapshot={result:{type:'buyer_research',opportunities:[]}};
    await save(run,response.revision,snapshot,true);
    const replay=await start({p_key:key});assert.equal(replay.state,'replay');assert.equal(replay.lease,null);assert.deepEqual(replay.snapshot,snapshot);
    await assert.rejects(reserve(run),{code:'42501'});
  });
  await t.test('Crash recovery fences the old worker and never repeats an uncertain source step',async()=>{
    const key=randomUUID(),run=await start({p_key:key});await reserve(run);
    await admin("update public.pull_research_runs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[run.id]);
    const resumed=await start({p_key:key});assert.equal(resumed.state,'resumed');assert.notEqual(resumed.lease,run.lease);
    await assert.rejects(finish(run,{rows:[]}),{code:'42501'});
    const uncertain=await reserve(resumed);assert.equal(uncertain.state,'uncertain');assert.equal(uncertain.requestsUsed,1);
    await assert.rejects(finish(resumed,{rows:[]}),{code:'42501'});
  });
  await t.test('Invalid shapes, caps and oversized payloads cannot enter durable records',async()=>{
    await assert.rejects(start({p_max:9}),{code:'22023'});await assert.rejects(start({p_input:[]}),{code:'22023'});
    const run=await start();await reserve(run);
    await assert.rejects(finish(run,{text:'x'.repeat(100001)}),{code:'22023'});
    await assert.rejects(save(run,2,{text:'x'.repeat(250001)}),{code:'22023'});
  });
  await t.test('The JavaScript journal keeps worker leases and capability out of its public state',async()=>{
    const j=journal(db);await j.start(brief(),2);
    assert.equal(j.state.state,'created');assert.equal(j.state.lease,undefined);assert.equal(j.state.capability,undefined);
    await j.reserve({query:'website design Abuja',provider:'brave'});
    await j.record({query:'website design Abuja',provider:'brave'},{rows:[]});
    await j.checkpoint({type:'buyer_research',opportunities:[]},{complete:true});
    await assert.rejects(j.reserve({query:'other Abuja',provider:'brave'}),/lease/);
  });
  await t.test('Integrated research finalizes and retries return the same evidence without provider calls',async()=>{
    const requestKey=randomUUID();let searches=0;
    const options={db,ownerId:ownerA,env,requestKey,goalFingerprint:'find website buyers Abuja',allowResearch:true,transport:async()=>{searches++;return Response.json({web:{results:[{title:'Project Abuja',url:'https://business.example/request',description:'Looking for website design in Abuja.'}]}});}};
    const first=createIntelligenceTools(options),result=await first.discover_buyer_routes(brief());
    assert.equal(result.opportunities.length,1);assert.equal(searches,1);assert.equal(result.requestsUsed,1);
    await first.finalizeBuyerResearch();
    const retry=createIntelligenceTools({...options,transport:async()=>{throw new Error('must not repeat');}});
    const replay=await retry.discover_buyer_routes(brief());assert.equal(searches,1);assert.equal(replay.run_id,result.run_id);assert.deepEqual(replay.opportunities,result.opportunities);assert.equal(replay.remainingSourceRequests,0);
    assert.ok(!Object.keys(first).includes('finalizeBuyerResearch'));assert.ok(!JSON.stringify(replay).includes(capability));
    await retry.finalizeBuyerResearch();
  });
  await t.test('A persisted source receipt recovers a crash before the first result checkpoint',async()=>{
    const requestKey=randomUUID(),goalFingerprint='recover project',j=createResearchJournal({db,secret,requestKey,goalFingerprint});
    const run=await j.start(brief(),8),step={query:brief().hypotheses[0].queries[0],provider:'brave'};
    await j.reserve(step);await j.record(step,{rows:[{title:'Website design Abuja',url:'https://business.example/recovered',description:'Looking for website design in Abuja.'}]});
    await admin("update public.pull_research_runs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[run.id]);
    const tools=createIntelligenceTools({db,ownerId:ownerA,env,requestKey,goalFingerprint,allowResearch:true,transport:async()=>{throw new Error('must replay');}});
    const result=await tools.discover_buyer_routes(brief());assert.equal(result.opportunities.length,1);assert.equal(result.requestsUsed,1);assert.equal(result.trace[0].replayed,true);await tools.finalizeBuyerResearch();
  });
  await t.test('A crash after a checkpoint returns saved evidence and stops further automatic spending',async()=>{
    const requestKey=randomUUID(),goalFingerprint='recover checkpoint',options={db,ownerId:ownerA,env,requestKey,goalFingerprint,allowResearch:true,transport:async()=>Response.json({web:{results:[]}})};
    const first=createIntelligenceTools(options),result=await first.discover_buyer_routes(brief());
    await admin("update public.pull_research_runs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[result.run_id]);
    const retry=createIntelligenceTools({...options,transport:async()=>{throw new Error('must stop');}}),recovered=await retry.discover_buyer_routes(brief());
    assert.equal(recovered.coverage.stopReason,'interrupted_after_checkpoint');assert.equal(recovered.remainingSourceRequests,0);await retry.finalizeBuyerResearch();
  });
  await t.test('Missing persistence and missing request identity prevent external search',async()=>{
    let searches=0;const options={db:{rpc:async()=>({error:{code:'unavailable'}})},ownerId:ownerA,env,requestKey:randomUUID(),goalFingerprint:'goal',allowResearch:true,transport:async()=>{searches++;}};
    await assert.rejects(createIntelligenceTools(options).discover_buyer_routes(brief()),/persistence/);
    await assert.rejects(createIntelligenceTools({...options,requestKey:undefined}).discover_buyer_routes(brief()),/request ID/);assert.equal(searches,0);
  });
  await t.test('Authenticated HTTP chat wires durable RPCs, finalization and retry replay end to end',async()=>{
    let modelCalls=0,sourceCalls=0;const rpcCalls=[];
    const transport=async(input,options={})=>{
      const url=new URL(input),payload=options.body?JSON.parse(options.body):null;
      if(url.pathname==='/auth/v1/user')return Response.json({id:ownerA,email:'fixture@example.test'});
      if(url.pathname==='/rest/v1/rpc/claim_pull_ai_request')return Response.json(true);
      if(url.pathname.startsWith('/rest/v1/rpc/')){
        assert.ok(options.signal instanceof AbortSignal);assert.equal(options.headers.Authorization,'Bearer fixture-session');
        const name=url.pathname.split('/').at(-1);rpcCalls.push(name);const result=await db.rpc(name,payload);
        return Response.json(result.error||result.data,{status:result.error?400:200});
      }
      if(url.hostname==='ai-gateway.vercel.sh'){
        modelCalls++;assert.ok(!JSON.stringify(payload).includes(capability));
        return Response.json({choices:[{message:modelCalls%2?{tool_calls:[{id:'research-tool',type:'function',function:{name:'discover_buyer_routes',arguments:JSON.stringify(brief())}}]}:{content:'Review the returned research sources.'}}]});
      }
      if(url.hostname==='api.search.brave.com'){sourceCalls++;return Response.json({web:{results:[]}});}
      throw new Error('Unexpected destination');
    };
    const backend=createBackend({env:{...env,SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture-publishable',AI_GATEWAY_API_KEY:'fixture-gateway'},transport});
    const body={message:'Find buyers for website design services in Abuja',allowResearch:true,researchRequestId:randomUUID()};
    const request=()=>new Request('https://pull.example/api/ai',{method:'POST',headers:{origin:'https://pull.example','Content-Type':'application/json',cookie:'__Host-pull-access=fixture-session','X-Pull-Account':ownerA},body:JSON.stringify(body)});
    const response=await backend.ai(request());assert.equal(response.status,200);const result=await response.json();
    assert.equal(result.research.length,1);assert.equal(sourceCalls,1);assert.ok(rpcCalls.includes('checkpoint_pull_research'));
    assert.equal((await pg.query('select status from public.pull_research_runs where id=$1',[result.research[0].run_id])).rows[0].status,'complete');
    const retry=await backend.ai(request());assert.equal(retry.status,200);assert.equal(sourceCalls,1);
    assert.equal((await retry.json()).research[0].run_id,result.research[0].run_id);
  });
  await t.test('Durable refinement shares the original cap and checkpoints the merged source provenance',async()=>{
    let calls=0;const requestKey=randomUUID();
    const options={db,ownerId:ownerA,env:{...env,PULL_SEARCH_MAX_QUERIES:'2'},requestKey,goalFingerprint:'refine website routes',allowResearch:true,transport:async()=>{calls++;return Response.json({web:{results:[{title:'Website design Abuja',url:'https://business.example/route-'+calls,description:'Looking for website design in Abuja.'}]}});}};
    const tools=createIntelligenceTools(options),first=await tools.discover_buyer_routes(brief());assert.equal(first.remainingSourceRequests,1);
    const revised={...brief().hypotheses[0],queries:['website design supplier Abuja','website design procurement Abuja']};
    const result=await tools.refine_buyer_routes({hypotheses:[revised]});assert.equal(calls,2);assert.equal(result.requestsUsed,2);assert.equal(result.opportunities.length,2);assert.equal(result.sourceKeys.length,2);
    await tools.finalizeBuyerResearch();
    const replay=await createIntelligenceTools(options).discover_buyer_routes(brief());assert.equal(calls,2);assert.equal(replay.sourceKeys.length,2);assert.deepEqual(replay.trace,result.trace);
  });
  await t.test('Existing owner daily quota also denies durable reservations without incrementing run usage',async()=>{
    await admin("insert into pull_private.search_daily_usage(day,owner,requests) values((now() at time zone 'utc')::date,$1,100) on conflict(day,owner) do update set requests=100",[ownerA]);
    const run=await start(),denied=await reserve(run);assert.equal(denied.state,'denied');assert.equal(denied.requestsUsed,0);
  });
});
