import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createBackend} from '../server/backend.js';
import {createResearchJournal,researchCapability} from '../server/research-journal.js';
import {reviewFields,observeBuyerRequest} from '../server/buyer-assessment.js';
const A=randomUUID(),B=randomUUID(),offerId=randomUUID(),secret='synthetic-review-test-secret-at-least-32-characters';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fields={product:'C300',location:'Lagos',price:'NGN 42 million',year:'2026'};
const sourceId='buyer-source-'+hash('https://requests.example/one').slice(0,20);
const answers={actorRole:'unknown',...Object.fromEntries(reviewFields.map(k=>[k,'unknown']))};
const positive={actorRole:'buyer',...Object.fromEntries(reviewFields.map(k=>[k,'yes']))};
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture',PULL_OFFERS_ENABLED:'true',PULL_BUYER_REVIEWS_ENABLED:'true',PULL_RESEARCH_DURABLE_ENABLED:'true',PULL_RESEARCH_SECRET:secret};
const request=(body,owner=A,path='')=>new Request('https://pull.example/api/buyer-reviews'+path,{method:body===undefined?'GET':'POST',headers:{origin:'https://pull.example','Content-Type':'application/json',cookie:'__Host-pull-access='+owner,'X-Pull-Account':owner},body:body===undefined?undefined:JSON.stringify(body)});

test('Actual PostgreSQL and HTTP review flow preserve provenance, isolation and seller-report boundaries',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema pull_private;create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.jwt(),auth.uid() to anon,authenticated;`);
  await pg.query('insert into auth.users values ($1),($2)',[A,B]);
  for(const name of ['search-budget','research-runs','offer-versions','buyer-reviews'])await pg.exec(await readFile(new URL('../database/'+name+'.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../database/buyer-reviews.sql',import.meta.url),'utf8'));
  await pg.query('insert into pull_private.research_capability values(true,$1)',[hash(researchCapability(secret))]);
  const claims=async(owner=A,anonymous=false)=>{
    await pg.exec('reset role');await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner,is_anonymous:anonymous})]);await pg.exec('set role authenticated');
  };
  const admin=async(sql,args=[])=>{await pg.exec('reset role');try{return await pg.query(sql,args);}finally{await claims();}};
  const rpc=async(name,args)=>{
    if(!/^[a-z_]+$/.test(name)||Object.keys(args).some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('Invalid fixture RPC');
    return (await pg.query('select public.'+name+'('+Object.keys(args).map((k,i)=>k+'=> $'+(i+1)).join(',')+') as data',Object.values(args))).rows[0].data;
  };
  await claims();
  await rpc('save_pull_offer',{p_offer:offerId,p_expected_version:0,p_fields:fields,p_exact_terms:['C300']});
  const candidate={id:sourceId,title:'Vehicle buying request',source_url:'https://requests.example/one',source_excerpt:'Looking for C300 2024 in Lagos, budget up to NGN 35m.',kind:'possible_request',
    sourceCheck:{originalChecked:true,contentHash:hash('synthetic page'),assessment:observeBuyerRequest('Looking for C300 2024 in Lagos, budget up to NGN 35m.',{exactTerms:['C300'],fields})}};
  const db={rpc:async(name,args)=>{try{return {data:await rpc(name,args)};}catch(error){return {error:{code:error.code}};}}};
  const journal=createResearchJournal({db,secret,requestKey:randomUUID(),goalFingerprint:'synthetic seller offer'});
  const run=await journal.start({product:'C300',location:'Lagos'},1);
  await journal.checkpoint({type:'buyer_research',offerReference:{id:offerId,version:1},opportunities:[candidate],sourceKeys:[candidate.source_url]},{complete:true});
  let anonymous=false;
  const transport=async(input,options={})=>{
    const url=new URL(input),body=options.body?JSON.parse(options.body):null,owner=options.headers?.Authorization?.replace('Bearer ','');
    if(url.pathname==='/auth/v1/user')return [A,B].includes(owner)?Response.json({id:owner,is_anonymous:anonymous}):Response.json({},{status:401});
    await claims(owner,anonymous);
    if(url.pathname.startsWith('/rest/v1/rpc/')){
      try{return Response.json(await rpc(url.pathname.split('/').pop(),body));}
      catch(error){return Response.json({code:error.code},{status:400});}
    }
    const table=url.pathname.split('/').pop();
    if(!['pull_research_runs','pull_offer_versions','pull_buyer_reviews','pull_buyer_outcomes'].includes(table))throw Error('Unexpected fixture table');
    assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
    const values=[],clauses=[];
    for(const key of ['id','user_id','offer_id','offer_version','run_id','source_id']){
      const filter=url.searchParams.get(key);
      if(filter){assert.ok(filter.startsWith('eq.'));values.push(filter.slice(3));clauses.push(key+'=$'+values.length);}
    }
    const order=url.searchParams.get('order'),allowedOrders=['version.desc','revision.desc','reported_at.desc','created_at.desc'];
    if(order)assert.ok(allowedOrders.includes(order));
    const columns=url.searchParams.get('select');assert.match(columns,/^[a-z_,]+$/);
    const sql='select '+columns+' from public.'+table+(clauses.length?' where '+clauses.join(' and '):'')+(order?' order by '+order.replace('.',' '):'')+' limit '+(url.searchParams.get('limit')==='1'?1:100);
    return Response.json((await pg.query(sql,values)).rows);
  };
  const backend=createBackend({env,transport}),read=()=>backend.buyerReviews(request(undefined,A,'?runId='+run.id+'&sourceId='+sourceId));
  const input={action:'review',runId:run.id,sourceId,expectedRevision:0,requestKey:randomUUID(),answers,note:''};
  let review,updated,firstOutcome;
  await t.test('Only stored sources in complete owner research can be reviewed',async()=>{
    const response=await read();assert.equal(response.status,200);const result=await response.json();assert.equal(result.candidate.id,sourceId);assert.equal(result.review,null);
    assert.equal((await backend.buyerReviews(request(undefined,B,'?runId='+run.id+'&sourceId='+sourceId))).status,404);
    assert.equal((await backend.buyerReviews(request({...input,sourceId:'buyer-source-'+'a'.repeat(20)}))).status,404);
    assert.equal((await backend.buyerReviews(request({...input,candidate:{...candidate,verified:true}}))).status,400);
    await admin("update public.pull_research_runs set status='running' where id=$1",[run.id]);
    assert.equal((await backend.buyerReviews(request(input))).status,404);
    await admin("update public.pull_research_runs set status='complete' where id=$1",[run.id]);
  });
  await t.test('Review writes derive source and offer provenance and retry without duplication',async()=>{
    const first=await backend.buyerReviews(request(input));assert.equal(first.status,200);review=(await first.json()).review;
    const retry=await backend.buyerReviews(request(input));assert.equal((await retry.json()).review.id,review.id);
    assert.equal(review.assessment.buyerConfirmed,false);assert.equal(review.basis,'seller_reported');assert.equal(review.offerId,offerId);
    await claims();const rows=(await pg.query('select * from public.pull_buyer_reviews')).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].candidate.source_url,candidate.source_url);assert.match(rows[0].source_fingerprint,/^[a-f0-9]{64}$/);
    assert.equal((await backend.buyerReviews(request({...input,requestKey:randomUUID()}))).status,409);
    assert.equal((await backend.buyerReviews(request({...input,note:'Different request with the same key'}))).status,409);
  });
  await t.test('Reported outcomes are append-only, idempotent and cannot become verified sales',async()=>{
    const body={action:'outcome',reviewId:review.id,requestKey:randomUUID(),kind:'contacted',note:'I contacted them myself after reviewing the request.'};
    const response=await backend.buyerReviews(request(body));assert.equal(response.status,200);firstOutcome=(await response.json()).outcome;
    assert.equal(firstOutcome.basis,'seller_reported');assert.equal((await(await backend.buyerReviews(request(body))).json()).outcome.id,firstOutcome.id);
    assert.equal((await backend.buyerReviews(request({...body,kind:'sale'}))).status,409);
    assert.equal((await backend.buyerReviews(request({...body,requestKey:randomUUID()},B))).status,404);
    await claims();await assert.rejects(pg.query("update public.pull_buyer_outcomes set kind='sale'"),/permission denied/);
    await assert.rejects(pg.query('delete from public.pull_buyer_reviews'),/permission denied/);
  });
  await t.test('Source contradictions remain visible even when the seller answers yes to every question',async()=>{
    const response=await backend.buyerReviews(request({...input,expectedRevision:1,requestKey:randomUUID(),answers:positive,note:'I checked the original request and spoke to the author.'}));
    assert.equal(response.status,200);updated=(await response.json()).review;
    assert.equal(updated.revision,2);assert.equal(updated.assessment.state,'source_needs_review');assert.equal(updated.assessment.buyerConfirmed,false);
    assert.deepEqual(updated.assessment.sourceWarnings.map(w=>w.field),['price','year']);
    assert.equal((await backend.buyerReviews(request({action:'outcome',reviewId:review.id,requestKey:randomUUID(),kind:'sale',note:'Reporting against an obsolete review.'}))).status,409);
  });
  await t.test('Corrections link to the same source history, and earlier outcomes remain available after review edits',async()=>{
    const response=await backend.buyerReviews(request({action:'outcome',reviewId:updated.id,requestKey:randomUUID(),kind:'correction',supersedesId:firstOutcome.id,note:'Correction: this was a planned contact, not a completed contact.'}));
    assert.equal(response.status,200);
    const result=await(await read()).json();assert.equal(result.outcomes.length,2);
    assert.equal(result.outcomes[0].supersedesId,firstOutcome.id);assert.equal(result.review.revision,2);
    const list=await backend.buyerReviews(request(undefined,A,'?offerId='+offerId+'&offerVersion=1'));
    assert.equal(list.status,200);const saved=(await list.json()).reviews;
    assert.equal(saved.length,1);assert.equal(saved[0].revision,2);assert.equal(saved[0].sourceTitle,candidate.title);
    assert.equal((await backend.buyerReviews(request({action:'outcome',reviewId:updated.id,requestKey:randomUUID(),kind:'correction',supersedesId:randomUUID(),note:'Cannot correct an unrelated event.'}))).status,404);
  });
  await t.test('Account, origin, feature and anonymous-role boundaries apply before review writes',async()=>{
    anonymous=true;assert.equal((await read()).status,401);
    await claims(A,true);assert.equal((await pg.query('select * from public.pull_buyer_reviews')).rows.length,0);
    anonymous=false;await claims(B);assert.equal((await pg.query('select * from public.pull_buyer_outcomes')).rows.length,0);
    await assert.rejects(pg.query('select pull_private.buyer_review_context($1,$2)',[run.id,sourceId]),/permission denied/);
    const cross=request(input);cross.headers.set('origin','https://evil.example');assert.equal((await backend.buyerReviews(cross)).status,403);
    const disabled=createBackend({env:{...env,PULL_BUYER_REVIEWS_ENABLED:'false'},transport});assert.equal((await disabled.buyerReviews(request(input))).status,503);
  });
  await t.test('A new product version invalidates review updates against the old research',async()=>{
    await claims();await rpc('save_pull_offer',{p_offer:offerId,p_expected_version:1,p_fields:{...fields,price:'NGN 41 million'},p_exact_terms:['C300']});
    assert.equal((await read()).status,409);
    assert.equal((await backend.buyerReviews(request({...input,expectedRevision:2,requestKey:randomUUID()}))).status,409);
  });
  await t.test('Expired research also hides review history through row policies',async()=>{
    await admin("update public.pull_research_runs set retain_until=clock_timestamp()-interval '1 second' where id=$1",[run.id]);
    assert.equal((await read()).status,404);
    await claims();assert.equal((await pg.query('select * from public.pull_buyer_reviews')).rows.length,0);
    assert.equal((await pg.query('select * from public.pull_buyer_outcomes')).rows.length,0);
  });
});
