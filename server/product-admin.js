import {verifiedProductAdmin,productJson} from './product-auth.js';

// Read-only owner/analyst inbox. Aggregate totals cannot be inferred from
// the bounded recent sample; the UI explicitly labels it as such.
export function createProductAdminHandler(deps={}) {
  return async request=>{
    if(request.method!=='GET')return productJson(405,{error:'Method not allowed'});
    try{
      const auth=await verifiedProductAdmin(request,deps);
      if(!auth)return productJson(403,{error:'Product insights are available to authorized PULL staff only.'});
      const result=await auth.db.from('pull_product_feedback')
        .select('id,kind,message,created_at').order('created_at',{ascending:false}).limit(40).all();
      if(result.error)return productJson(503,{error:'Product insights are temporarily unavailable.'});
      const entries=(result.data||[]).filter(item=>item&&typeof item.id==='string'
        &&['bug','confusing','suggestion','positive'].includes(item.kind)
        &&typeof item.message==='string').map(item=>({
          id:item.id,kind:item.kind,message:item.message.slice(0,1000),created_at:item.created_at
        }));
      const categories={bug:0,confusing:0,suggestion:0,positive:0};
      for(const item of entries)categories[item.kind]++;
      return productJson(200,{role:auth.role,entries,categories,
        sample_size:entries.length,scope:'latest_40',is_total:false});
    }catch{return productJson(503,{error:'Product insights are temporarily unavailable.'});}
  };
}
