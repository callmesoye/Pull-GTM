import {loadConfirmedOffer} from './offers.js';
import {qualifyBuyerRequest} from './request-qualification.js';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const requirementKeys=['model','year','variant','condition','material','capacity','service_scope','quantity','delivery'];
const clean=(v,max,name)=>{
  if(typeof v!=='string')throw fail('Check '+name+'.');
  const text=v.normalize('NFKC').replace(/\s+/g,' ').trim();
  if(!text||text.length>max)throw fail('Check '+name+'.');
  return text;
};
export function validateBuyerRequest(input){
  const keys=['product','location','category','requirements','budget','validForDays','status','discoverable','contactAllowed'];
  if(!object(input)||Object.keys(input).length!==keys.length||Object.keys(input).some(k=>!keys.includes(k)))throw fail('Use the buying request fields.');
  if(!['goods','service','wholesale'].includes(input.category)||!['open','closed'].includes(input.status)
    ||!Number.isInteger(input.validForDays)||input.validForDays<1||input.validForDays>30
    ||typeof input.discoverable!=='boolean'||typeof input.contactAllowed!=='boolean')throw fail('Check the request category, status, duration and permissions.');
  if(!object(input.requirements)||Object.keys(input.requirements).some(k=>!requirementKeys.includes(k)))throw fail('Check the buying requirements.');
  const requirements=Object.fromEntries(Object.entries(input.requirements).map(([k,v])=>[k,clean(v,250,k)]));
  if(requirements.year&&!/^\d{4}$/.test(requirements.year))throw fail('Use a four-digit model year.');
  let budget=null;
  if(input.budget!==null){
    const b=input.budget;
    if(!object(b)||Object.keys(b).length!==3||Object.keys(b).some(k=>!['currency','maxAmount','basis'].includes(k))
      ||!['NGN','USD','GBP','EUR'].includes(b.currency)||!['total','per_unit'].includes(b.basis)
      ||typeof b.maxAmount!=='number'||!Number.isFinite(b.maxAmount)||b.maxAmount<=0||b.maxAmount>1e12
      ||Math.abs(b.maxAmount*100-Math.round(b.maxAmount*100))>0.001)throw fail('Use a currency, budget up to two decimal places, and total or per-unit basis.');
    budget={currency:b.currency,maxAmount:b.maxAmount,basis:b.basis};
  }
  return {product:clean(input.product,500,'what you want to buy'),location:clean(input.location,120,'location'),category:input.category,
    requirements,budget,validForDays:input.validForDays,status:input.status,discoverable:input.discoverable,contactAllowed:input.contactAllowed};
}
function checked(result){
  if(!result.error)return result.data;
  const code=result.error.code;
  throw fail(code==='42501'?'Confirm your email and use your own current request or offer.':code==='40001'?'This request or offer changed. Reload the latest version.':code==='22023'?'Check the request details and retry key.':code==='P0001'?'The daily request allowance is reached.':'Buying requests are temporarily unavailable.',code==='42501'?403:code==='40001'?409:code==='22023'?400:code==='P0001'?429:503);
}
export const buyerRequestEnabled=env=>env.PULL_OFFERS_ENABLED==='true'&&env.PULL_BUYER_REQUESTS_ENABLED==='true';
export async function buyerRequestsRequest({request,body,db,ownerId,env,now=()=>new Date()}){
  if(!buyerRequestEnabled(env))throw fail('Buying requests need the isolated V2 request storage setup.',503);
  if(request.method==='GET'){
    const data=checked(await db.from('pull_buyer_requests').select('id,revision,payload,created_at,updated_at,expires_at').eq('user_id',ownerId).order('updated_at',{ascending:false}).limit(100).all());
    return {requests:data,limit:100,notice:'Your 100 most recently updated requests. Only open, unexpired requests you allow sellers to discover can be matched.'};
  }
  if(['save','withdraw'].includes(body?.action)){
    if(Object.keys(body).some(k=>!(body.action==='save'?['action','requestId','expectedRevision','requestKey','payload']:['action','requestId','expectedRevision','requestKey']).includes(k))||!uuid.test(body.requestId||'')||!uuid.test(body.requestKey||'')||!Number.isInteger(body.expectedRevision)||body.expectedRevision<0||body.expectedRevision>=2147483647)throw fail('Use your buying request and its current revision.');
    const args={p_request:body.requestId,p_expected_revision:body.expectedRevision,p_request_key:body.requestKey};
    if(body.action==='save')args.p_payload=validateBuyerRequest(body.payload);
    const row=checked(await db.rpc(body.action==='save'?'save_pull_buyer_request':'withdraw_pull_buyer_request',args));
    if(!row||row.user_id!==ownerId)throw fail('The saved request is unavailable.',503);
    const {user_id,...saved}=row;
    return {request:saved,notice:body.action==='withdraw'?'Request closed and withdrawn from matching.':'Saved as your stated buying need. It is not independently verified.'};
  }
  if(body?.action==='match'){
    if(Object.keys(body).some(k=>!['action','offerId','offerVersion'].includes(k))||!uuid.test(body.offerId||'')||!Number.isInteger(body.offerVersion)||body.offerVersion<1)throw fail('Choose a current saved offer.');
    const offer=await loadConfirmedOffer({db,ownerId,reference:{id:body.offerId,version:body.offerVersion},env});
    if(!offer.fields.category)throw fail('Edit your saved offer and choose product, service or wholesale before matching buying requests.');
    const data=checked(await db.rpc('match_pull_buyer_requests',{p_offer:offer.id,p_offer_version:offer.version}));
    if(!object(data)||!Array.isArray(data.requests))throw fail('The request search could not be read.',503);
    const matches=data.requests.map(row=>({requestId:row.id,revision:row.revision,product:row.payload.product,location:row.payload.location,
      category:row.payload.category,requirements:row.payload.requirements,budget:row.payload.budget,updatedAt:row.updated_at,expiresAt:row.expires_at,
      qualification:qualifyBuyerRequest(offer,{...row,origin:'buyer_submitted'},{now:now()})})).filter(row=>row.qualification.productMatch&&row.qualification.state!=='unavailable');
    return {offerReference:{id:offer.id,version:offer.version},matches,candidateLimit:100,hasMore:data.hasMore===true,
      notice:'These are buyer-submitted requests from confirmed-email accounts. Identity, ability to buy and fit with your specific offer remain unverified. No contact details are disclosed and no messages are sent.'};
  }
  throw fail('Choose save, withdraw or match for buying requests.');
}
