// Shared presentation layer. Never approves actions, changes data, or delays input.
export function createJourneyMotion({document,window,Observer=window.MutationObserver}){
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const running=new Map(),signatures=new Map(),pending=new Set();
 const root=document.querySelector('#view-content');
 let route=window.location.hash.split('/')[0],frame=null,routeTransition=false,transitionGeneration=0;
 function settle(element,offset=5){
  if(!element?.animate||reduced.matches||element.contains(document.activeElement))return;
  running.get(element)?.cancel();
  const style=window.getComputedStyle(element);
  const duration=parseFloat(style.getPropertyValue('--motion-content'))||200;
  const easing=style.getPropertyValue('--ease-enter').trim()||'cubic-bezier(.22,1,.36,1)';
  const motion=element.animate([{opacity:.45,transform:`translateY(${offset}px)`},{opacity:1,transform:'translateY(0)'}],{duration,easing});
  running.set(element,motion);
  motion.finished.catch(()=>{}).then(()=>{if(running.get(element)===motion)running.delete(element);});
  return motion;
 }
 const targets='#table-content,.automation-card,.automation-overview,.activity-list,.connection-card,.connect-client-summary,.ai-message,.form-error,.empty-results,.home-metric';
 function inspect(){
  frame=null;
  const next=window.location.hash.split('/')[0];
  const changing=next!==route;
  for(const element of document.querySelectorAll(targets)){
   if(element.matches('.form-error')&&!element.textContent.trim())continue;
   const identity=element.matches('.ai-message')?'message:'+Array.from(document.querySelectorAll('.ai-message')).indexOf(element):element.dataset.motionKey||element.id||element.className+':'+(element.querySelector('h2,h3,strong')?.textContent||'');
   const key=next+':'+identity;
   const signature=element.textContent.trim();
   if(signatures.get(key)!==signature&&!changing&&!routeTransition)settle(element,element.matches('.form-error')?2:4);
   signatures.set(key,signature);
  }
  for(const button of pending){
   if(!button.isConnected||!button.disabled){button.removeAttribute('aria-busy');pending.delete(button);}
  }
 }
 function schedule(){if(frame===null)frame=window.requestAnimationFrame(inspect);}
 function onRoute(){const next=window.location.hash.split('/')[0];if(next===route)return;route=next;const generation=++transitionGeneration,motion=settle(root);routeTransition=Boolean(motion);motion?.finished.catch(()=>{}).then(()=>{if(generation===transitionGeneration)routeTransition=false;});}
 function onToggle(event){
  if(event.target.tagName!=='DETAILS'||!event.target.open)return;
  if(window.CSS?.supports?.('interpolate-size','allow-keywords'))return;
  for(const child of event.target.children)if(child.tagName!=='SUMMARY')settle(child,3);
 }
 function markPending(button){
  Promise.resolve().then(()=>{if(button?.isConnected&&button.disabled){pending.add(button);button.setAttribute('aria-busy','true');}});
 }
 function onSubmit(event){markPending(event.submitter||event.target.querySelector('[type=submit]'));}
 function onClick(event){const button=event.target.closest('button');if(button&&!button.disabled)markPending(button);}
 function onReduced(){if(reduced.matches){for(const motion of running.values())motion.cancel();running.clear();}}
 const observer=new Observer(schedule);
 if(root)observer.observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled']});
 const dialog=document.querySelector('#dialog-content');
 if(dialog)observer.observe(dialog,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled']});
 const toast=document.querySelector('#toast');if(toast)observer.observe(toast,{childList:true});
 window.addEventListener('hashchange',onRoute);
 document.addEventListener('toggle',onToggle,true);
 document.addEventListener('submit',onSubmit,true);
 document.addEventListener('click',onClick,true);
 reduced.addEventListener('change',onReduced);
 inspect();
 return {settle,destroy(){observer.disconnect();if(frame!==null)window.cancelAnimationFrame(frame);for(const motion of running.values())motion.cancel();for(const button of pending)button.removeAttribute('aria-busy');window.removeEventListener('hashchange',onRoute);document.removeEventListener('toggle',onToggle,true);document.removeEventListener('submit',onSubmit,true);document.removeEventListener('click',onClick,true);reduced.removeEventListener('change',onReduced);}};
}
if(typeof document!=='undefined')createJourneyMotion({document,window});
