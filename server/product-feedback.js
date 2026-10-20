import {verifiedProductUser,productJson,productOriginOk,readProductJSON} from './product-auth.js';
const TYPES=new Set(['bug','confusing','suggestion','positive']);
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
      const result=await auth.db.from('pull_product_feedback')
        .insert({user_id:auth.user.id,kind:body.kind,message:body.message.trim()}).select('id').maybeSingle();
      if(result.error)return productJson(result.error.code==='P0001'?429:503,{error:result.error.code==='P0001'?'Daily feedback limit reached.':'Feedback is temporarily unavailable.'});
      return productJson(201,{received:true});
    }catch{return productJson(503,{error:'Feedback is temporarily unavailable'});}
  };
}
