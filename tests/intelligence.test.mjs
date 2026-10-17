import test from 'node:test';
import assert from 'node:assert/strict';
import {generateReply} from '../server/ai.js';
import {createIntelligenceTools} from '../server/intelligence.js';
import {renderResearchResults} from '../dist/intelligence-ui.js';

const env={AI_GATEWAY_API_KEY:'fixture-server-key'};
const call=(name,args={})=>({id:'tool-1',type:'function',function:{name,arguments:JSON.stringify(args)}});
const model=message=>Response.json({choices:[{message}]});
const research={type:'research',configured:true,people:[{name:'Synthetic Person',title:'Founder',company:'Fixture Software',source_url:'https://example.test/team'}],input:{audience:'Founder',industry:'Software',location:'Lagos',source:'',limit:30},target:{requested:30,returned:1,remaining:29,status:'partial'},notice:'One match, 29 still needed.'};

test('Chat researches through its real backend tool and returns source results separately from model prose',async()=>{
  const requests=[],args=[];
  const result=await generateReply({env,userId:'owner',body:{message:'Find 30 software founders in Lagos'},tools:{search_prospects:async input=>{args.push(input);return research;}},transport:async(_url,options)=>{requests.push(JSON.parse(options.body));return requests.length===1?model({tool_calls:[call('search_prospects',research.input)]}):model({content:'Found one matching person; 29 still need evidence.'});}});
  assert.equal(args.length,1);assert.deepEqual(args[0],research.input);assert.deepEqual(result.research,[research]);
  const evidence=JSON.parse(requests[1].messages.find(m=>m.role==='tool').content);
  assert.equal(evidence.target.returned,1);assert.equal(evidence.people[0].source_url,'https://example.test/team');assert.equal(requests[1].tool_choice,'none');
  assert.ok(!JSON.stringify(result).includes(env.AI_GATEWAY_API_KEY));
});
test('Missing tool permission prevents research or execution even if a model asks for it',async()=>{
  const requests=[];
  const result=await generateReply({env,userId:'owner',body:{message:'Help'},transport:async(_url,options)=>{requests.push(JSON.parse(options.body));return requests.length===1?model({tool_calls:[call('send_messages',{to:'anyone'})]}):model({content:'Sending is unavailable.'});}});
  assert.equal(result.status,200);assert.equal(requests[0].tools,undefined);assert.match(requests[1].messages.at(-1).content,/not permitted/);assert.equal(result.research,undefined);
  assert.deepEqual(Object.keys(createIntelligenceTools({db:{},ownerId:'owner',env,transport:fetch})),[]);
});
test('One question cannot repeat its source search and spend credits twice',async()=>{
  let executions=0,round=0;
  const result=await generateReply({env,userId:'owner',body:{message:'Find people'},tools:{search_prospects:async()=>{executions++;return research;}},transport:async()=>++round===1?model({tool_calls:[call('search_prospects'),{...call('search_prospects'),id:'tool-2'}]}):model({content:'Review the available evidence.'})});
  assert.equal(executions,1);assert.equal(result.research.length,1);
});
test('A model outage after successful research keeps the research result and honest shortfall',async()=>{
  let round=0;
  const result=await generateReply({env,userId:'owner',body:{message:'Find people'},tools:{search_prospects:async()=>research},transport:async()=>++round===1?model({tool_calls:[call('search_prospects')]}):Response.json({error:'private provider detail'},{status:402})});
  assert.equal(result.status,200);assert.deepEqual(result.research,[research]);assert.match(result.reply,/summary was unavailable/);assert.ok(!JSON.stringify(result).includes('private provider detail'));
});
test('Saved workspace review is owner-filtered and never reveals stored contact or access secrets',async()=>{
  const filters=[];
  const payload={version:1,prospects:[{id:'one',name:'Fixture Person',title:'Founder',company:'Fixture LLC',industry:'Software',country:'Canada',email:'private@example.test',source_url:'https://example.test/team'}],shortlist:[],drafts:{},audit:[],mode:'import',identity:'Fixture',context:'company',website:'',offer:'Design',setup:true,duplicates:0,rules:{roles:'Founder',industries:'Software',countries:'Canada',min:'',max:'',signals:'',days:'90',evidence:false}};
  const db={from:()=>({select(){return this;},eq(k,v){filters.push([k,v]);return this;},async maybeSingle(){return {data:{payload,revision:3}};}})};
  const tools=createIntelligenceTools({db,ownerId:'owner-A',env,transport:fetch,useWorkspace:true});
  const result=await tools.review_workspace({});assert.deepEqual(filters,[['user_id','owner-A']]);assert.equal(result.counts.total,1);assert.ok(!JSON.stringify(result).includes('private@example.test'));assert.equal(result.revision,3);
});
test('Source result UI escapes identity text and rejects unsafe source links',()=>{
  const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const html=renderResearchResults([{...research,people:[{name:'<script>alert(1)</script>',source_url:'javascript:alert(1)'}]}],2,e);
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));assert.match(html,/data-ai-research="2:0"/);assert.match(html,/1 of 30/);
});
