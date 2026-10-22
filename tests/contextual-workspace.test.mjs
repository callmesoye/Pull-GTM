import test from 'node:test';
import assert from 'node:assert/strict';
import {createContextualWorkspace} from '../dist/contextual-workspace.js';
import {renderOpportunityWorkspace} from '../dist/opportunity-workspace.js';

function fixture({reduced=false}={}){
  const events=new Map(),animations=[],scrolls=[];let focused=null;
  const target={dataset:{prospect:'ada'},isConnected:true,setAttribute(name,value){this[name]=value;},focus(){focused=this;}};
  const heading={setAttribute(){},focus(){focused=this;}},body={scrollTop:0};
  const content={innerHTML:'',querySelector:()=>heading};
  const dialog={open:false,dataset:{},querySelector:()=>body,showModal(){this.open=true;},close(){this.open=false;},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),animate(frames,options){let resolve;const a={frames,options,finished:new Promise(r=>{resolve=r;}),finish:()=>resolve(),cancel:()=>resolve()};animations.push(a);return a;}};
  const document={activeElement:target,body:{style:{overflow:'auto'}},querySelector:selector=>selector==='#dialog-content'?content:heading,querySelectorAll:()=>[target]};
  const window={scrollX:0,scrollY:540,scrollTo:value=>scrolls.push(value),matchMedia:()=>({matches:reduced}),getComputedStyle:()=>({getPropertyValue:()=>''})};
  const workspace=createContextualWorkspace(dialog,{document,window});
  return {workspace,dialog,content,body,target,document,animations,events,scrolls,get focused(){return focused;}};
}
test('Native workspace locks background scrolling and restores the exact origin after exit',async()=>{
  const f=fixture();const opening=f.workspace.open('Ada',{variant:'opportunity',key:'ada'});
  assert.equal(f.workspace.phase,'opening');assert.equal(f.dialog.open,true);assert.equal(f.document.body.style.overflow,'hidden');assert.equal(f.target['aria-expanded'],'true');
  f.animations[0].finish();await opening;assert.equal(f.workspace.phase,'open');
  const closing=f.workspace.close();assert.equal(f.workspace.phase,'closing');assert.equal(f.dialog.open,true,'dialog remains mounted for exit');
  f.animations[1].finish();await closing;assert.equal(f.dialog.open,false);assert.equal(f.focused,f.target);assert.equal(f.document.body.style.overflow,'auto');assert.deepEqual(f.scrolls[0],{left:0,top:540,behavior:'instant'});
});
test('Close during entrance and reopen cancels stale transitions without closing the new item',async()=>{
  const f=fixture();const first=f.workspace.open('Ada',{key:'ada'});const closing=f.workspace.close();const next=f.workspace.open('Ravi',{key:'ravi'});
  await first;await closing;assert.equal(f.dialog.open,true);assert.equal(f.content.innerHTML,'Ravi');
  f.animations.at(-1).finish();await next;assert.equal(f.workspace.phase,'open');
});
test('Navigation can close immediately even while an animated close is already running',async()=>{
  const f=fixture();const open=f.workspace.open('Ada');f.animations[0].finish();await open;
  const pending=f.workspace.close();await f.workspace.close({immediate:true,restore:false});await pending;
  assert.equal(f.dialog.open,false);assert.equal(f.scrolls.length,0);assert.equal(f.workspace.phase,'closed');
});
test('Reduced motion, Escape and cleanup retain native semantics without animation',async()=>{
  const f=fixture({reduced:true});await f.workspace.open('Ada');assert.equal(f.animations.length,0);
  let cancelled=false;f.events.get('cancel')({preventDefault(){cancelled=true;}});await Promise.resolve();
  assert.equal(cancelled,true);assert.equal(f.dialog.open,false);f.workspace.destroy();assert.equal(f.events.size,0);
});
test('A removed originating row restores focus to a surviving record control',async()=>{
  const f=fixture({reduced:true});await f.workspace.open('Ada',{key:'ada'});f.target.isConnected=false;await f.workspace.close();assert.equal(f.focused,f.target);
});
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('Opportunity composition keeps source claims, missing evidence and suppression explicit',()=>{
  const p={name:'<Ada>',status:'review',origin:'import',checks:[],reasons:['Role is missing'],matched:0,source_url:'javascript:alert(1)'};
  const html=renderOpportunityWorkspace(p,{name:p.name,initials:'A',status:'Needs evidence',escape:e});
  assert.ok(html.includes('&lt;Ada&gt;'));assert.ok(!html.includes('href="javascript:'));assert.ok(html.includes('Role is missing'));assert.ok(html.includes('Company not provided'));assert.ok(!html.includes('Add to shortlist'));
  assert.ok(renderOpportunityWorkspace({...p,suppressed:true},{name:'Ada',initials:'A',status:'Excluded',escape:e}).includes('Contact is restricted'));
});

test('Draft editor binds the preview to its exact recipient and escapes untrusted copy',async()=>{
 const {renderDraftWorkspace}=await import('../dist/draft-workspace.js');
 const p={id:'ada',name:'Ada',company:'Fixture',origin:'example'};
 const html=renderDraftWorkspace(p,{channel:'email',subject:'<Subject>',body:'<script>copy</script>',ready:true},{rows:[p],name:'Ada',reviewed:true,storage:'Kept in this tab',escape:e});
 assert.ok(html.includes('data-draft-id="ada"'));assert.ok(html.includes('&lt;script&gt;copy&lt;/script&gt;'));assert.ok(html.includes('draft-preview-body'));assert.ok(!html.includes('data-action="native-send"'),'fictional examples never offer native delivery');
 const stale=renderDraftWorkspace({...p,origin:'import'},{channel:'email',body:'Hello',subject:'Hi',ready:true},{rows:[p],name:'Ada',reviewed:false,storage:'Local',escape:e});
 assert.ok(stale.includes('Review again'));assert.ok(!stale.includes('data-action="native-send"'));
});
