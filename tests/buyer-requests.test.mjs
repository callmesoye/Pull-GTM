import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createBackend} from '../server/backend.js';
import {validateBuyerRequest} from '../server/buyer-requests.js';
import {qualifyBuyerRequest,qualifySourceRequest} from '../server/request-qualification.js';

const A=randomUUID(),B=randomUUID(),C=randomUUID(),O=randomUUID(),R=randomUUID();
const payload={product:'Mercedes C300',location:'Lagos',category:'goods',requirements:{year:'2026'},budget:{currency:'NGN',maxAmount:45000000,basis:'total'},validForDays:7,status:'open',discoverable:true,contactAllowed:false};
const offer={id:O,version:1,exactTerms:['C300'],fields:{product:'C300',category:'goods',location:'Lagos',price:'NGN 42 million',year:'2026'}};
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'fixture',PULL_OFFERS_ENABLED:'true',PULL_BUYER_REQUESTS_ENABLED:'true'};
const http=(body,owner=A,query='')=>new Request('https://pull.example/api/buyer-requests'+query,{method:body===undefined?'GET':'POST',headers:{origin:'https://pull.example','Content-Type':'application/json',cookie:'__Host-pull-access='+owner,'X-Pull-Account':owner},body:body===undefined?undefined:JSON.stringify(body)});
test('Buying request validation rejects forged trust, malformed terms, implicit consent and excessive budgets',()=>{
  assert.deepEqual(validateBuyerRequest(payload),payload);
  for(const patch of [{verified:true},{buyerConfirmed:true},{discoverable:'true'},{status:null},{requirements:{year:'twenty twenty'}},{requirements:{email:'secret@example.test'}},{budget:{currency:'$',maxAmount:4,basis:'total'}},{budget:{currency:'NGN',maxAmount:1.001,basis:'total'}},{validForDays:31}])assert.throws(()=>validateBuyerRequest({...payload,...patch}));
});
test('Qualification compares explicit values while keeping identity, quantity, permission and reachability unresolved',()=>{
  const record={id:R,revision:1,payload,origin:'buyer_submitted',expires_at:'2026-11-01'};
  const result=qualifyBuyerRequest(offer,record,{now:new Date('2026-10-23')});
  assert.equal(result.state,'possible_match');assert.equal(result.buyerConfirmed,false);assert.equal(result.permission.contactAllowed,false);
  assert.ok(result.missing.includes('budget'));assert.ok(result.unknown.includes('ability_to_buy'));
  const mismatched={...record,payload:{...payload,budget:{...payload.budget,maxAmount:35000000},requirements:{year:'2024'}}};
  assert.deepEqual(qualifyBuyerRequest(offer,mismatched,{now:new Date('2026-10-23')}).conflicts.map(c=>c.field),['budget','year']);
  for(const price of ['$50000000','NGN 35,00','Call for price'])assert.equal(qualifyBuyerRequest({...offer,fields:{...offer.fields,price}},record,{now:new Date('2026-10-23')}).checks.find(c=>c.field==='budget').state,'unknown');
  assert.equal(qualifyBuyerRequest(offer,{...record,payload:{...payload,location:'Ikeja, Lagos'}},{now:new Date('2026-10-23')}).checks.find(c=>c.field==='location').state,'unknown');
  assert.equal(qualifyBuyerRequest(offer,record,{now:new Date('2026-11-02')}).state,'unavailable');
  assert.equal(qualifyBuyerRequest(offer,{...record,payload:{...payload,discoverable:false}},{now:new Date('2026-10-23')}).state,'unavailable');
  assert.equal(qualifyBuyerRequest(offer,{...record,payload:{...payload,product:'C3000'}},{now:new Date('2026-10-23')}).productMatch,false);
  assert.equal(qualifySourceRequest(offer,{sourceCheck:{originalChecked:true,assessment:{state:'ambiguous_page'}}}).state,'attribution_unresolved');
});

test('Actual SQL and authenticated HTTP requests preserve request authorship, consent, versioning and bounded matching',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.jwt(),auth.uid() to anon,authenticated;`);
  await pg.query('insert into auth.users values($1,now()),($2,now()),($3,null)',[A,B,C]);
  for(const file of ['offer-versions','buyer-requests'])await pg.exec(await readFile(new URL('../database/'+file+'.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../database/buyer-requests.sql',import.meta.url),'utf8'));
  const claims=async(owner=A,anonymous=false)=>{await pg.exec('reset role');await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner,is_anonymous:anonymous})]);await pg.exec('set role authenticated');};
  const rpc=async(name,args)=>(await pg.query('select public.'+name+'('+Object.keys(args).map((k,i)=>k+'=> $'+(i+1)).join(',')+') as value',Object.values(args))).rows[0].value;
  const save=(input=payload,id=R,revision=0,key=randomUUID())=>rpc('save_pull_buyer_request',{p_request:id,p_expected_revision:revision,p_request_key:key,p_payload:input});
  const admin=async(sql,args=[])=>{await pg.exec('reset role');return pg.query(sql,args);};
  let anonymous=false;
  const transport=async(input,options={})=>{
    const url=new URL(input),body=options.body?JSON.parse(options.body):null,owner=options.headers?.Authorization?.replace('Bearer ','');
    if(url.pathname==='/auth/v1/user')return [A,B,C].includes(owner)?Response.json({id:owner,is_anonymous:anonymous}):Response.json({},{status:401});
    await claims(owner,anonymous);
    if(url.pathname.startsWith('/rest/v1/rpc/')){try{return Response.json(await rpc(url.pathname.split('/').pop(),body));}catch(error){return Response.json({code:error.code},{status:400});}}
    const table=url.pathname.split('/').pop(),columns=url.searchParams.get('select');
    assert.ok(['pull_buyer_requests','pull_offer_versions'].includes(table));assert.match(columns,/^[a-z_,]+$/);
    assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
    if(table==='pull_buyer_requests')return Response.json((await pg.query('select '+columns+' from public.pull_buyer_requests where user_id=$1 order by updated_at desc limit 100',[owner])).rows);
    return Response.json((await pg.query('select '+columns+' from public.pull_offer_versions where user_id=$1 and offer_id=$2 order by version desc limit 1',[owner,url.searchParams.get('offer_id').slice(3)])).rows);
  };
  const backend=createBackend({env,transport});
  const input={action:'save',requestId:R,expectedRevision:0,requestKey:randomUUID(),payload};
  const match=()=>backend.buyerRequests(http({action:'match',offerId:O,offerVersion:1},A));
  await claims(A);await rpc('save_pull_offer',{p_offer:O,p_expected_version:0,p_fields:offer.fields,p_exact_terms:offer.exactTerms});
  await t.test('A buyer saves an attributed request; retry adds no revision and the seller cannot directly read it',async()=>{
    const response=await backend.buyerRequests(http(input,B));assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.request.revision,1);assert.equal(data.request.user_id,undefined);
    assert.equal((await backend.buyerRequests(http(input,B))).status,200);
    assert.equal((await backend.buyerRequests(http(undefined,A))).status,200);
    assert.equal((await (await backend.buyerRequests(http(undefined,A))).json()).requests.length,0);
    const result=await (await match()).json();assert.equal(result.matches.length,1);assert.equal(result.matches[0].qualification.buyerConfirmed,false);
    assert.equal(result.matches[0].qualification.permission.contactAllowed,false);
    assert.ok(!JSON.stringify(result).includes(B));assert.ok(!JSON.stringify(result).includes('email_confirmed_at'));
  });
  await t.test('Permission, source, owner and verification flags cannot be injected',async()=>{
    for(const patch of [{verified:true},{ownerId:A},{source:{kind:'partner'}},{qualification:{buyerConfirmed:true}}])assert.equal((await backend.buyerRequests(http({...input,...patch},B))).status,400);
    assert.equal((await backend.buyerRequests(http({...input,payload:{...payload,verified:true}},B))).status,400);
    assert.equal((await backend.buyerRequests(http({...input,requestKey:randomUUID()},A))).status,403);
    assert.equal((await backend.buyerRequests(http({...input,requestId:randomUUID(),requestKey:randomUUID()},C))).status,403);
    anonymous=true;assert.equal((await backend.buyerRequests(http(input,B))).status,401);anonymous=false;
    const mismatch=http(undefined,B);mismatch.headers.set('X-Pull-Account',A);assert.equal((await backend.buyerRequests(mismatch)).status,409);
  });
  await t.test('Closing or withdrawing discovery removes a request; stale updates and reused keys fail',async()=>{
    const updated={...input,expectedRevision:1,requestKey:randomUUID(),payload:{...payload,discoverable:false}};
    assert.equal((await backend.buyerRequests(http(updated,B))).status,200);
    assert.equal((await (await match()).json()).matches.length,0);
    assert.equal((await backend.buyerRequests(http({...updated,requestKey:randomUUID()},B))).status,409);
    assert.equal((await backend.buyerRequests(http({...updated,payload},B))).status,400);
    // Replaying an older accepted save returns the latest withdrawn state.
    const replay=await (await backend.buyerRequests(http(input,B))).json();assert.equal(replay.request.revision,2);assert.equal(replay.request.payload.discoverable,false);
    assert.equal((await backend.buyerRequests(http({...updated,expectedRevision:2,requestKey:randomUUID(),payload:{...payload,status:'closed'}},B))).status,200);
    assert.equal((await (await match()).json()).matches.length,0);
  });
  await t.test('Direct RPC validates JSON nulls, unknown fields and money; direct table writes remain forbidden',async()=>{
    await claims(B);
    for(const patch of [{category:null},{status:null},{discoverable:null},{requirements:null},{verified:true},{budget:{currency:null,maxAmount:1,basis:'total'}},{budget:{currency:'NGN',maxAmount:1,basis:null}},{budget:{currency:'NGN',maxAmount:1.001,basis:'total'}}])await assert.rejects(save({...payload,...patch},randomUUID()),e=>e.code==='22023');
    await assert.rejects(pg.query('update public.pull_buyer_requests set payload=$1 where id=$2',[payload,R]),e=>e.code==='42501');
    await assert.rejects(pg.query('delete from public.pull_buyer_requests where id=$1',[R]),e=>e.code==='42501');
    await claims(A);assert.equal((await pg.query('select * from public.pull_buyer_request_versions')).rows.length,0);
    await claims(B,true);assert.equal((await pg.query('select * from public.pull_buyer_requests')).rows.length,0);await assert.rejects(save(payload,randomUUID()),e=>e.code==='42501');
  });
  await t.test('Expired, private, self-owned and nonmatching requests never enter matching results',async()=>{
    await claims(B);const expired=randomUUID(),privateId=randomUUID(),wrong=randomUUID();
    await save(payload,expired);await save({...payload,discoverable:false},privateId);await save({...payload,product:'Mercedes C3000'},wrong);
    await admin("update public.pull_buyer_requests set expires_at=now()-interval '1 second' where id=$1",[expired]);
    await claims(A);await save(payload,randomUUID());
    assert.equal((await (await match()).json()).matches.length,0);
  });
  await t.test('Services and wholesale use the same canonical request route, including punctuation and Unicode normalization',async()=>{
    for(const [product,term,category,location] of [['Office-cleaning','office cleaning','service','Abuja'],['Ｒｉｃｅ','Rice','wholesale','Kano']]){
      const id=randomUUID();await claims(A);await rpc('save_pull_offer',{p_offer:id,p_expected_version:0,p_fields:{product:term,location,category},p_exact_terms:[term]});
      await claims(B);await save({...payload,product,category,location},randomUUID());
      const response=await backend.buyerRequests(http({action:'match',offerId:id,offerVersion:1},A));assert.equal(response.status,200);assert.equal((await response.json()).matches.length,1);
    }
  });
  await t.test('A service request with the same model words cannot masquerade as a product purchase',async()=>{
    await claims(B);const id=randomUUID();await save({...payload,product:'C300 repair',category:'service'},id);
    assert.equal((await (await match()).json()).matches.length,0);
    await claims(A);const legacy=randomUUID();await rpc('save_pull_offer',{p_offer:legacy,p_expected_version:0,p_fields:{product:'C300',location:'Lagos'},p_exact_terms:['C300']});
    const response=await backend.buyerRequests(http({action:'match',offerId:legacy,offerVersion:1},A));assert.equal(response.status,400);assert.match((await response.json()).error,/choose product, service or wholesale/);
    await assert.rejects(rpc('match_pull_buyer_requests',{p_offer:legacy,p_offer_version:1}),e=>e.code==='22023');
  });
  await t.test('Latest offer revision is checked again inside the matching RPC',async()=>{
    await claims(A);await rpc('save_pull_offer',{p_offer:O,p_expected_version:1,p_fields:{...offer.fields,price:'NGN 44 million'},p_exact_terms:offer.exactTerms});
    assert.equal((await match()).status,409);
    await assert.rejects(rpc('match_pull_buyer_requests',{p_offer:O,p_offer_version:1}),e=>e.code==='40001');
  });
  await t.test('A matching pass returns at most 100 canonical requests and explains truncation',async()=>{
    const inserted=await admin("insert into public.pull_buyer_requests(id,user_id,revision,payload,expires_at) select md5('bound-test-'||n)::uuid,$1,1,$2,now()+interval '1 day' from generate_series(1,105)n returning id",[B,payload]);
    await claims(A);const result=await rpc('match_pull_buyer_requests',{p_offer:O,p_offer_version:2});
    assert.equal(result.requests.length,100);assert.equal(result.hasMore,true);assert.ok(result.requests.every(row=>row.user_id===undefined));
    await admin('delete from public.pull_buyer_requests where id=any($1::uuid[])',[inserted.rows.map(r=>r.id)]);
  });
  await t.test('Daily lookup and save quotas are enforced by SQL without new paid providers',async()=>{
    await admin("insert into pull_private.buyer_request_lookups values($1,(now() at time zone 'UTC')::date,200) on conflict(user_id,lookup_day) do update set used=200",[A]);
    await claims(A);await assert.rejects(rpc('match_pull_buyer_requests',{p_offer:O,p_offer_version:2}),e=>e.code==='P0001');
    // Seed the owner quota with valid distinct request history rows.
    await admin('insert into public.pull_buyer_request_versions(request_id,user_id,revision,request_key,payload) select $1,$2,n,md5(n::text)::uuid,$3 from generate_series(10,59) n',[R,B,payload]);
    await claims(B);await assert.rejects(save(payload,randomUUID()),e=>e.code==='P0001');
  });
  await t.test('Withdrawal remains available beyond the save quota, after many revisions, and after email confirmation changes',async()=>{
    await admin('update public.pull_buyer_requests set revision=101,payload=$1 where id=$2',[payload,R]);
    await admin('update auth.users set email_confirmed_at=null where id=$1',[B]);
    const body={action:'withdraw',requestId:R,expectedRevision:101,requestKey:randomUUID()};
    const response=await backend.buyerRequests(http(body,B));assert.equal(response.status,200);
    const saved=(await response.json()).request;assert.equal(saved.revision,102);assert.equal(saved.payload.status,'closed');assert.equal(saved.payload.discoverable,false);assert.equal(saved.payload.contactAllowed,false);
    assert.equal((await backend.buyerRequests(http(body,B))).status,200);
    assert.equal((await backend.buyerRequests(http({...body,requestKey:randomUUID()},A))).status,403);
    assert.equal((await backend.buyerRequests(http({...body,payload},B))).status,400);
    await admin('update auth.users set email_confirmed_at=now() where id=$1',[B]);
    await admin('update pull_private.buyer_request_lookups set used=1 where user_id=$1',[A]);
    await claims(A);const matches=await rpc('match_pull_buyer_requests',{p_offer:O,p_offer_version:2});assert.ok(matches.requests.every(r=>r.id!==R));
  });
});
