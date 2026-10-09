import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';

test('each deployed API exports a Vercel Web fetch handler and returns a Response',async()=>{
  for(const file of await readdir(new URL('../api/',import.meta.url))){
    if(!file.endsWith('.js'))continue;
    const {default:handler}=await import(new URL('../api/'+file,import.meta.url));
    assert.equal(typeof handler?.fetch,'function',file+' must use the Vercel Web API export');
    const response=await handler.fetch(new Request('https://pull.example/api/'+file.slice(0,-3),{method:'DELETE'}));
    assert.ok(response instanceof Response,file+' must return a Web Response');
    assert.equal(response.status,405,file+' rejects unsupported methods without a provider call');
  }
});
