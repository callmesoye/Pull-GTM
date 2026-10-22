// One lifecycle for the existing native dialog. Business state stays in app.js.
export function createContextualWorkspace(dialog,{document=globalThis.document,window=globalThis.window}={}) {
  let phase='closed',generation=0,animation=null,returnTarget=null,returnKey=null,scroll=null,overflow='';
  const content=()=>document.querySelector('#dialog-content');
  const setPhase=value=>{phase=value;dialog.dataset.phase=value;};
  const cancel=()=>{generation++;animation?.cancel();animation=null;};
  const duration=name=>{
    if(window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return 0;
    const raw=window?.getComputedStyle?.(dialog).getPropertyValue('--motion-'+name)?.trim();
    return raw?parseFloat(raw)*(raw.endsWith('ms')?1:1000):({exit:210,content:200,enter:320}[name]||200);
  };
  const play=async(frames,name)=>{
    const time=duration(name);if(!dialog.animate||!time)return;
    const token=name==='exit'?'--ease-exit':name==='content'?'--ease-standard':'--ease-enter';
    const easing=window?.getComputedStyle?.(dialog).getPropertyValue(token)?.trim()||(name==='exit'?'cubic-bezier(.4,0,1,1)':'cubic-bezier(.22,1,.36,1)');
    animation=dialog.animate(frames,{duration:time,easing});
    await animation.finished.catch(()=>{});
  };
  const markOrigin=selected=>document.querySelectorAll('[data-prospect], [data-draft-editor]').forEach(button=>{
    if(button.closest?.('dialog'))return;
    if((button.dataset.prospect||button.dataset.draftEditor)===returnKey)button.setAttribute('aria-expanded',String(selected));
  });
  function release(restore=true){
    setPhase('closed');markOrigin(false);
    if(document.body?.style)document.body.style.overflow=overflow;
    if(restore){
      const fallback=[...document.querySelectorAll('[data-prospect], [data-draft-editor]')].find(button=>(button.dataset.prospect||button.dataset.draftEditor)===returnKey&&!button.closest?.('dialog'));
      const target=returnTarget?.isConnected?returnTarget:fallback||document.querySelector('#page-title');
      target?.focus?.({preventScroll:true});
      if(scroll)window?.scrollTo?.({left:scroll.x,top:scroll.y,behavior:'instant'});
    }
    returnTarget=null;returnKey=null;scroll=null;
  }
  async function open(html,{variant='standard',key=null,trigger=null}={}){
    const wasOpen=dialog.open;
    cancel();const ticket=generation;
    if(!wasOpen){
      returnTarget=trigger||document.activeElement;returnKey=key;
      scroll={x:window?.scrollX||0,y:window?.scrollY||0};
      overflow=document.body?.style?.overflow||'';
      if(document.body?.style)document.body.style.overflow='hidden';
    }
    dialog.dataset.variant=variant;dialog.dataset.item=key||'';
    const bodyScroll=wasOpen&&key===dialog.dataset.previousItem?dialog.querySelector?.('.dialog-body')?.scrollTop||0:0;
    content().innerHTML=html;dialog.dataset.previousItem=key||'';
    setPhase(wasOpen?'changing_content':'opening');
    if(!wasOpen)dialog.showModal();
    const heading=content().querySelector?.('#dialog-title');
    heading?.setAttribute?.('tabindex','-1');heading?.focus?.({preventScroll:true});
    const body=dialog.querySelector?.('.dialog-body');if(body)body.scrollTop=bodyScroll;
    markOrigin(true);
    await play(wasOpen?[{opacity:.78},{opacity:1}]:[{opacity:0,transform:'translateY(14px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],wasOpen?'content':'enter');
    if(ticket===generation&&dialog.open){animation=null;setPhase('open');}
  }
  async function close({immediate=false,restore=true}={}){
    if(!dialog.open||(phase==='closing'&&!immediate))return;
    cancel();const ticket=generation;setPhase('closing');
    if(!immediate)await play([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(8px) scale(.99)'}],'exit');
    if(ticket!==generation)return;
    animation=null;dialog.close();release(restore);
  }
  const onCancel=event=>{event.preventDefault();close();};
  const onClose=()=>{if(!dialog.open&&phase!=='closed'){cancel();release();}};
  dialog.addEventListener('cancel',onCancel);dialog.addEventListener('close',onClose);
  return {open,close,get phase(){return phase;},destroy(){cancel();if(dialog.open)dialog.close();if(phase!=='closed')release(false);dialog.removeEventListener('cancel',onCancel);dialog.removeEventListener('close',onClose);}};
}
