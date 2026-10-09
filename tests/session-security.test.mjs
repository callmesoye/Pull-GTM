import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackend} from '../server/backend.js';
import {createClient} from '../server/supabase-rest.js';
import {createAutomationsBackend} from '../server/automations.js';

const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
const session={access_token:'valid-A',refresh_token:'refresh-A',expires_in:3600,user:{id:'A'}};
const request=(body,cookie='')=>new Request('https://pull.example/api/session',{
  method:body===undefined?'GET':'POST',headers:{Origin:'https://pull.example','Content-Type':'application/json',Cookie:cookie},
  body:body===undefined?undefined:JSON.stringify(body)
});

function fixture({providerSession=session,verifiedUser={id:'A',email:'a@example.test',is_anonymous:false},userStatus=200,confirmation=false}={}) {
  const calls=[];
  const transport=async(input,options)=>{
    const url=new URL(input);calls.push({url,options});
    if(url.pathname==='/auth/v1/token')return Response.json(providerSession);
    if(url.pathname==='/auth/v1/signup')return Response.json(confirmation?{id:'A',email:'a@example.test'}:providerSession);
    if(url.pathname==='/auth/v1/user'){
      if(options.headers.Authorization==='Bearer expired')return Response.json({},{status:401});
      return Response.json(verifiedUser,{status:userStatus});
    }
    throw new Error('Unexpected data access');
  };
  const clientFactory=(url,key,options)=>createClient(url,key,{...options,global:{...options.global,fetch:transport}});
  const backend=createBackend({env,clientFactory}),automations=createAutomationsBackend({env,clientFactory});
  return {backend,automations,calls};
}

const login={action:'login',email:'a@example.test',password:'fixture-password'};
const malformed=[
  {...session,access_token:undefined}, {...session,access_token:''},
  {...session,refresh_token:undefined}, {...session,refresh_token:''},
  {...session,access_token:'x'.repeat(3801)}, {...session,refresh_token:'é'.repeat(1000)},
  {...session,expires_in:'3600'}, {...session,expires_in:0},
  {...session,expires_in:-1}, {...session,expires_in:1.5},
  {...session,expires_in:Number.MAX_SAFE_INTEGER+1}
];

test('Malformed successful password-login responses never become sessions or confirmation prompts',async()=>{
  for(const providerSession of malformed){
    const f=fixture({providerSession}),response=await f.backend.session(request(login));
    assert.equal(response.status,503,JSON.stringify({access:providerSession.access_token?.length,refresh:providerSession.refresh_token?.length,expiry:providerSession.expires_in}));
    assert.equal(response.headers.getSetCookie().length,0);
    assert.ok(!(await response.text()).includes('confirmationRequired'));
  }
});

test('Malformed successful refresh responses preserve existing browser cookies and return a retryable failure',async()=>{
  for(const providerSession of malformed){
    const f=fixture({providerSession}),response=await f.backend.session(request(undefined,'__Host-pull-access=expired; __Host-pull-refresh=refresh-A'));
    assert.equal(response.status,503);
    assert.equal(response.headers.getSetCookie().length,0);
    assert.ok(!f.calls.some(c=>c.url.pathname.startsWith('/rest/')));
  }
});

test('Login cookies require a verified nonanonymous identity matching the provider session',async()=>{
  for(const changes of [{userStatus:401},{verifiedUser:null},{verifiedUser:{}},{verifiedUser:{id:'',is_anonymous:false}},{verifiedUser:{id:'A',is_anonymous:true}},{verifiedUser:{id:'B',is_anonymous:false}}]){
    const f=fixture(changes),response=await f.backend.session(request(login));
    assert.equal(response.status,503);
    assert.equal(response.headers.getSetCookie().length,0);
  }
  const f=fixture(),response=await f.backend.session(request(login));
  assert.equal(response.status,200);
  assert.deepEqual(f.calls.map(c=>c.url.pathname),['/auth/v1/token','/auth/v1/user']);
  assert.equal(response.headers.getSetCookie().length,2);
  const body=await response.text();assert.ok(!body.includes('valid-A'));assert.ok(!body.includes('refresh-A'));
});

test('Refresh identity mismatch never installs the renewed cookies',async()=>{
  const f=fixture({verifiedUser:{id:'B',is_anonymous:false}});
  const response=await f.backend.session(request(undefined,'__Host-pull-access=expired; __Host-pull-refresh=refresh-A'));
  assert.equal(response.status,503);
  assert.equal(response.headers.getSetCookie().length,0);
});

test('Legitimate confirmation-required signup remains available without issuing session cookies',async()=>{
  const f=fixture({confirmation:true}),response=await f.backend.session(request({...login,action:'signup'}));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{user:null,confirmationRequired:true});
  assert.equal(response.headers.getSetCookie().length,0);
});

const automationRequest=()=>new Request('https://pull.example/api/automations',{headers:{Cookie:'__Host-pull-access=expired; __Host-pull-refresh=refresh-A','X-Pull-Account':'A'}});

test('Malformed automation refresh responses cannot clear or replace session cookies or access data',async()=>{
  for(const providerSession of malformed){
    const f=fixture({providerSession}),response=await f.automations(automationRequest());
    assert.equal(response.status,503);
    assert.equal(response.headers.getSetCookie().length,0);
    assert.ok(!f.calls.some(c=>c.url.pathname.startsWith('/rest/')));
  }
});

test('Automation refresh identity mismatch cannot issue cookies or query another account',async()=>{
  const f=fixture({providerSession:{...session,user:{id:'B'}}}),response=await f.automations(automationRequest());
  assert.equal(response.status,503);
  assert.equal(response.headers.getSetCookie().length,0);
  assert.ok(!f.calls.some(c=>c.url.pathname.startsWith('/rest/')));
});
