import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as engine from '../dist/engine.js';
import {samples} from '../dist/sample.js';
import {renderSimpleHome} from '../dist/simple-home.js';
import {buildAgentPrompt,renderAgentAIView} from '../dist/agent-ai.js';
import {renderAutomationView} from '../dist/automations.js';
import {renderSettingsView,renderSettingsProfile} from '../dist/settings.js';
import {validateWorkspace} from '../dist/workspace.js';
import {AccountGuard} from '../dist/cloud.js';

// Run the real controller with a small DOM adapter. These checks exercise route,
// import, filter, and account transitions without needing a model or cloud account.
async function workspace() {
  const elements=new Map(),events=new Map(),windowEvents=new Map(),calls=[];
  const element=selector=>{
    if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',dataset:{},hidden:false,open:false,value:'',attributes:{},events:new Map(),classList:{toggle(){},add(){},remove(){}},setAttribute(key,value){this.attributes[key]=value;},querySelector:child=>element(selector+' '+child),querySelectorAll:()=>[],focus(){this.focused=true;},showModal(){this.open=true;},close(){this.open=false;},addEventListener(name,fn){this.events.set(name,fn);}});
    return elements.get(selector);
  };
  const document={body:{dataset:{}},querySelector:element,querySelectorAll:()=>[],addEventListener(name,fn){events.set(name,[...(events.get(name)||[]),fn]);}};
  const location={hash:'',protocol:'https:',pathname:'/',search:''};
  const context={...engine,samples,renderSimpleHome,buildAgentPrompt,renderAgentAIView,renderAutomationView,renderSettingsView,renderSettingsProfile,validateWorkspace,AccountGuard,attachSettingsNavigation(){},document,location,history:{replaceState(){}},window:{addEventListener(name,fn){windowEvents.set(name,fn);}},structuredClone,URL,Blob,FormData,Date,Intl,console,setTimeout:()=>0,clearTimeout(){},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,removeItem(){}},cloudRequest:async(path)=>{calls.push(path);if(path==='session')return {configured:false,user:null};if(path==='agents')return {configured:false,tokens:[]};if(path==='profile')return {profile:{display_name:'Ada'}};if(path==='automations')return {workflows:[],runs:[]};return {};},createConnectExperience:hooks=>({renderConnect:()=>'<p>Connect setup</p>',renderSupport:()=>'<p>Support options</p>',afterRender:route=>calls.push('paint:'+route),leave:()=>calls.push('leave'),accountChanged:()=>calls.push('account:'+hooks.getCloud().user?.id)})};
  vm.runInNewContext(readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'')+'\nglobalThis.testApp={navigate,setCloudUser,visibleRows,guideItems,render,aiContext,get:()=>({state,cloud,view,tab,query,assistantState,agentState,profile,automationData}),update:changes=>{if(changes.state)state={...state,...changes.state};if(changes.query!==undefined)query=changes.query;if(changes.tab)tab=changes.tab;if(changes.guideQuery!==undefined)guideQuery=changes.guideQuery;}};',context);
  await new Promise(resolve=>setImmediate(resolve));
  return {app:context.testApp,element,location,calls,hash:()=>windowEvents.get('hashchange')(),click:async dataset=>{const button={dataset};const event={target:{closest:()=>button}};for(const callback of events.get('click'))await callback(event);},import:async csv=>element('#file-input').events.get('change')({target:{files:[{text:async()=>csv}],value:'fixture.csv'}})};
}

test('Merged routes retain AI, continuous Settings, Automations, Connect, and Support',async()=>{
  const {app,element,calls}=await workspace();
  for(const [route,content] of [['assistant','Prepare prompt'],['settings','settings/general'],['automations','Cloud automations need setup'],['connect','Connect setup'],['support','Support options']]){
    app.navigate(route);
    assert.equal(app.get().view,route);
    assert.ok(element('#view-content').innerHTML.includes(content),route+' renders its view');
  }
  assert.ok(calls.includes('leave'),'Departing Connect clears its transient state');
  app.navigate('prospects');
  assert.match(element('#section-tabs').innerHTML,/Find buyers/);
  assert.match(element('#section-tabs').innerHTML,/Shortlist/);
  app.navigate('drafts');
  assert.match(element('#section-tabs').innerHTML,/Conversations/);
});

test('Settings deep links survive navigation from another page',async()=>{
  const {app,location,hash}=await workspace();
  location.hash='#settings/security';hash();
  assert.equal(app.get().view,'settings');
  assert.equal(location.hash,'#settings/security');
});

test('CSV import keeps optional-company and incomplete rows visible in All',async()=>{
  const {app,element,import:importCSV}=await workspace();
  await importCSV('First Name,Last Name,Email Address,Company Name,Job Title\nAda,Lovelace,ada@example.test,,CEO\n,,other@example.test,,Founder\n,,,,CEO');
  assert.equal(app.get().tab,'all');
  assert.equal(app.get().state.prospects.length,3);
  assert.equal(app.visibleRows().length,3);
  assert.match(element('#view-content').innerHTML,/Ada Lovelace/);
  assert.match(element('#view-content').innerHTML,/other@example.test/);
  assert.match(element('#view-content').innerHTML,/Unnamed prospect/);
});

test('See all prospects clears both status and search filters',async()=>{
  const {app,click}=await workspace();
  app.update({state:{prospects:structuredClone(samples),mode:'example'},tab:'excluded',query:'no-person-matches'});
  assert.equal(app.visibleRows().length,0);
  await click({action:'all'});
  assert.equal(app.get().tab,'all');
  assert.equal(app.get().query,'');
  assert.equal(app.visibleRows().length,samples.length);
});

test('Global search finds people and the merged workspace routes',async()=>{
  const {app}=await workspace();
  app.update({state:{prospects:[{id:'test',name:'Ada Lovelace',company:'',origin:'import'}]},guideQuery:'Ada'});
  assert.match(app.guideItems(),/Ada Lovelace/);
  for(const label of ['Connect your AI','Support','Settings','Automations','AI mode']){
    app.update({guideQuery:label});assert.ok(app.guideItems().includes(label),label+' appears in search');
  }
});

test('Switching accounts clears AI messages, tokens, profiles and workflows',async()=>{
  const {app,calls}=await workspace();
  app.setCloudUser({id:'A',email:'a@example.test'});
  const current=app.get();
  current.assistantState.messages.push({role:'user',content:'Private context'});
  current.agentState.oneTime={token:'private-token'};
  current.automationData.workflows.push({id:'private-workflow'});
  app.setCloudUser({id:'B',email:'b@example.test'});
  const next=app.get();
  assert.equal(next.assistantState.messages.length,0);
  assert.equal(next.agentState.oneTime,null);
  assert.equal(next.automationData.workflows.length,0);
  assert.equal(next.profile,null);
  assert.ok(calls.includes('account:B'),'Connect receives the new account, not stale account state');
});

test('Email-only identities remain searchable and produce valid saved audit records',async()=>{
  const {app,click}=await workspace();
  const prospects=engine.parseCSV('Email Address,Job Title\nada@example.test,CEO');
  app.update({state:{prospects,mode:'import'},tab:'all',query:'ada@example.test',guideQuery:'ada@example.test'});
  assert.equal(app.visibleRows().length,1);
  assert.match(app.guideItems(),/ada@example.test/);
  await click({suppress:prospects[0].id});
  assert.equal(app.get().state.audit[0].detail,'ada@example.test');
  assert.doesNotThrow(()=>validateWorkspace(app.get().state));
});
