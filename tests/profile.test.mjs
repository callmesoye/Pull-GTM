import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackend} from '../server/backend.js';
import {createClient} from '../server/supabase-rest.js';

const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const request=(body,{account=A,cookieOwner=A,origin='https://pull.example'}={})=>new Request('https://pull.example/api/profile',{
  method:body===undefined?'GET':'POST',
  headers:{Origin:origin,'Content-Type':'application/json',...(cookieOwner?{Cookie:'__Host-pull-access=valid-'+cookieOwner}:{}),...(account?{'X-Pull-Account':account}:{})},
  body:body===undefined?undefined:JSON.stringify(body)
});

function fixture({anonymous=false}={}) {
  const profiles=new Map([A,B].map(id=>[id,{id,display_name:'Private '+id[0],created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'}]));
  const calls=[];
  const transport=async(input,options)=>{
    const url=new URL(input),body=options.body?JSON.parse(options.body):null;
    calls.push({url,options,body});
    const token=options.headers.Authorization?.replace('Bearer ','');
    const owner=token?.startsWith('valid-')?token.slice(6):null;
    if(url.pathname==='/auth/v1/user')return owner?Response.json({id:owner,email:owner[0]+'@example.test',is_anonymous:anonymous}):Response.json({},{status:401});
    assert.equal(url.pathname,'/rest/v1/pull_profiles');
    assert.equal(url.searchParams.get('id'),'eq.'+owner);
    assert.equal(url.searchParams.get('select'),'id,display_name,created_at,updated_at');
    const row=profiles.get(owner);
    if(options.method==='PATCH'){
      assert.deepEqual(Object.keys(body),['display_name']);
      if(row)profiles.set(owner,{...row,display_name:body.display_name,updated_at:'2026-10-08T00:00:00Z'});
    }else assert.equal(options.method,'GET');
    return Response.json(row?[profiles.get(owner)]:[]);
  };
  const backend=createBackend({env,clientFactory:(url,key,options)=>createClient(url,key,{...options,global:{...options.global,fetch:transport}})});
  return {backend,profiles,calls};
}

test('Profile reads use only the verified account row and expose no other account',async()=>{
  const f=fixture();
  for(const id of [A,B]){
    const response=await f.backend.profile(request(undefined,{account:id,cookieOwner:id}));
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).profile,f.profiles.get(id));
  }
  assert.ok(f.calls.filter(c=>c.url.pathname.startsWith('/rest/')).every(c=>!c.url.searchParams.has('user_id')));
});

test('A profile edit trims only display_name and preserves the other account and immutable columns',async()=>{
  const f=fixture(),beforeA=structuredClone(f.profiles.get(A)),beforeB=structuredClone(f.profiles.get(B));
  const response=await f.backend.profile(request({display_name:'  Ada Example  '}));
  assert.equal(response.status,200);
  assert.equal((await response.json()).profile.display_name,'Ada Example');
  assert.deepEqual(f.profiles.get(B),beforeB);
  assert.equal(f.profiles.get(A).id,beforeA.id);
  assert.equal(f.profiles.get(A).created_at,beforeA.created_at);
  assert.equal(f.calls.filter(c=>c.options.method==='PATCH').length,1);
});

test('Profile bodies cannot choose an owner, change timestamps, email, or create an admin role',async()=>{
  const f=fixture(),before=structuredClone([...f.profiles]);
  for(const forbidden of [{id:B},{user_id:B},{created_at:'2000-01-01'},{updated_at:'2000-01-01'},{role:'admin'},{email:'other@example.test'},{action:'delete'}]){
    const response=await f.backend.profile(request({display_name:'Wrong',...forbidden}));
    assert.equal(response.status,400,JSON.stringify(forbidden));
  }
  assert.deepEqual([...f.profiles],before);
  assert.ok(!f.calls.some(c=>c.url.pathname.startsWith('/rest/')));
});

test('Malformed profile names never reach the database',async()=>{
  const f=fixture();
  for(const name of [null,{},[],true,'x'.repeat(101),'Bad\u0000name','Bad\nname','Bad\u007fname']){
    assert.equal((await f.backend.profile(request({display_name:name}))).status,400);
  }
  assert.ok(!f.calls.some(c=>c.url.pathname.startsWith('/rest/')));
});

test('Anonymous, unauthenticated and stale-account profile requests cannot read or edit private data',async()=>{
  for(const [options,requestOptions,status] of [[{anonymous:true},{},401],[{}, {cookieOwner:null},401],[{}, {account:B},409],[{}, {account:null},409]]){
    const f=fixture(options);
    for(const body of [undefined,{display_name:'Wrong'}])assert.equal((await f.backend.profile(request(body,requestOptions))).status,status);
    assert.ok(!f.calls.some(c=>c.url.pathname.startsWith('/rest/')));
  }
});

test('Cross-site profile edits are rejected before provider calls',async()=>{
  const f=fixture();
  assert.equal((await f.backend.profile(request({display_name:'Wrong'},{origin:'https://evil.example'}))).status,403);
  assert.equal(f.calls.length,0);
});
