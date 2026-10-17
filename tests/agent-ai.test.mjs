import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAgentPrompt,localGuidance,renderAgentAIView} from '../dist/agent-ai.js';

const escape=value=>String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const base={cloud:{user:null,verified:false,revision:0,dirty:false},agentState:{tokens:[]},state:{mode:'empty',persona:'trade',identity:'My cars',context:'company',offer:'Verified used cars',rules:{roles:'',industries:'Automotive',countries:'Nigeria'},shortlist:[]},assistantState:{draft:'',error:'',messages:[],agentMessages:[],mode:'pull',shareContext:true},items:[],escape,icon:()=>''};

test('Own-agent prompt requires a question and never inserts credentials or prospect records',()=>{
  assert.throws(()=>buildAgentPrompt('  '));
  const prompt=buildAgentPrompt('Find gaps',{connected:true,includeBrief:true,brief:{identity:'Dealer',token:'secret',email:'private@example.test'}});
  assert.match(prompt,/connected Pull GTM MCP tools/);
  assert.ok(!prompt.includes('secret'));
  assert.ok(!prompt.includes('private@example.test'));
  assert.match(buildAgentPrompt('Find gaps'),/do not have access to my Pull GTM workspace/i);
});

test('AI mode offers a direct chat and local evidence guidance before an MCP key exists',()=>{
  const html=renderAgentAIView(base);
  assert.match(html,/Start with your own list/);
  assert.match(html,/Ask Pull anything about your business/);
  assert.match(html,/Sign in to chat/);
  assert.ok(!html.includes('Paste this into your assistant'));
  const guidance=localGuidance({mode:'import',items:[{status:'fit'},{status:'review'}]});
  assert.equal(guidance.review,1);
  assert.match(guidance.title,/evidence/i);
});

test('An agent is optional; its answers remain separate and escaped from hosted Pull chat',()=>{
  const html=renderAgentAIView({...base,cloud:{user:{id:'A'},verified:true,revision:1,dirty:false},agentState:{tokens:[{id:'key',scopes:['workspace:read','chat:relay']}]},assistantState:{...base.assistantState,mode:'agent',agentMessages:[{id:'q',question:'Question <script>',status:'answered',answer:'Reply <img>',created_at:'2026-10-09T00:00:00Z',expires_at:'2026-10-09T00:10:00Z'}]}});
  assert.match(html,/My agent/);
  assert.match(html,/Your agent/);
  assert.ok(!html.includes('Question <script>'));
  assert.ok(!html.includes('Reply <img>'));
});
