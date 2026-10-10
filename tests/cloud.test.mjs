import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountGuard,cloudRequest} from '../dist/cloud.js';
test('A temporary outage invalidates old requests while retaining the known account',()=>{
  const guard=new AccountGuard();guard.set({id:'A'});const before=guard.ticket();guard.suspend();
  assert.equal(guard.user.id,'A');assert.equal(guard.current(before),false);assert.equal(guard.set({id:'A'}),false);assert.equal(guard.current(guard.ticket()),true);
});
test('Connection suspension cannot cancel successful logout cleanup for the unchanged account',()=>{
  const guard=new AccountGuard();guard.set({id:'A'});const logout=guard.ticket();guard.suspend();
  assert.equal(guard.current(logout),false);assert.equal(guard.sameAccount(logout),true);
  guard.set({id:'B'});assert.equal(guard.sameAccount(logout),false);
  guard.set({id:'A'});assert.equal(guard.sameAccount(logout),false);
});

test('Signing out and back into the same account cannot revive a pending load',()=>{
  const guard=new AccountGuard();
  guard.set({id:'A',email:'a@example.test'});
  const pendingLoad=guard.ticket();
  guard.set(null);
  guard.set({id:'A',email:'a@example.test'});
  assert.equal(guard.current(pendingLoad),false);
  assert.equal(guard.current(guard.ticket()),true);
});

test('A verified refresh of the same account preserves its pending work',()=>{
  const guard=new AccountGuard();
  guard.set({id:'A',email:'a@example.test'});
  const pendingLoad=guard.ticket();
  assert.equal(guard.set({id:'A',email:'a@example.test'}),false);
  assert.equal(guard.current(pendingLoad),true);
});

test('Account invalidation permanently rejects earlier operation tickets',()=>{
  const guard=new AccountGuard();
  guard.set({id:'A'});
  const pendingSave=guard.ticket();
  guard.invalidate();
  assert.throws(()=>guard.ticket(),/Sign in/);
  guard.set({id:'A'});
  assert.equal(guard.current(pendingSave),false);
});


test('A hung discovery request settles with a useful timeout and aborts its network request',async()=>{
  const original=globalThis.fetch;let aborted=false;
  globalThis.fetch=(_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true}));
  try{await assert.rejects(cloudRequest('discovery',{audience:'CEO'},'A',{timeoutMs:5}),/search timed out/);assert.equal(aborted,true);}finally{globalThis.fetch=original;}
});
