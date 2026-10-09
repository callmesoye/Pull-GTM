import test from 'node:test';
import assert from 'node:assert/strict';
import {testAgentConnection} from '../server/agent-test.js';
const endpoint='https://project.supabase.co/functions/v1/pull-mcp',token='pull_agent_'+'a'.repeat(43);
test('Connection check initializes and discovers real tools at its fixed destination without fetching workspace data',async()=>{
 const calls=[];const transport=async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,options,body});return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='initialize'?{protocolVersion:'2025-06-18',capabilities:{tools:{}}}:{tools:[{name:'get_workspace_summary'},{name:'list_reviewed_prospects'}]}});};
 const result=await testAgentConnection({endpoint,token,transport});assert.equal(result.reachable,true);assert.deepEqual(calls.map(c=>c.body.method),['initialize','tools/list']);assert.ok(calls.every(c=>c.url===endpoint&&c.options.redirect==='error'&&c.options.headers.Authorization==='Bearer '+token));assert.ok(!JSON.stringify(result).includes(token));
});
test('Connection check does not echo errors, tokens or unknown tools as a success',async()=>{
 for(const status of [401,403,429,500]){const r=await testAgentConnection({endpoint,token,transport:async()=>new Response(token,{status})});assert.ok(r.status>=400);assert.ok(!JSON.stringify(r).includes(token));}
 const r=await testAgentConnection({endpoint,token,transport:async()=>Response.json({jsonrpc:'2.0',id:999,result:{}})});assert.equal(r.status,503);
 let called=false;assert.equal((await testAgentConnection({endpoint,token:'bad',transport:async()=>{called=true;}})).status,400);assert.equal(called,false);
});
