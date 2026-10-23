import {createOfferDraft,confirmOfferDraft} from './v2-handoff.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const columns='offer_id,user_id,version,fields,exact_terms,confirmed_at';
export function offerReference(body){
  if(body.confirmedOffer!==undefined)throw fail('Choose a saved offer by ID and version.');
  if(body.offerId===undefined&&body.offerVersion===undefined)return null;
  if(!uuid.test(body.offerId||'')||!Number.isSafeInteger(body.offerVersion)||body.offerVersion<1)throw fail('Choose a saved offer and its version.');
  return {id:body.offerId,version:body.offerVersion};
}
export function savedOffer(row,ownerId){
  if(!row||row.user_id!==ownerId||!uuid.test(row.offer_id)||!Number.isSafeInteger(row.version)||row.version<1)throw fail('This offer is unavailable.',404);
  const draft=createOfferDraft({ownerId,source:{kind:'description',ref:row.offer_id},sellerInput:row.fields});
  const offer=confirmOfferDraft(draft,{ownerId,fields:row.fields,exactTerms:row.exact_terms});
  return {...offer,id:row.offer_id,version:row.version,confirmedAt:row.confirmed_at};
}
export async function loadConfirmedOffer({db,ownerId,reference,env}){
  if(env.PULL_OFFERS_ENABLED!=='true')throw fail('Product matching is not enabled on this installation.',503);
  const result=await db.from('pull_offer_versions').select(columns).eq('user_id',ownerId).eq('offer_id',reference.id).order('version',{ascending:false}).limit(1).maybeSingle();
  if(result.error)throw fail('Saved offers are unavailable. Your existing work is kept.',503);
  const offer=savedOffer(result.data,ownerId);
  if(offer.version!==reference.version)throw fail('This offer changed. Review its latest version before researching.',409);
  return offer;
}
export async function offersRequest({request,body,db,ownerId,env}){
  if(env.PULL_OFFERS_ENABLED!=='true')throw fail('Product matching is not enabled on this installation.',503);
  if(request.method==='GET'){
    const result=await db.from('pull_offer_versions').select(columns).eq('user_id',ownerId).order('confirmed_at',{ascending:false}).limit(100).all();
    if(result.error)throw fail('Saved offers are unavailable. Your existing work is kept.',503);
    const latest=new Map();
    for(const row of result.data||[])if(!latest.has(row.offer_id)||latest.get(row.offer_id).version<row.version)latest.set(row.offer_id,savedOffer(row,ownerId));
    return {offers:[...latest.values()],limit:100,notice:'Latest offers from the 100 most recent saved versions.'};
  }
  if(!body||Object.keys(body).some(k=>!['action','offerId','expectedVersion','fields','exactTerms'].includes(k))||body.action!=='confirm')throw fail('Confirm the product details before saving.');
  if(!uuid.test(body.offerId||'')||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0||body.expectedVersion>=100)throw fail('Use an offer ID and its current version.');
  let confirmed;
  try{
    const draft=createOfferDraft({ownerId,source:{kind:'description',ref:body.offerId},sellerInput:body.fields});
    confirmed=confirmOfferDraft(draft,{ownerId,fields:body.fields,exactTerms:body.exactTerms});
  }catch(error){throw fail(error.message);}
  const result=await db.rpc('save_pull_offer',{p_offer:body.offerId,p_expected_version:body.expectedVersion,p_fields:confirmed.fields,p_exact_terms:confirmed.exactTerms});
  if(result.error?.code==='40001')throw fail('This offer changed. Reload it before saving again.',409);
  if(result.error?.code==='P0001')throw fail('The daily product-save allowance is reached. Try again tomorrow.',429);
  if(result.error)throw fail('The offer could not be saved. Keep your product details and retry.',503);
  return {offer:savedOffer(result.data,ownerId)};
}
