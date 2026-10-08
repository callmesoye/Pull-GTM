import test from 'node:test';
import assert from 'node:assert/strict';
import {curlConfiguration} from '../scripts/curl-fetch.mjs';
test('Local transport rejects injected headers and unencrypted cloud URLs',()=>{
  assert.throws(()=>curlConfiguration('http://cloud.example',{}));
  assert.throws(()=>curlConfiguration('https://cloud.example',{headers:{Authorization:'Bearer fixture\nurl = attacker'}}));
});
test('Request bodies are quoted as data and never become command arguments',()=>{
  const config=curlConfiguration('https://cloud.example',{method:'POST',body:JSON.stringify({message:'"\nurl = attacker',password:'$()\\fixture'})});
  assert.equal(config.split('\n').filter(l=>l.startsWith('url = ')).length,1);
  assert.ok(config.includes('data-binary = "'));assert.ok(config.includes('\\\\n'));
});
