// Presentation only. Observe completed UI updates; never delay actions or change data.
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const running=new WeakMap();
function settle(element,offset=6){
 if(!element?.animate||reduced.matches)return;
 running.get(element)?.cancel();
 const motion=element.animate([{opacity:.35,transform:`translateY(${offset}px)`},{opacity:1,transform:'translateY(0)'}],{duration:200,easing:'cubic-bezier(.22,1,.36,1)'});
 running.set(element,motion);
 motion.finished.catch(()=>{}).then(()=>{if(running.get(element)===motion)running.delete(element);});
}
let route=location.hash.split('/')[0];
window.addEventListener('hashchange',()=>{
 const next=location.hash.split('/')[0];
 if(next===route)return;
 route=next;settle(document.querySelector('#view-content'));
});
document.addEventListener('toggle',event=>{
 if(event.target.tagName!=='DETAILS'||!event.target.open)return;
 for(const child of event.target.children)if(child.tagName!=='SUMMARY')settle(child,4);
},true);
// A client choice changes only its setup region. Focus and input stay with the product.
document.addEventListener('click',event=>{
 if(!event.target.closest('[data-connect-client]'))return;
 settle(document.querySelector('.connect-client-summary'),4);
 settle(document.querySelector('.connect-advanced'),4);
});
reduced.addEventListener('change',()=>{
 if(reduced.matches)for(const element of document.querySelectorAll('#view-content,details>*'))running.get(element)?.cancel();
});
