import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAuth,createEmailAuth,emailConfiguration} from '../server/auth.js';

const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',PULL_APP_URL:'https://pull.example',PULL_OAUTH_COOKIE_SECRET:'fixture-cookie-key-at-least-thirty-two-characters'};
const post=(body,{origin='https://pull.example',url='https://pull.example/api/auth',cookie='',headers={}}={})=>new Request(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const get=(query,cookie='')=>new Request('https://pull.example/api/auth?'+query,{headers:{Cookie:cookie}});
const cookie=response=>response.headers.getSetCookie().filter(c=>!c.includes('Max-Age=0')).map(c=>c.split(';')[0]).join('; ');
const normalCookies=response=>response.headers.getSetCookie().filter(c=>/^__Host-pull-(access|refresh)=/.test(c));

function fixture({emailStatus=200,exchangeStatus=200,verifyStatus=200,updateStatus=200,outage=false,userChanges={},sessionChanges={},updateUserChanges={}}={}) {
  let time=Date.parse('2026-10-17T12:00:00Z'),challenge;const calls=[],used=new Set();
  const transport=async(input,options)=>{
    const url=new URL(input),body=options.body?JSON.parse(options.body):null;calls.push({url,options,body});
    assert.equal(url.origin,env.SUPABASE_URL);assert.equal(options.headers.apikey,env.SUPABASE_PUBLISHABLE_KEY);assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
    if(outage)throw new Error('PRIVATE PROVIDER DETAILS');
    if(url.pathname==='/auth/v1/recover') {
      challenge=body.code_challenge;
      assert.equal(url.searchParams.get('redirect_to'),'https://pull.example/api/auth?flow=recovery');assert.equal(body.code_challenge_method,'s256');assert.match(challenge,/^[A-Za-z0-9_-]{43}$/);assert.deepEqual(Object.keys(body).sort(),['code_challenge','code_challenge_method','email']);
      return Response.json({secret:'not-for-browser'},{status:emailStatus});
    }
    if(url.pathname==='/auth/v1/resend') {
      assert.equal(url.searchParams.get('redirect_to'),'https://pull.example/api/auth?flow=confirmation');assert.deepEqual(body,{type:'signup',email:'person@example.test'});
      return Response.json({secret:'not-for-browser'},{status:emailStatus});
    }
    if(url.pathname==='/auth/v1/token') {
      assert.equal(url.searchParams.get('grant_type'),'pkce');assert.equal(options.method,'POST');
      if(body.auth_code!=='recovery-code'||used.has(body.auth_code)||createHash('sha256').update(body.code_verifier).digest('base64url')!==challenge) return Response.json({error:'bad_code'},{status:400});
      used.add(body.auth_code);
      return Response.json({access_token:'recovery-access',refresh_token:'recovery-refresh',expires_in:3600,user:{id:'recovery-user'},...sessionChanges},{status:exchangeStatus});
    }
    if(url.pathname==='/auth/v1/user') {
      assert.equal(options.headers.Authorization,'Bearer recovery-access');
      if(options.method==='PUT')return Response.json({id:'recovery-user',email:'person@example.test',...updateUserChanges},{status:updateStatus});
      return Response.json({id:'recovery-user',email:'person@example.test',...userChanges},{status:verifyStatus});
    }
    if(url.pathname==='/auth/v1/verify') {
      assert.deepEqual(body,{token_hash:'confirmation-token',type:'email'});
      if(used.has(body.token_hash))return Response.json({error:'expired'},{status:400});
      used.add(body.token_hash);
      return Response.json({access_token:'confirmation-access',refresh_token:'confirmation-refresh',expires_in:3600,user:{id:'confirmed-user'}},{status:verifyStatus});
    }
    if(url.pathname==='/auth/v1/logout') return new Response(null,{status:204});
    throw new Error('Unexpected provider endpoint');
  };
  const auth=createAuth({env,transport,now:()=>time});
  const begin=async()=>{const response=await auth(post({action:'recover',email:'person@example.test'}));assert.equal(response.status,200);return cookie(response);};
  const recover=async()=>{const response=await auth(get('flow=recovery&code=recovery-code',await begin()));assert.equal(response.headers.get('Location'),'https://pull.example/#auth=recovery');return {response,cookies:cookie(response)};};
  return {auth,calls,begin,recover,advance:ms=>{time+=ms;}};
}

test('Email lifecycle requires a safe app origin and signing secret independently of Google',async()=>{
  assert.ok(emailConfiguration(env));
  for(const changes of [{PULL_APP_URL:'http://public.example'},{PULL_APP_URL:'https://pull.example/path'},{PULL_APP_URL:'https://name:password@pull.example'},{PULL_OAUTH_COOKIE_SECRET:'short'},{SUPABASE_PUBLISHABLE_KEY:'sb_secret_bad'}]) {
    const bad={...env,...changes};assert.equal(emailConfiguration(bad),null);
    assert.equal((await createEmailAuth({env:bad})(post({action:'recover',email:'person@example.test'}))).status,503);
  }
  assert.ok(emailConfiguration({...env,PULL_APP_URL:'http://127.0.0.1:4173'}));assert.equal(emailConfiguration({...env,PULL_APP_URL:'http://127.0.0.1:4173',NODE_ENV:'production'}),null);
});

test('Email requests reject cross-origin, forged host, redirect inputs and malformed bodies before provider calls',async()=>{
  const {auth,calls}=fixture();
  for(const [request,status] of [[post({action:'recover',email:'person@example.test'},{origin:'https://evil.example'}),403],[post({action:'recover',email:'person@example.test'},{url:'https://evil.example/api/auth'}),403],[post({action:'recover',email:'person@example.test'},{headers:{'Sec-Fetch-Site':'cross-site'}}),403],[post({action:'recover',email:'person@example.test',redirectTo:'https://evil.example'}),400],[post({action:'resend-confirmation',email:'invalid'}),400],[post({action:'recover',email:'a@b.example\r\nX-Injected:true'}),400],[post('{'),400],[post('x'.repeat(2049)),413],[post({action:'recover'},{headers:{'Content-Type':'text/plain'}}),415]]) {
    const response=await auth(request);assert.equal(response.status,status);assert.equal(response.headers.getSetCookie().length,0);
  }
  assert.equal(calls.length,0);
});

test('Confirmation resends use fixed signup type and generic, token-free response',async()=>{
  const {auth,calls}=fixture(),response=await auth(post({action:'resend-confirmation',email:'person@example.test'}));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{emailRequested:true});assert.equal(calls.length,1);assert.equal(normalCookies(response).length,0);assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(calls[0].url.pathname,'/auth/v1/resend');
});

test('Recovery email starts a random browser-bound PKCE flow without exposing a verifier or token',async()=>{
  const f=fixture(),response=await f.auth(post({action:'recover',email:'person@example.test'}));
  assert.deepEqual(await response.json(),{emailRequested:true});const saved=cookie(response);
  assert.match(saved,/^__Host-pull-recovery-verifier=/);
  for(const flag of ['HttpOnly','Secure','SameSite=Lax','Path=/','Max-Age=3600'])assert.ok(response.headers.getSetCookie()[0].includes(flag));
  const stored=JSON.parse(Buffer.from(decodeURIComponent(saved.split('=')[1]).split('.')[0],'base64url'));
  assert.equal(stored.purpose,'recovery-link');assert.equal(stored.verifier.length,64);
  assert.equal(createHash('sha256').update(stored.verifier).digest('base64url'),f.calls[0].body.code_challenge);assert.ok(!JSON.stringify(f.calls[0]).includes(stored.verifier));
  const second=await f.auth(post({action:'recover',email:'person@example.test'}));assert.notEqual(cookie(second),saved);assert.equal(normalCookies(response).length,0);
});

test('Verified recovery creates only a separate, short-lived HttpOnly password capability',async()=>{
  const f=fixture(),{response,cookies}=await f.recover();
  assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'https://pull.example/#auth=recovery');assert.equal(await response.text(),'');
  assert.equal(normalCookies(response).length,0);assert.ok(!cookies.includes('recovery-refresh'));assert.ok(!response.headers.get('Location').includes('recovery-access'));
  for(const c of response.headers.getSetCookie().filter(c=>!c.includes('Max-Age=0')))for(const flag of ['HttpOnly','Secure','SameSite=Lax','Max-Age=600'])assert.ok(c.includes(flag));
  assert.equal(f.calls.length,3);assert.ok(response.headers.getSetCookie().some(c=>c.includes('recovery-verifier=;')&&c.includes('Max-Age=0')));
});

test('Missing, forged, duplicated, expired and wrong-purpose recovery verifiers cannot exchange codes',async()=>{
  const f=fixture(),saved=await f.begin();
  for(const invalid of ['',saved+'; '+saved,saved.slice(0,-1)+'!',saved.replace('recovery-verifier=','oauth=')]) {
    const response=await f.auth(get('flow=recovery&code=recovery-code',invalid));assert.equal(response.headers.get('Location'),'https://pull.example/#auth=error');assert.equal(cookie(response),'');
  }
  f.advance(3600000);const expired=await f.auth(get('flow=recovery&code=recovery-code',saved));assert.equal(expired.headers.get('Location'),'https://pull.example/#auth=error');assert.equal(f.calls.length,1);
});

test('Recovery code replay and cancelled or redirected callbacks issue no recovery capability',async()=>{
  const f=fixture(),saved=await f.begin();
  assert.equal((await f.auth(get('flow=recovery&code=recovery-code',saved))).headers.get('Location'),'https://pull.example/#auth=recovery');
  const replay=await f.auth(get('flow=recovery&code=recovery-code',saved));assert.equal(replay.headers.get('Location'),'https://pull.example/#auth=error');assert.equal(cookie(replay),'');
  const count=f.calls.length;
  for(const query of ['flow=recovery&error=secret','flow=recovery&code=a&code=b','flow=recovery&code=recovery-code&next=https://evil.example','flow=recovery&code=%0a','flow=other&code=recovery-code']) {
    const response=await f.auth(get(query,saved));assert.equal(response.headers.get('Location'),'https://pull.example/#auth=error');assert.equal(cookie(response),'');
  }
  assert.equal(f.calls.length,count);
});

test('Anonymous, inconsistent or malformed provider sessions never authorize password updates',async()=>{
  for(const options of [{exchangeStatus:503},{verifyStatus:401},{userChanges:{is_anonymous:true}},{userChanges:{id:'other-user'}},{sessionChanges:{refresh_token:null}},{sessionChanges:{expires_in:'3600'}}]) {
    const f=fixture(options),response=await f.auth(get('flow=recovery&code=recovery-code',await f.begin()));
    assert.equal(response.headers.get('Location'),'https://pull.example/#auth=error');assert.equal(cookie(response),'');assert.equal(normalCookies(response).length,0);
  }
});

test('A reset changes only its verified recovery identity, clears capability and requires fresh login',async()=>{
  const f=fixture(),{cookies}=await f.recover();
  const response=await f.auth(post({action:'update-password',password:'new-password-123'},{cookie:cookies+'; __Host-pull-access=other-account; __Host-pull-refresh=other-refresh'}));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{passwordUpdated:true,user:null});assert.equal(normalCookies(response).length,0);
  assert.ok(response.headers.getSetCookie().every(c=>c.includes('recovery-')&&c.includes('Max-Age=0')));
  const mutation=f.calls.find(c=>c.options.method==='PUT');assert.deepEqual(mutation.body,{password:'new-password-123'});assert.equal(mutation.options.headers.Authorization,'Bearer recovery-access');assert.equal(f.calls.at(-1).url.pathname,'/auth/v1/logout');
});

test('Ordinary sessions, mismatched recovery cookies and expired capabilities cannot change passwords',async()=>{
  const f=fixture(),{cookies}=await f.recover(),count=f.calls.length;
  for(const invalid of ['__Host-pull-access=normal-account; __Host-pull-refresh=normal-refresh',cookies.replace('recovery-access=recovery-access','recovery-access=other-access'),cookies+'; '+cookies]) {
    const response=await f.auth(post({action:'update-password',password:'new-password-123'},{cookie:invalid}));assert.equal(response.status,401);
  }
  f.advance(600000);assert.equal((await f.auth(post({action:'update-password',password:'new-password-123'},{cookie:cookies}))).status,401);assert.equal(f.calls.length,count);
});

test('Bad password requests do not mutate the provider and provider rejection preserves the retry capability',async()=>{
  const f=fixture({updateStatus:422}),{cookies}=await f.recover(),count=f.calls.length;
  for(const body of [{action:'update-password',password:'short'},{action:'update-password',password:'new-password-123',access_token:'forged'}])assert.equal((await f.auth(post(body,{cookie:cookies}))).status,400);
  assert.equal(f.calls.length,count);
  const response=await f.auth(post({action:'update-password',password:'new-password-123'},{cookie:cookies}));assert.equal(response.status,400);assert.equal(response.headers.getSetCookie().length,0);assert.ok(!(await response.text()).includes('not-for-browser'));
});

test('Email provider limits and outages return sanitized failures without retrying delivery',async()=>{
  for(const [options,status] of [[{emailStatus:429},429],[{emailStatus:503},503],[{outage:true},503]]) {
    const f=fixture(options),response=await f.auth(post({action:'recover',email:'person@example.test'}));assert.equal(response.status,status);assert.equal(f.calls.length,1);assert.equal(response.headers.getSetCookie().length,0);assert.ok(!(await response.text()).includes('PRIVATE'));
  }
  const f=fixture({emailStatus:422}),response=await f.auth(post({action:'resend-confirmation',email:'person@example.test'}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{emailRequested:true});
  const recovery=await f.auth(post({action:'recover',email:'person@example.test'}));assert.equal(recovery.status,200);assert.deepEqual(await recovery.json(),{emailRequested:true});assert.match(cookie(recovery),/^__Host-pull-recovery-verifier=/);
});

test('Password provider failures do not issue ordinary sessions or silently retry a password mutation',async()=>{
  for(const [options,status] of [[{updateStatus:429},429],[{updateStatus:503},503],[{updateUserChanges:{id:'unexpected-account'}},503]]) {
    const f=fixture(options),{cookies}=await f.recover();
    const response=await f.auth(post({action:'update-password',password:'new-password-123'},{cookie:cookies}));
    assert.equal(response.status,status);assert.equal(f.calls.filter(c=>c.options.method==='PUT').length,1);assert.equal(normalCookies(response).length,0);
    if(options.updateStatus)assert.equal(response.headers.getSetCookie().length,0);
    else assert.ok(response.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
  }
});

test('Confirmation verifies once on the server, revokes its granted session and returns to fresh sign-in',async()=>{
  const f=fixture(),response=await f.auth(get('flow=confirmation&token_hash=confirmation-token&type=email'));
  assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'https://pull.example/#auth=confirmed');assert.equal(response.headers.getSetCookie().length,0);assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');assert.equal(f.calls.length,2);assert.equal(f.calls.at(-1).options.headers.Authorization,'Bearer confirmation-access');
  assert.equal((await f.auth(get('flow=confirmation&token_hash=confirmation-token&type=email'))).headers.get('Location'),'https://pull.example/#auth=error');
});

test('Confirmation rejects recovery types, duplicate tokens and untrusted redirects without a provider call',async()=>{
  const f=fixture();
  for(const query of ['flow=confirmation&token_hash=confirmation-token&type=recovery','flow=confirmation&token_hash=one&token_hash=two&type=email','flow=confirmation&token_hash=confirmation-token&type=email&next=https://evil.example','flow=confirmation&token_hash=%0a&type=email']) {
    const response=await f.auth(get(query));assert.equal(response.headers.get('Location'),'https://pull.example/#auth=error');assert.equal(response.headers.getSetCookie().length,0);
  }
  assert.equal(f.calls.length,0);
});
