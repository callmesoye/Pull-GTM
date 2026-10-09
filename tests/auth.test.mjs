import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createGoogleAuth,googleConfiguration} from '../server/auth.js';

const env = {SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',PULL_APP_URL:'https://pull.example',GOOGLE_AUTH_ENABLED:'true',PULL_OAUTH_COOKIE_SECRET:'fixture-cookie-key-at-least-thirty-two-characters'};
const start = ({origin='https://pull.example',body={action:'start'},headers={},url='https://pull.example/api/auth'}={}) => new Request(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const callback = (cookie='',query='code=fixture-code') => new Request('https://pull.example/api/auth?'+query,{headers:{cookie}});
const temporaryCookie = response => response.headers.getSetCookie().find(c=>c.startsWith('__Host-pull-oauth=')).split(';')[0];
const sessionCookies = response => response.headers.getSetCookie().filter(c=>/^__Host-pull-(access|refresh)=/.test(c));

function fixture({outage=false,verifyStatus=200,anonymous=false,sessionChanges={},userChanges={}}={}) {
  let time=Date.parse('2026-10-08T18:00:00Z'),challenge=null;
  const calls=[],used=new Set();
  const transport=async (input,options)=>{
    const url=new URL(input),body=options.body?JSON.parse(options.body):null;calls.push({url,options,body});
    if(outage)throw new Error('Offline');
    if(url.pathname==='/auth/v1/token'){
      assert.equal(options.headers.apikey,env.SUPABASE_PUBLISHABLE_KEY);assert.equal(url.searchParams.get('grant_type'),'pkce');
      assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.signal instanceof AbortSignal,true);
      if(body.auth_code!=='fixture-code'||used.has(body.auth_code)||createHash('sha256').update(body.code_verifier).digest('base64url')!==challenge)return Response.json({error:'bad_code'},{status:400});
      used.add(body.auth_code);
      return Response.json({access_token:'access-fixture',refresh_token:'refresh-fixture',expires_in:3600,user:{id:'fixture-user'},provider_token:'private-google-token',...sessionChanges});
    }
    if(url.pathname==='/auth/v1/user'){
      assert.equal(options.headers.Authorization,'Bearer access-fixture');
      return Response.json({id:'fixture-user',email:'person@example.test',is_anonymous:anonymous,...userChanges},{status:verifyStatus});
    }
    throw new Error('Unexpected provider endpoint');
  };
  const auth=createGoogleAuth({env,transport,now:()=>time});
  return {auth,calls,advance:ms=>{time+=ms;},begin:async()=>{
    const response=await auth(start());assert.equal(response.status,200);const destination=new URL((await response.json()).url);challenge=destination.searchParams.get('code_challenge');return {response,destination,cookie:temporaryCookie(response)};
  }};
}

test('Google starts only after complete safe server configuration',async()=>{
  for(const change of [{GOOGLE_AUTH_ENABLED:'false'},{PULL_OAUTH_COOKIE_SECRET:''},{PULL_APP_URL:'https://pull.example/other'},{PULL_APP_URL:'https://name:password@pull.example'},{SUPABASE_PUBLISHABLE_KEY:'sb_secret_bad'},{PULL_APP_URL:'http://public.example'}]){
    assert.equal(googleConfiguration({...env,...change}),null);
    const response=await createGoogleAuth({env:{...env,...change}})(start());assert.equal(response.status,503);assert.equal(response.headers.getSetCookie().length,0);
  }
  assert.ok(googleConfiguration(env));
});

test('Start rejects cross-site, forged-host, malformed, non-JSON and oversized requests',async()=>{
  const {auth,calls}=fixture();
  for(const [request,status] of [[start({origin:'https://evil.example'}),403],[start({headers:{'Sec-Fetch-Site':'cross-site'}}),403],[start({url:'https://evil.example/api/auth'}),403],[start({body:{action:'start',provider:'github'}}),400],[start({body:'{'}),400],[start({headers:{'Content-Type':'text/plain'}}),415],[start({body:'x'.repeat(2049)}),413]]){
    const response=await auth(request);assert.equal(response.status,status);assert.equal(response.headers.getSetCookie().length,0);
  }
  assert.equal(calls.length,0);
});

test('PKCE starts with random SHA-256 challenges and a signed HttpOnly temporary cookie',async()=>{
  const f=fixture(),first=await f.begin(),second=await f.begin();
  assert.equal(first.destination.origin,env.SUPABASE_URL);assert.equal(first.destination.pathname,'/auth/v1/authorize');
  assert.equal(first.destination.searchParams.get('provider'),'google');assert.equal(first.destination.searchParams.get('code_challenge_method'),'s256');
  assert.equal(first.destination.searchParams.get('redirect_to'),'https://pull.example/api/auth');assert.notEqual(first.destination.searchParams.get('code_challenge'),second.destination.searchParams.get('code_challenge'));
  const cookie=first.response.headers.getSetCookie()[0];for(const flag of ['Path=/','HttpOnly','Secure','SameSite=Lax','Max-Age=600'])assert.ok(cookie.includes(flag));
  const encoded=decodeURIComponent(first.cookie.split('=')[1]).split('.')[0],stored=JSON.parse(Buffer.from(encoded,'base64url'));
  assert.equal(stored.verifier.length,64);assert.ok(!first.destination.href.includes(stored.verifier));assert.ok(!first.destination.href.includes(env.PULL_OAUTH_COOKIE_SECRET));assert.equal(f.calls.length,0);
});

test('Verified callback exchanges the code once and exposes only HttpOnly application cookies',async()=>{
  const f=fixture(),{cookie}=await f.begin();const response=await f.auth(callback(cookie,'code=fixture-code&next=https%3A%2F%2Fevil.example'));
  assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'https://pull.example/#auth=success');assert.equal(await response.text(),'');
  assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
  assert.equal(f.calls.length,2);assert.ok(response.headers.getSetCookie().some(c=>c.startsWith('__Host-pull-oauth=;')&&c.includes('Max-Age=0')));
  assert.equal(sessionCookies(response).length,2);for(const cookie of sessionCookies(response))for(const flag of ['Path=/','HttpOnly','Secure','SameSite=Lax'])assert.ok(cookie.includes(flag));
  assert.ok(!JSON.stringify([...response.headers]).includes('private-google-token'));
});

test('Missing, duplicate, malformed and forged verifier cookies never reach the provider',async()=>{
  const f=fixture(),{cookie}=await f.begin();
  for(const invalid of ['',cookie+'; '+cookie,'__Host-pull-oauth=%not-encoded',cookie.slice(0,-1)+'!']){
    const response=await f.auth(callback(invalid));assert.equal(response.headers.get('Location'),'https://pull.example/#auth=error');assert.equal(sessionCookies(response).length,0);
  }
  assert.equal(f.calls.length,0);
});

test('Verifier expiry is enforced server-side rather than trusting cookie expiry',async()=>{
  const f=fixture(),{cookie}=await f.begin();f.advance(600000);
  const response=await f.auth(callback(cookie));assert.equal(response.headers.get('Location'),'https://pull.example/#auth=error');assert.equal(f.calls.length,0);
});

test('Replaying a used code or a consumed browser flow cannot create another session',async()=>{
  const f=fixture(),{cookie}=await f.begin();assert.equal((await f.auth(callback(cookie))).headers.get('Location'),'https://pull.example/#auth=success');
  const replay=await f.auth(callback(cookie));assert.equal(replay.headers.get('Location'),'https://pull.example/#auth=error');assert.equal(sessionCookies(replay).length,0);
  const withoutCookie=await f.auth(callback());assert.equal(withoutCookie.headers.get('Location'),'https://pull.example/#auth=error');assert.equal(sessionCookies(withoutCookie).length,0);
});

test('Cancelled or malformed callbacks consume only OAuth state and use a fixed safe redirect',async()=>{
  const f=fixture(),{cookie}=await f.begin();
  for(const query of ['error=access_denied&error_description=secret','code=a&code=b','next=//evil.example','code=%0D%0A','code=']){
    const response=await f.auth(callback(cookie+'; __Host-pull-access=existing-access',query));assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'https://pull.example/#auth=error');assert.equal(sessionCookies(response).length,0);assert.ok(!(await response.text()).includes('secret'));
  }
  assert.equal(f.calls.length,0);
});

test('Provider outage, anonymous identity and failed user verification never issue session cookies',async()=>{
  for(const options of [{outage:true},{verifyStatus:401},{anonymous:true},{userChanges:{id:''}},{sessionChanges:{refresh_token:null}},{sessionChanges:{expires_in:'3600'}},{sessionChanges:{user:{id:'different-user'}}}]){
    const f=fixture(options),{cookie}=await f.begin(),response=await f.auth(callback(cookie));assert.equal(response.headers.get('Location'),'https://pull.example/#auth=error');assert.equal(sessionCookies(response).length,0);
  }
});

test('Unsupported methods are rejected and loopback HTTP is limited to development',async()=>{
  const response=await fixture().auth(new Request('https://pull.example/api/auth',{method:'DELETE'}));assert.equal(response.status,405);assert.equal(response.headers.get('Allow'),'GET, POST');
  assert.ok(googleConfiguration({...env,PULL_APP_URL:'http://localhost:4173'}));assert.equal(googleConfiguration({...env,PULL_APP_URL:'http://localhost:4173',NODE_ENV:'production'}),null);
});
