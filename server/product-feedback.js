import {verifiedProductUser,productJson,productOriginOk,readProductJSON} from './product-auth.js';
const TYPES=new Set(['bug','confusing','suggestion','positive']);
const MAX_DAILY_FEEDBACK=5;
export function createProductFeedbackHandler(deps={}) {
  return async request=>{
    if(request.method!=='POST')return productJson(405,{error:'Method not allowed'});
    if(!productOriginOk(request))return productJson(403,{error:'Open PULL directly to continue'});
    const body=await readProductJSON(request);
    if(!body||!TYPES.has(body.kind)||typeof body.message!=='string'||body.message.trim().length<10||body.message.length>1000)
      return productJson(400,{error:'Choose a category and add 10–1000 characters of feedback.'});
    try{
      const auth=await verifiedProductUser(request,deps);
      if(!auth)return productJson(401,{error:'Sign in to send feedback'});
      const utcDay=new Date().toISOString().slice(0,10);
      // DB enforces five unique slots per owner per UTC day, including
      // concurrent or direct PostgREST requests. The app only chooses a slot.
      const existing=await auth.db.from('pull_product_feedback')
        .select('slot').eq('user_id',auth.user.id).eq('feedback_day',utcDay).limit(5).all();
      if(existing.error)return productJson(503,{error:'Feedback is temporarily unavailable.'});
      const used=new Set((existing.data||[]).map(entry=>entry.slot));
      const slot=Array.from({length:MAX_DAILY_FEEDBACK},(_,i)=>i+1).find(n=>!used.has(n));
      if(!slot)return productJson(429,{error:'Daily feedback limit reached. Try again tomorrow.'});
      const result=await auth.db.from('pull_product_feedback')
        .insert({user_id:auth.user.id,kind:body.kind,message:body.message.trim(),slot}).select('id').maybeSingle();
      if(result.error)return productJson(result.error.code==='23505'?409:503,{
        error:result.error.code==='23505'?'Your feedback was updated in another tab. Please try once more.':'Feedback is temporarily unavailable.'
      });
      return productJson(201,{received:true});
    }catch{return productJson(503,{error:'Feedback is temporarily unavailable.'});}
  };
}
