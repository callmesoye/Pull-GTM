import test from 'node:test';
import assert from 'node:assert/strict';
import {clientConfiguration,clients,createConnectExperience,SUPPORT,MCP_ENDPOINT} from '../dist/connect.js';
const token='pull_agent_'+'x'.repeat(43);
test('Client setups keep secrets in authentication rather than the MCP address',()=>{
 const cursor=JSON.parse(clientConfiguration('cursor',MCP_ENDPOINT,token));assert.equal(cursor.mcpServers.pull.url,MCP_ENDPOINT);assert.equal(cursor.mcpServers.pull.headers.Authorization,'Bearer '+token);
 assert.match(clientConfiguration('claude-code',MCP_ENDPOINT,token),/--transport http/);assert.match(clientConfiguration('codex',MCP_ENDPOINT,token),/\[mcp_servers.pull\]/);
 assert.equal(clientConfiguration('claude',MCP_ENDPOINT,token),'Bearer '+token);
 for(const url of ['http://insecure.test','https://safe.test/?token=secret','https://user:pass@safe.test','https://safe.test/#token'])assert.throws(()=>clientConfiguration('cursor',url,token));
 assert.throws(()=>clientConfiguration('cursor',MCP_ENDPOINT,'not-a-token'));
});
test('Unsupported and conditional clients do not claim ready status',()=>{
 assert.equal(clients.find(c=>c.id==='chatgpt').kind,'pending');assert.equal(clients.find(c=>c.id==='claude').kind,'conditional');
});
test('Support uses the owner-provided email and booking URL and routes to messaging',()=>{
 const old=globalThis.document;globalThis.document={addEventListener(){}};
 try{const experience=createConnectExperience({getCloud:()=>({user:null}),getWorkspace:()=>({}),request(){},getAccountTicket(){},isAccountCurrent(){},navigate(){},toast(){},account(){},render(){}});
 const html=experience.renderSupport();assert.ok(html.includes('mailto:'+SUPPORT.email));assert.ok(html.includes(SUPPORT.booking));assert.ok(html.includes('/messaging/compose/'));assert.ok(!html.includes('24/7'));
 const connect=experience.renderConnect();assert.ok(connect.includes('Sign in to create access'));assert.ok(!connect.includes('Server check passed'));
 }finally{globalThis.document=old;}
});
