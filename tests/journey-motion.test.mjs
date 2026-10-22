import test from 'node:test';
import assert from 'node:assert/strict';
import {createJourneyMotion} from '../dist/journey-motion.js';
function fixture(){
 const events=new Map(),windowEvents=new Map(),animations=[],frames=[];let observerCallback;
 const media={matches:false,addEventListener(_e,f){this.change=f;},removeEventListener(){}};
 const element=(key,text='')=>({id:key,className:'panel',dataset:{},textContent:text,isConnected:true,disabled:false,attributes:{},contains:()=>false,matches:()=>false,querySelector:()=>null,children:[],setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},animate(){const a={cancelled:false,cancel(){this.cancelled=true;},finished:Promise.resolve()};animations.push(a);return a;}});
 const root=element('view-content'),button=element('submit');let nodes=[];
 const document={activeElement:null,querySelector:s=>s==='#view-content'?root:null,querySelectorAll:()=>nodes,addEventListener(e,f){events.set(e,f);},removeEventListener(){}};
 const window={location:{hash:'#home'},matchMedia:()=>media,getComputedStyle:()=>({getPropertyValue:()=>''}),requestAnimationFrame:f=>{frames.push(f);return frames.length;},cancelAnimationFrame(){},addEventListener(e,f){windowEvents.set(e,f);},removeEventListener(){}};
 class Observer{constructor(f){observerCallback=f;}observe(){}disconnect(){}}
 const motion=createJourneyMotion({document,window,Observer});
 return {motion,root,button,element,events,windowEvents,window,media,animations,setNodes:n=>{nodes=n;},mutate(){observerCallback();frames.splice(0).forEach(f=>f());}};
}
test('route changes animate once; settings anchors do not replay page entrance',()=>{
 const f=fixture();f.window.location.hash='#settings';f.windowEvents.get('hashchange')();assert.equal(f.animations.length,1);
 f.window.location.hash='#settings/security';f.windowEvents.get('hashchange')();assert.equal(f.animations.length,1);f.motion.destroy();
});
test('active editors never animate and switching to reduced motion cancels active motion',()=>{
 const f=fixture();f.root.contains=()=>true;f.motion.settle(f.root);assert.equal(f.animations.length,0);
 f.root.contains=()=>false;f.motion.settle(f.root);f.media.matches=true;f.media.change();assert.equal(f.animations[0].cancelled,true);
 f.motion.settle(f.root);assert.equal(f.animations.length,1);f.motion.destroy();
});
test('data redraws animate changed content, while identical background refreshes stay still',()=>{
 const f=fixture();f.setNodes([f.element('record','Ready')]);f.mutate();assert.equal(f.animations.length,1);
 f.setNodes([f.element('record','Ready')]);f.mutate();assert.equal(f.animations.length,1);
 f.setNodes([f.element('record','Paused')]);f.mutate();assert.equal(f.animations.length,2);f.motion.destroy();
});
test('busy feedback follows actual disabled submit state and clears on recovery',async()=>{
 const f=fixture();f.events.get('submit')({submitter:f.button});await Promise.resolve();assert.equal(f.button.attributes['aria-busy'],undefined);
 f.button.disabled=true;f.events.get('submit')({submitter:f.button});await Promise.resolve();assert.equal(f.button.attributes['aria-busy'],'true');
 f.button.disabled=false;f.mutate();assert.equal(f.button.attributes['aria-busy'],undefined);f.motion.destroy();
});
test('rapid updates cancel prior motion rather than stacking animations',()=>{
 const f=fixture();f.motion.settle(f.root);f.motion.settle(f.root);assert.equal(f.animations[0].cancelled,true);assert.equal(f.animations[1].cancelled,false);f.motion.destroy();assert.equal(f.animations[1].cancelled,true);
});
