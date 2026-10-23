import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createBackend} from '../server/backend.js';
import {renderOfferPanel} from '../dist/offers-ui.js';
import {offerReference} from '../server/offers.js';

const A=randomUUID(),B=randomUUID(),id=randomUUID();
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture',PULL_OFFERS_ENABLED:'true',PULL_BUYER_RESEARCH_ENABLED:'true',BRAVE_SEARCH_API_KEY:'fixture',AI_GATEWAY_API_KEY:'fixture',PULL_SEARCH_MAX_QUERIES:'1'};
const fields={product:'C300',location:'Lagos',price:'NGN 42 million',condition:'Used, inspection available'};
const req=(body,owner=A,path='offers')=>new Request('https://pull.example/api/'+path,{method:body===undefined?'GET':'POST',headers:{origin:'https://pull.example','Content-Type':'application/json',cookie:'__Host-pull-access='+owner,'X-Pull-Account':owner},body:body===undefined?undefined:JSON.stringify(body)});

test('Saved-offer boundary validates references and safely renders seller content',()=>{
  assert.throws(()=>offerReference({confirmedOffer:{ownerId:'another'}}),/saved offer/);
  assert.throws(()=>offerReference({offerId:id}),/version/);
  assert.throws(()=>offerReference({offerVersion:1}),/version/);
  assert.deepEqual(offerReference({offerId:id,offerVersion:2}),{id,version:2});
  const html=renderOfferPanel({enabled:true,offers:[{id,version:1,fields:{product:'<script>alert(1)</script>',location:'Lagos'}}]},s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'));
  assert.ok(!html.includes('<script>'));assert.match(html,/Look for buyers/);
  assert.equal(renderOfferPanel({enabled:false},String),'');
});

test('PostgreSQL offers and authenticated API preserve ownership, versions and bound research',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.jwt(),auth.uid() to anon,authenticated;`);
  await pg.query('insert into auth.users values ($1),($2)',[A,B]);
  const schema=await readFile(new URL('../database/offer-versions.sql',import.meta.url),'utf8');
  await pg.exec(schema);await pg.exec(schema);
  const claims=async(owner=A,anonymous=false)=>{
    await pg.exec('reset role');
    await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner,is_anonymous:anonymous})]);
    await pg.exec('set role authenticated');
  };
  const call=async(body)=>pg.query('select public.save_pull_offer($1,$2,$3,$4) as value',[body.p_offer,body.p_expected_version,body.p_fields,body.p_exact_terms]);
  let modelCalls=0,aiClaims=0,sourceCalls=0,anonymous=false;
  let modelMessages;
  const transport=async(input,options={})=>{
    const url=new URL(input),body=options.body?JSON.parse(options.body):null;
    const owner=options.headers?.Authorization?.replace('Bearer ','');
    if(url.pathname==='/auth/v1/user')return [A,B].includes(owner)?Response.json({id:owner,is_anonymous:anonymous}):Response.json({},{status:401});
    if(url.pathname==='/rest/v1/rpc/save_pull_offer'){
      await claims(owner);
      try{return Response.json((await call(body)).rows[0].value);}
      catch(error){return Response.json({code:error.code},{status:400});}
    }
    if(url.pathname==='/rest/v1/pull_offer_versions'){
      await claims(owner);
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
      const offer=url.searchParams.get('offer_id')?.slice(3);
      const result=offer?await pg.query('select * from public.pull_offer_versions where offer_id=$1 order by version desc limit 1',[offer]):await pg.query('select * from public.pull_offer_versions order by confirmed_at desc limit 100');
      return Response.json(result.rows);
    }
    if(url.pathname==='/rest/v1/rpc/claim_pull_ai_request'){aiClaims++;return Response.json(true);}
    if(url.pathname==='/rest/v1/rpc/claim_pull_search_requests')return Response.json(true);
    if(url.hostname==='ai-gateway.vercel.sh'){
      modelCalls++;modelMessages=body.messages;
      return Response.json({choices:[{message:modelCalls%2===1?{role:'assistant',tool_calls:[{id:'search',type:'function',function:{name:'discover_buyer_routes',arguments:JSON.stringify({product:'Wrong product',location:'Abuja',productTerms:['Wrong'],limit:5,hypotheses:[{buyerType:'Car buyer requests',reason:'Search explicit requests.',route:'expressed_demand',keywords:['C300'],queries:['C300 wanted Lagos']}]})}}]}:{role:'assistant',content:'Research returned sources to check, not confirmed buyers.'}}]});
    }
    if(url.hostname==='api.search.brave.com'){sourceCalls++;assert.match(url.searchParams.get('q'),/Lagos/);assert.doesNotMatch(url.searchParams.get('q'),/Abuja/);return Response.json({web:{results:[]}});}
    throw new Error('Unexpected destination');
  };
  const backend=createBackend({env,transport});
  const save=(changes={})=>({action:'confirm',offerId:id,expectedVersion:0,fields,exactTerms:['C300'],...changes});
  await t.test('Confirmation is persistent and retrying a successful save creates no duplicate',async()=>{
    for(let attempt=0;attempt<2;attempt++){
      const response=await backend.offers(req(save()));assert.equal(response.status,200);
      const result=await response.json();assert.equal(result.offer.ownerId,A);assert.equal(result.offer.version,1);assert.equal(result.offer.fields.product,'C300');
    }
    assert.equal((await pg.query('select count(*)::int as n from public.pull_offer_versions')).rows[0].n,1);
  });
  await t.test('Foreign users and anonymous sessions cannot read or mutate another seller offer',async()=>{
    const list=await backend.offers(req(undefined,B));assert.equal((await list.json()).offers.length,0);
    const foreign=await backend.ai(req({message:'Find buyers',offerId:id,offerVersion:1},B,'ai'));assert.equal(foreign.status,404);assert.equal(aiClaims,0);
    anonymous=true;assert.equal((await backend.offers(req(undefined))).status,401);anonymous=false;
    await claims(B);assert.equal((await pg.query('select * from public.pull_offer_versions')).rows.length,0);
    await assert.rejects(pg.query('update public.pull_offer_versions set version=2'),/permission denied/);
    await assert.rejects(call({p_offer:id,p_expected_version:1,p_fields:fields,p_exact_terms:['C300']}),/changed/);
    await claims(A,true);assert.equal((await pg.query('select * from public.pull_offer_versions')).rows.length,0);
    await assert.rejects(call({p_offer:id,p_expected_version:0,p_fields:fields,p_exact_terms:['C300']}),/Owner required/);
  });
  await t.test('Stale edits fail and previous confirmed versions remain immutable',async()=>{
    const response=await backend.offers(req(save({expectedVersion:1,fields:{...fields,price:'NGN 40 million'}})));assert.equal(response.status,200);assert.equal((await response.json()).offer.version,2);
    assert.equal((await backend.offers(req(save({fields:{...fields,price:'NGN 1'}})))).status,409);
    const stale=await backend.ai(req({message:'Find buyers',offerId:id,offerVersion:1,allowResearch:true},A,'ai'));assert.equal(stale.status,409);assert.equal(aiClaims,0);
    await claims(A);const rows=(await pg.query('select version,fields from public.pull_offer_versions order by version')).rows;
    assert.equal(rows.length,2);assert.equal(rows[0].fields.price,'NGN 42 million');
  });
  await t.test('Browser-supplied assertions, unknown fields and unmatched exact terms are rejected before saving or AI spend',async()=>{
    assert.equal((await backend.offers(req(save({user_id:B})))).status,400);
    assert.equal((await backend.offers(req(save({fields:{...fields,verified:true}})))).status,400);
    assert.equal((await backend.offers(req(save({exactTerms:['Lexus']})))).status,400);
    assert.equal((await backend.ai(req({message:'Find buyers',confirmedOffer:{fields}},A,'ai'))).status,400);
    assert.equal(aiClaims,0);
  });
  await t.test('The real HTTP/model/tool path uses the saved seller product and market despite swapped model arguments',async()=>{
    const response=await backend.ai(req({message:'Find buyers for my saved offer',offerId:id,offerVersion:2,allowResearch:true,researchRequestId:randomUUID()},A,'ai'));
    assert.equal(response.status,200);const result=await response.json();
    assert.equal(sourceCalls,1);assert.equal(result.research[0].input.product,'C300');assert.equal(result.research[0].input.location,'Lagos');
    assert.deepEqual(result.research[0].offerReference,{id,version:2});
    assert.ok(modelMessages.some(m=>m.role==='system'&&m.content.includes('NGN 40 million')));
    assert.equal(result.research[0].summary.confirmedBuyers,0);
  });
  await t.test('V2 offer feature flag and origin protection fail before persistent writes',async()=>{
    const disabled=createBackend({env:{...env,PULL_OFFERS_ENABLED:'false'},transport});
    assert.equal((await disabled.offers(req(save()))).status,503);
    const cross=req(save());cross.headers.set('origin','https://evil.example');
    assert.equal((await backend.offers(cross)).status,403);
    const noAuth=new Request('https://pull.example/api/offers');assert.equal((await backend.offers(noAuth)).status,401);
  });
  await t.test('Daily save limits prevent more inserts while a successful retry remains idempotent',async()=>{
    await pg.exec('reset role');
    await pg.query('insert into public.pull_offer_versions(user_id,offer_id,version,fields,exact_terms) select $1,gen_random_uuid(),1,$2,$3 from generate_series(1,198)',[A,fields,['C300']]);
    const blocked=await backend.offers(req(save({offerId:randomUUID()})));
    assert.equal(blocked.status,429);
    const retry=await backend.offers(req(save({expectedVersion:1,fields:{...fields,price:'NGN 40 million'}})));
    assert.equal(retry.status,200);assert.equal((await retry.json()).offer.version,2);
    await claims(A);
    assert.equal((await pg.query('select count(*)::int as n from public.pull_offer_versions')).rows[0].n,200);
  });
});
