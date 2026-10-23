const requirementFields=[['model','Model'],['year','Model year'],['condition','Condition'],['quantity','Quantity'],['delivery','Delivery needs'],['service_scope','Service requirements']];
const categoryLabels={goods:'Product',service:'Service',wholesale:'Wholesale'};
const checkLabels={category:'Request type',product_scope:'Full product or service fit',product:'Product words',location:'Location',budget:'Budget',model:'Model',year:'Year',condition:'Condition',quantity:'Quantity',delivery:'Delivery',service_scope:'Service requirements',variant:'Variant',material:'Material',capacity:'Capacity'};
const checkStates={match:'Same stated details',conflict:'Different stated details',unknown:'Needs checking'};
const emptyDraft=()=>({id:null,revision:0,product:'',location:'',category:'goods',requirements:{},budgetMax:'',budgetCurrency:'NGN',budgetBasis:'total',validForDays:'7',status:'open',discoverable:false,contactAllowed:false});
const rowDraft=row=>({...emptyDraft(),id:row.id,revision:row.revision,...row.payload,budgetMax:row.payload.budget?.maxAmount??'',budgetCurrency:row.payload.budget?.currency||'NGN',budgetBasis:row.payload.budget?.basis||'total'});

export function renderBuyerRequestsWorkspace(state,e){
  if(state.mode==='matches'){
    const result=state.result;
    return `<section class="buyer-requests-workspace"><p><strong>${e(state.offer.fields.product)}</strong> · ${e(state.offer.fields.location)} · saved version ${e(state.offer.version)}</p>
      ${state.busy?'<p role="status">Checking shared buying requests against these selling details…</p>':''}
      ${state.error?`<p role="alert">${e(state.error)}</p>`:''}
      ${result?`<p class="small-print">${e(result.notice)}</p>${result.matches.length?`<ul class="offer-list">${result.matches.map(r=>`<li><div><strong>${e(r.product)}</strong><p>${e(r.location)} · ${e(categoryLabels[r.category]||'Buying request')}</p><p>${r.qualification.state==='conflicting_terms'?'Some buying terms differ from your offer.':'Possible match; further checks needed.'}</p><p>${r.qualification.permission.contactAllowed?'Contact about this request allowed in Pull.':'Contact permission has not been given.'}</p><small>Updated ${e(new Date(r.updatedAt).toLocaleString())} · expires ${e(new Date(r.expiresAt).toLocaleString())}</small><details><summary>Compare the buying details</summary>${r.budget?`<p>Stated budget: ${e(r.budget.currency)} ${e(r.budget.maxAmount)} · ${r.budget.basis==='total'?'total':'per unit'}</p>`:'<p>No budget stated.</p>'}<ul>${r.qualification.checks.map(c=>`<li>${e(checkLabels[c.field]||c.field)}: ${e(c.field==='product'&&c.state==='match'?'Required product words found':checkStates[c.state]||'Needs checking')}${c.requestValue?` · requested ${e(c.requestValue)}${c.offerValue?` · offered ${e(c.offerValue)}`:''}`:''}</li>`).join('')}</ul><p class="small-print">A submitted request does not establish identity, ability to buy or interest in your specific offer. Confirm quantity and the basis of any quoted price.</p></details></div></li>`).join('')}</ul>`:'<p>No shared requests matched the exact product terms in this pass. Pull’s web research remains available from your saved offer.</p>'}${result.hasMore?'<p>More matching requests exist beyond this pass’s 100-candidate limit.</p>':''}`:''}
      <button class="button secondary" data-buyer-requests-refresh ${state.busy?'disabled':''}>Check again</button></section>`;
  }
  if(state.loading)return '<p role="status">Fetching your buying requests…</p>';
  const d=state.draft||emptyDraft();
  const input=(name,label,value,max=250,required=false)=>`<div class="field"><label for="request-${name}">${label}</label><input id="request-${name}" name="${name}" maxlength="${max}" value="${e(value??'')}" ${required?'required':''}></div>`;
  const select=(name,label,choices,value)=>`<div class="field"><label for="request-${name}">${label}</label><select id="request-${name}" name="${name}">${choices.map(([v,l])=>`<option value="${v}" ${String(value)===v?'selected':''}>${l}</option>`).join('')}</select></div>`;
  return `<section class="buyer-requests-workspace"><p>Describe what you want to buy. You choose whether sellers can find the request.</p>
    ${state.error?`<p role="alert">${e(state.error)}</p>`:''}${state.message?`<p role="status">${e(state.message)}</p>`:''}
    <form id="buyer-request-form" class="account-form" aria-busy="${Boolean(state.busy)}"><fieldset ${state.busy?'disabled':''} aria-label="Your buying request">
      <div class="section-grid">${input('product','What do you want to buy?',d.product,500,true)}${input('location','Where do you need it?',d.location,120,true)}
      ${select('category','Request type',Object.entries(categoryLabels),d.category)}</div>
      <details><summary>Add a budget or specific requirements</summary><div class="section-grid">${input('budgetMax','Maximum budget (optional)',d.budgetMax)}${select('budgetCurrency','Currency',[['NGN','NGN'],['USD','USD'],['GBP','GBP'],['EUR','EUR']],d.budgetCurrency)}${select('budgetBasis','Budget covers',[['total','The full purchase'],['per_unit','Each unit']],d.budgetBasis)}${requirementFields.map(([k,l])=>input(k,l,d.requirements?.[k])).join('')}</div></details>
      <div class="section-grid">${select('validForDays','Keep open from this save',[['1','1 day'],['7','7 days'],['14','14 days'],['30','30 days']],d.validForDays)}${select('status','Request status',[['open','Still looking'],['closed','Finished or no longer looking']],d.status)}</div>
      <p class="small-print" id="request-sharing-help">Sharing makes the product, location, requirements, budget and expiry visible to signed-in sellers with matching offers. Keep email addresses, phone numbers and private information out of these fields.</p>
      <label><input type="checkbox" name="discoverable" aria-describedby="request-sharing-help" ${d.discoverable?'checked':''}> Let sellers find this request</label>
      <label><input type="checkbox" name="contactAllowed" ${d.contactAllowed?'checked':''}> Allow contact in Pull about this request</label>
      <p class="small-print">Saving does not send a message or share your account email. Only share a genuine buying need; confirmation of your email does not verify the purchase.</p>
      <div class="form-actions"><button class="button primary" type="submit">${state.busy?'Saving…':d.revision?'Save updated request':'Save buying request'}</button>${d.revision?'<button class="button secondary" type="button" data-buyer-request-new>New request</button>':''}</div>
    </fieldset></form>
    <h3>Your saved requests</h3>${state.records?.length?`<ul class="offer-list">${state.records.map(r=>`<li><div><strong>${e(r.payload.product)}</strong><p>${e(r.payload.location)} · ${r.payload.status==='closed'?'Closed':new Date(r.expires_at)<=new Date()?'Expired':r.payload.discoverable?'Shared for matching':'Private'}</p><small>Saved version ${e(r.revision)}</small></div><div class="form-actions"><button class="button secondary small" data-buyer-request-edit="${e(r.id)}" ${state.busy?'disabled':''}>Edit details</button>${r.payload.status!=='closed'?`<button class="button secondary small" data-buyer-request-close="${e(r.id)}" ${state.busy?'disabled':''}>Close request</button>`:''}</div></li>`).join('')}</ul>`:'<p>No saved buying requests yet.</p>'}
    <p class="small-print">Your 100 most recently updated requests are shown. Edits remain in this dialog until saved.</p></section>`;
}

// Feature state lives here. Every asynchronous result is bound to both the
// account generation and this dialog generation; closing discards private drafts.
export function createBuyerRequestsWorkspace({document,request,ticket,current,signedIn,signIn,modal,isOpen,escape,uuid=()=>crypto.randomUUID(),readForm=form=>new FormData(form)}){
  let state=null,epoch=0;
  const leave=()=>{state=null;epoch++;};
  const active=(guard,generation)=>current(guard)&&epoch===generation&&state&&isOpen();
  const paint=()=>{if(state)modal('Buying requests',renderBuyerRequestsWorkspace(state,escape));};
  async function openMine(){
    if(!signedIn()){signIn();return;}
    const guard=ticket(),generation=++epoch;state={mode:'mine',loading:true,records:[],draft:emptyDraft(),error:'',message:''};paint();
    try{const result=await request('buyer-requests',undefined,guard.id);if(!active(guard,generation))return;state.records=result.requests;}
    catch(error){if(active(guard,generation))state.error=error.message;}
    finally{if(active(guard,generation)){state.loading=false;paint();}}
  }
  async function openMatches(offer){
    if(!signedIn()){signIn();return;}
    const guard=ticket(),generation=++epoch;state={mode:'matches',offer,busy:true,error:''};paint();
    try{const result=await request('buyer-requests',{action:'match',offerId:offer.id,offerVersion:offer.version},guard.id);if(active(guard,generation))state.result=result;}
    catch(error){if(active(guard,generation))state.error=error.message;}
    finally{if(active(guard,generation)){state.busy=false;paint();}}
  }
  function input(event){
    if(!state||state.mode!=='mine'||state.loading||state.busy||event.target.closest('form')?.id!=='buyer-request-form')return;
    const {name,value,checked}=event.target,d=state.draft;
    if(requirementFields.some(([k])=>k===name))d.requirements={...d.requirements,[name]:value};
    else if(['discoverable','contactAllowed'].includes(name))d[name]=checked===true;
    else if(['product','location','category','budgetMax','budgetCurrency','budgetBasis','validForDays','status'].includes(name))d[name]=value;
  }
  async function submit(event){
    if(event.target.id!=='buyer-request-form')return;
    event.preventDefault();if(!state||state.busy||state.loading||!signedIn())return;
    const d=state.draft,guard=ticket(),generation=epoch,data=readForm(event.target);
    for(const name of ['product','location','category','budgetMax','budgetCurrency','budgetBasis','validForDays','status'])d[name]=String(data.get(name)??d[name]);
    for(const [name] of requirementFields)d.requirements={...d.requirements,[name]:String(data.get(name)??d.requirements[name]??'')};
    d.discoverable=data.get('discoverable')==='on';d.contactAllowed=data.get('contactAllowed')==='on';
    d.id=d.id||uuid();
    const payload={product:d.product,location:d.location,category:d.category,requirements:Object.fromEntries(Object.entries(d.requirements).filter(([,v])=>String(v).trim())),
      budget:String(d.budgetMax).trim()?{currency:d.budgetCurrency,maxAmount:Number(d.budgetMax),basis:d.budgetBasis}:null,
      validForDays:Number(d.validForDays),status:d.status,discoverable:d.discoverable,contactAllowed:d.contactAllowed};
    const body={action:'save',requestId:d.id,expectedRevision:d.revision,payload},fingerprint=JSON.stringify(body);
    if(state.pending?.fingerprint!==fingerprint)state.pending={fingerprint,key:uuid()};
    body.requestKey=state.pending.key;state.busy=true;state.error='';state.message='';paint();
    try{
      const result=await request('buyer-requests',body,guard.id);if(!active(guard,generation))return;
      state.records=[result.request,...state.records.filter(r=>r.id!==result.request.id)].slice(0,100);state.draft=rowDraft(result.request);state.pending=null;state.message='Your buying request was saved.';
    }catch(error){if(active(guard,generation))state.error=error.message;}
    finally{if(active(guard,generation)){state.busy=false;paint();}}
  }
  async function withdraw(row){
    const guard=ticket(),generation=epoch;
    const body={action:'withdraw',requestId:row.id,expectedRevision:row.revision},fingerprint=JSON.stringify(body);
    if(state.pending?.fingerprint!==fingerprint)state.pending={fingerprint,key:uuid()};
    body.requestKey=state.pending.key;state.busy=true;state.error='';state.message='';paint();
    try{
      const result=await request('buyer-requests',body,guard.id);if(!active(guard,generation))return;
      state.records=state.records.map(r=>r.id===row.id?result.request:r);
      if(state.draft.id===row.id)state.draft={...state.draft,revision:result.request.revision,status:'closed',discoverable:false,contactAllowed:false};
      state.pending=null;state.message='Request closed. Sellers can no longer find it in matching.';
    }catch(error){if(active(guard,generation))state.error=error.message;}
    finally{if(active(guard,generation)){state.busy=false;paint();}}
  }
  async function click(event){
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.buyerRequests!==undefined){await openMine();return;}
    if(!state||state.busy||state.loading)return;
    if(button.dataset.buyerRequestClose&&state.mode==='mine'){
      const row=state.records.find(r=>r.id===button.dataset.buyerRequestClose);if(row)await withdraw(row);return;
    }
    if(button.dataset.buyerRequestsRefresh!==undefined&&state.mode==='matches'){await openMatches(state.offer);return;}
    if(button.dataset.buyerRequestNew!==undefined&&state.mode==='mine'){state.draft=emptyDraft();state.error='';state.message='';state.pending=null;paint();}
    if(button.dataset.buyerRequestEdit&&state.mode==='mine'){
      const row=state.records.find(r=>r.id===button.dataset.buyerRequestEdit);if(row){state.draft=rowDraft(row);state.error='';state.message='';state.pending=null;paint();}
    }
  }
  document.addEventListener('input',input);document.addEventListener('change',input);document.addEventListener('submit',submit);document.addEventListener('click',click);
  return {openMine,openMatches,leave,destroy(){leave();for(const [event,handler] of [['input',input],['change',input],['submit',submit],['click',click]])document.removeEventListener(event,handler);}};
}
