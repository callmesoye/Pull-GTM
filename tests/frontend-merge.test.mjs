import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as engine from '../dist/engine.js';
import {contactOptions,displayIdentity,validContactUrl} from '../dist/contact.js';
import {samples} from '../dist/sample.js';
import {renderSimpleHome} from '../dist/simple-home.js';
import {buildAgentPrompt,renderAgentAIView} from '../dist/agent-ai.js';
import {renderAutomationView} from '../dist/automations.js';
import {renderSettingsView,renderSettingsProfile} from '../dist/settings.js';
import {validateWorkspace} from '../dist/workspace.js';
import {AccountGuard} from '../dist/cloud.js';
import * as onboarding from '../dist/onboarding.js';
import {renderProductFeedback,renderProductAdmin} from '../dist/product-feedback.js';

// Run the real controller with a small DOM adapter. These checks exercise route,
// import, filter, and account transitions without needing a model or cloud account.
async function workspace(initialHash='') {
  const elements=new Map(),events=new Map(),windowEvents=new Map(),calls=[];
  const element=selector=>{
    if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',dataset:{},hidden:false,open:false,value:'',attributes:{},events:new Map(),classList:{toggle(){},add(){},remove(){}},setAttribute(key,value){this.attributes[key]=value;},insertAdjacentHTML(_where,html){this.innerHTML+=html;},querySelector:child=>element(selector+' '+child),querySelectorAll:()=>[],focus(){this.focused=true;},showModal(){this.open=true;},close(){this.open=false;},addEventListener(name,fn){this.events.set(name,fn);}});
    return elements.get(selector);
  };
  const document={body:{dataset:{}},querySelector:element,querySelectorAll:()=>[],addEventListener(name,fn){events.set(name,[...(events.get(name)||[]),fn]);}};
  const location={hash:initialHash,protocol:'https:',pathname:'/',search:''};
  const context={...engine,...onboarding,renderProductFeedback,renderProductAdmin,contactOptions,displayIdentity,validContactUrl,samples,renderSimpleHome,buildAgentPrompt,renderAgentAIView,renderAutomationView,renderSettingsView,renderSettingsProfile,validateWorkspace,AccountGuard,attachSettingsNavigation(){},document,location,history:{replaceState(){}},window:{addEventListener(name,fn){windowEvents.set(name,fn);}},structuredClone,URL,Blob,FormData,Date,Intl,console,setTimeout:()=>0,clearTimeout(){},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},sessionStorage:{getItem:()=>null,removeItem(){}},cloudRequest:async(path)=>{calls.push(path);if(path==='session')return {configured:false,user:null};if(path==='agents')return {configured:false,tokens:[]};if(path==='profile')return {profile:{display_name:'Ada'}};if(path==='automations')return {workflows:[],runs:[]};return {};},createConnectExperience:hooks=>({renderConnect:()=>'<p>Connect setup</p>',renderSupport:()=>'<p>Support options</p>',afterRender:route=>calls.push('paint:'+route),leave:()=>calls.push('leave'),accountChanged:()=>calls.push('account:'+hooks.getCloud().user?.id)})};
  vm.runInNewContext(readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'')+'\nglobalThis.testApp={navigate,setCloudUser,askAI,visibleRows,guideItems,render,aiContext,applyDiscoveryResults,get:()=>({state,cloud,view,tab,query,discovery,assistantState,agentState,profile,automationData}),update:changes=>{if(changes.state)state={...state,...changes.state};if(changes.discovery)discovery={...discovery,...changes.discovery};if(changes.query!==undefined)query=changes.query;if(changes.tab)tab=changes.tab;if(changes.guideQuery!==undefined)guideQuery=changes.guideQuery;}};',context);
  await new Promise(resolve=>setImmediate(resolve));
  return {app:context.testApp,element,location,calls,respond:fn=>{context.cloudRequest=fn;},hash:()=>windowEvents.get('hashchange')(),click:async dataset=>{const button={dataset};const event={target:{closest:()=>button}};for(const callback of events.get('click'))await callback(event);},import:async csv=>element('#file-input').events.get('change')({target:{files:[{text:async()=>csv}],value:'fixture.csv'}})};
}

test('Merged routes retain AI, continuous Settings, Automations, Connect, and Support',async()=>{
  const {app,element,calls}=await workspace();
  for(const [route,content] of [['assistant','Ask Pull anything about your business'],['settings','settings/general'],['automations','Cloud automations need setup'],['connect','Connect setup'],['support','Support options']]){
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

test('Support exposes optional account-protected product feedback without disclosing another account',async()=>{
  const {app,element}=await workspace();
  app.navigate('support');
  assert.doesNotMatch(element('#view-content').innerHTML,/id="product-feedback-form"/);
  app.setCloudUser({id:'A',email:'a@example.test'});
  app.navigate('support');
  assert.match(element('#view-content').innerHTML,/id="product-feedback-form"/);
  app.setCloudUser({id:'B',email:'b@example.test'});
  app.navigate('support');
  assert.match(element('#view-content').innerHTML,/id="product-feedback-form"/);
  assert.doesNotMatch(element('#view-content').innerHTML,/feedback has been received/);
});

test('Staff-only product insights route starts with read-only access check',async()=>{
  const {app,element,calls}=await workspace();
  app.navigate('admin');
  assert.match(element('#view-content').innerHTML,/authorized PULL staff/);
  app.setCloudUser({id:'A',email:'a@example.test'});
  app.navigate('admin');
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(calls.includes('profile?staff=feedback'));
  assert.match(element('#view-content').innerHTML,/recent sample/i);
});

test('Settings deep links survive navigation from another page',async()=>{
  const {app,location,hash}=await workspace();
  location.hash='#settings/security';hash();
  assert.equal(app.get().view,'settings');
  assert.equal(location.hash,'#settings/security');
});

test('CSV import keeps usable contacts and offers targeting rows for live research',async()=>{
  const {app,element,import:importCSV}=await workspace();
  await importCSV('First Name,Last Name,Email Address,Company Name,Job Title\nAda,Lovelace,ada@example.test,,CEO\n,,other@example.test,,Founder\n,,,,CEO');
  assert.equal(app.get().state.prospects.length,2);
  assert.match(element('#dialog-content').innerHTML,/row describes who or where to search/);
});

test('review shows supplied contact paths for a real record and never claims a message was sent',async()=>{
  const {app,element,click}=await workspace();
  app.update({state:{prospects:[{id:'ada',name:'Ada Okafor',company:'Green Acre',profile_url:'https://www.linkedin.com/in/ada-okafor/',email:'ada@example.test',origin:'import',suppressed:false}],mode:'import'}});
  await click({prospect:'ada'});
  const review=element('#dialog-content').innerHTML;
  assert.match(review,/Ada Okafor/);
  assert.match(review,/Open LinkedIn profile/);
  assert.match(review,/Write email/);
  assert.match(review,/Pull has not sent anything/);
});

test('a discovered person has a review form for adding checked contact links',async()=>{
  const {app,element,click}=await workspace();
  app.update({state:{prospects:[{id:'source-ada',name:'Ada Okafor',title:'Founder',company:'Green Acre',source_url:'https://greenacre.example/team/ada',origin:'discovery',private_verified:'no',suppressed:false}],mode:'import'}});
  await click({prospect:'source-ada'});
  const review=element('#dialog-content').innerHTML;
  const sourceForm=element('#dialog-content .dialog-body').innerHTML;
  assert.match(sourceForm,/Add a contact path you checked/);
  assert.match(sourceForm,/name="x_url"/);
  assert.match(review,/No usable contact link is recorded yet/);
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
  current.automationData.workflows.push({id:'private-workflow'});current.discovery.people.push({id:'private-search-result'});current.discovery.search.audience='Private search audience';
  app.setCloudUser({id:'B',email:'b@example.test'});
  const next=app.get();
  assert.equal(next.assistantState.messages.length,0);
  assert.equal(next.agentState.oneTime,null);
  assert.equal(next.automationData.workflows.length,0);
  assert.equal(next.profile,null);assert.equal(next.discovery.people.length,0);assert.equal(next.discovery.search.audience,'');
  assert.ok(calls.includes('account:B'),'Connect receives the new account, not stale account state');
});

test('Account avatar and workspace identity are separate controls',async()=>{
  const {app,element,click}=await workspace();
  app.setCloudUser({id:'A',email:'ada@example.test',avatar_url:'https://lh3.googleusercontent.com/photo'});
  assert.match(element('#account-button').innerHTML,/account-avatar/);
  assert.match(element('#account-button').innerHTML,/googleusercontent/);
  await click({action:'switch-identity'});
  assert.match(element('#dialog-content').innerHTML,/does not connect a social account/);
  await click({action:'identity-personal'});
  assert.equal(app.get().state.context,'personal');
  assert.match(element('#workspace-context').textContent,/Personal workspace/);
});

test('A channel draft opens only the supplied social profile for manual handoff',async()=>{
  const {app,element,click}=await workspace();
  app.update({state:{mode:'import',prospects:[{id:'ada',name:'Ada Okafor',title:'Founder',company:'Green Acre',origin:'import',private_verified:'yes',x_url:'https://x.com/ada'}],rules:{...app.get().state.rules,roles:'Founder',evidence:false},shortlist:['ada'],drafts:{ada:{body:'Hello Ada',subject:'Hello',channel:'x',ready:false}}}});
  app.navigate('drafts');
  const html=element('#view-content').innerHTML;
  assert.match(html,/X · manual handoff/);
  assert.match(html,/href="https:\/\/x.com\/ada"/);
  assert.match(html,/Pull does not send automated social messages/);
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

test('A sourced person enters review, never an approved or contacted list',async()=>{
  const {app,click}=await workspace();
  const person={id:'source-a',name:'Ada Okafor',title:'Founder',company:'Green Acre',source_url:'https://greenacre.example/team/ada',source_title:'Ada Okafor — Founder at Green Acre',source_excerpt:'Private company in Lagos',reason:'Audience: founder',missing:['Location']};
  app.update({discovery:{people:[person]},state:{rules:{roles:'Founder',industries:'Agriculture',countries:'Nigeria',min:'',max:'',signals:'',days:'90',evidence:true}}});
  app.navigate('prospects');
  await click({discoveredPerson:'source-a'});
  const saved=app.get().state;
  assert.equal(saved.prospects.length,1);
  assert.equal(saved.prospects[0].origin,'discovery');
  assert.equal(saved.prospects[0].private_verified,'no');
  assert.equal(saved.shortlist.length,0);
  assert.equal(engine.qualify(saved.prospects[0],saved.rules).status,'review');
  assert.doesNotThrow(()=>validateWorkspace(saved));
});


test('Live discovery immediately shows named prospects and preserves source contacts through save validation',async()=>{
  const {app,element,click}=await workspace();
  app.setCloudUser({id:'A',email:'a@example.test'});
  app.update({tab:'excluded',query:'stale filter',discovery:{search:{audience:'CEO',industry:'Software',location:'New York',limit:30}}});
  const person={id:'live-ada',name:'Ada Okafor',title:'CEO',company:'Green Acre Software',location:'New York',industry:'Software',profile_url:'https://www.linkedin.com/in/ada-okafor/',source_url:'https://www.linkedin.com/in/ada-okafor/',source_title:'Ada Okafor - CEO - Green Acre Software',source_excerpt:'CEO at a software company in New York',relevance:8,reason:'Audience: ceo · Industry: software · Location: new york',missing:[]};
  app.applyDiscoveryResults({configured:true,people:[person],candidates:[],notice:'1 prospect found'});app.navigate('prospects');
  assert.equal(app.get().tab,'all');assert.equal(app.get().query,'');assert.equal(app.visibleRows().length,1);
  assert.match(element('#view-content').innerHTML,/Ada Okafor/);assert.match(element('#view-content').innerHTML,/New York/);
  const saved=validateWorkspace(app.get().state);
  assert.equal(saved.prospects[0].profile_url,person.profile_url);assert.equal(saved.prospects[0].source_excerpt,person.source_excerpt);
  assert.equal(saved.prospects[0].signal_date,'');assert.equal(saved.prospects[0].private_verified,'no');assert.equal(saved.shortlist.length,0);
  app.applyDiscoveryResults({configured:true,people:[person],candidates:[]});assert.equal(app.get().state.prospects.length,1);
  await click({prospect:person.id});assert.match(element('#dialog-content').innerHTML,/CEO at a software company in New York/);assert.match(element('#dialog-content').innerHTML,/Audience: ceo/);
});

test('An empty live search preserves existing prospects and shows a completed search notice',async()=>{
  const {app}=await workspace();
  app.update({state:{prospects:[{id:'kept',name:'Kept Person',company:'Kept Company',origin:'import',suppressed:false}],mode:'import'}});
  app.applyDiscoveryResults({configured:true,people:[],candidates:[],notice:'No matching prospects'});
  assert.equal(app.get().state.prospects[0].id,'kept');assert.equal(app.get().discovery.searched,true);assert.equal(app.get().discovery.notice,'No matching prospects');
});

test('A repeated discovery preserves suppression and invalidates approvals after an employer conflict',async()=>{
  const {app}=await workspace();
  app.update({state:{mode:'import',prospects:[{id:'source-ada',name:'Ada Okafor',title:'CEO',company:'Green Acre',source_url:'https://example.test/ada',origin:'discovery',suppressed:true,private_verified:'yes'}],shortlist:['source-ada']}});
  app.applyDiscoveryResults({configured:true,people:[{id:'source-ada',name:'Ada Okafor',title:'CEO',company:'New Acre',source_url:'https://example.test/ada',reason:'CEO in software'}]});
  const saved=validateWorkspace(app.get().state);
  assert.equal(saved.prospects.length,1);assert.equal(saved.prospects[0].company,'Green Acre');assert.equal(saved.prospects[0].suppressed,true);assert.equal(saved.prospects[0].private_verified,'yes');assert.ok(saved.prospects[0].conflicts.includes('company'));assert.equal(saved.shortlist.length,0);
});

test('Replacing a CSV and clearing its rows preserve do-not-contact decisions',async()=>{
  const {app,element,click,import:importCSV}=await workspace();
  app.update({state:{mode:'import',prospects:[{id:'old',name:'Ada Okafor',company:'Green Acre',email:'ada@example.test',origin:'import'}]}});
  await click({suppress:'old'});
  await importCSV('Name,Company,Email\nAda Okafor,Green Acre,ada@example.test');
  element('#apply-import').events.get('click')();
  assert.equal(app.get().state.prospects[0].suppressed,true);
  assert.ok(app.get().state.suppressions.includes('email:ada@example.test'));
  await click({action:'confirm-reset'});
  assert.equal(app.get().state.prospects.length,0);assert.ok(app.get().state.suppressions.includes('email:ada@example.test'));
});

test('Imported records expose the same correction form and malformed conflicts remain repairable',async()=>{
  const {app,element,click}=await workspace();
  app.update({state:{mode:'import',prospects:[{id:'ada',name:'Ada Okafor',company:'Green Acre',origin:'import',conflicts:['company'],conflict_details:'{"company":"not-an-array"}'}]}});
  await click({prospect:'ada'});
  const form=element('#dialog-content .dialog-body').innerHTML;
  assert.match(form,/name="name"/);assert.match(form,/name="company"/);assert.match(form,/name="source_url"/);assert.match(form,/name="resolve_conflicts"/);
});

test('A stale shortlist cannot prepare a draft or expose a social handoff',async()=>{
  const {app,element,click}=await workspace();
  app.update({state:{mode:'import',prospects:[{id:'ada',name:'Ada Okafor',company:'Green Acre',origin:'import',private_verified:'no',x_url:'https://x.com/ada'}],shortlist:['ada'],drafts:{ada:{subject:'Hello',body:'Preserve my draft',channel:'x',ready:true}}}});
  await click({prepare:'ada'});assert.equal(app.get().state.drafts.ada.ready,false);
  app.navigate('drafts');assert.doesNotMatch(element('#view-content').innerHTML,/href="https:\/\/x.com\/ada"/);assert.equal(app.get().state.drafts.ada.body,'Preserve my draft');
});

test('Search progress reports the requested count and its shortfall without placeholder rows',async()=>{
  const {app,element}=await workspace();
  app.applyDiscoveryResults({configured:true,people:[],candidates:[],target:{requested:30,returned:0,remaining:30,status:'empty',reason:'request_budget_reached'},notice:'No qualifying people yet'});
  app.navigate('prospects');const html=element('#view-content').innerHTML;
  assert.match(html,/0 of 30 requested prospects found/);assert.match(html,/30 still needed/);assert.doesNotMatch(html,/Unnamed prospect/);
});

 test('Direct Buyers links check discovery readiness on initial load',async()=>{const {calls}=await workspace('#prospects');assert.ok(calls.includes('discovery'));});


test('Hosted research stays in chat until the owner explicitly adds it to Buyers',async()=>{
  const w=await workspace('#assistant');w.app.setCloudUser({id:'owner',email:'owner@example.test'});
  const result={configured:true,people:[{id:'found-person',name:'Fixture Person',title:'CEO',company:'Fixture Software LLC',industry:'Software',location:'Lagos',source_url:'https://example.test/team',source_excerpt:'Private software company in Lagos',supporting_sources:[{url:'https://example.test/about',title:'Company source',excerpt:'Software company'}]}],input:{audience:'CEO',industry:'Software',location:'Lagos',source:'',limit:30},target:{requested:30,returned:1,remaining:29,status:'partial'},notice:'One source-backed match.'};
  const requests=[];w.respond(async(path,body)=>{requests.push({path,body});return path==='ai'?{reply:'One match, 29 still needed.',research:[result]}:{};});
  await w.app.askAI('Find 30 software CEOs in Lagos');
  assert.equal(w.app.get().state.prospects.length,0);assert.equal(w.app.get().assistantState.messages.length,2);
  assert.equal(requests[0].body.allowResearch,true);assert.equal(requests[0].body.useWorkspace,true);
  assert.match(w.element('#view-content').innerHTML,/1 of 30 requested/);
  await w.click({aiResearch:'1:0'});
  assert.equal(w.app.get().state.prospects.length,1);assert.equal(w.app.get().state.shortlist.length,0);
  assert.match(w.app.get().state.prospects[0].supporting_sources,/Company source/);
});

test('Recovery callback opens password selection without treating it as a normal sign-in',async()=>{
  const w=await workspace('#auth=recovery');
  assert.match(w.element('#dialog-content').innerHTML,/password-reset-form/);
  assert.equal(w.app.get().cloud.user,null);
});
