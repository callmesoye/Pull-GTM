import {randomUUID} from 'node:crypto';
import {buyerResearchInput} from './buyer-research.js';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clean=(value,max,label)=>{
  if(typeof value!=='string')throw new Error('Invalid '+label+'.');
  const result=value.normalize('NFKC').replace(/\s+/g,' ').trim();
  if(!result||result.length>max)throw new Error('Invalid '+label+'.');
  return result;
};
const optional=(value,max,label)=>value===undefined||value===null||value===''?null:clean(value,max,label);
const fields=new Set(['product','location','price','condition','quantity','delivery','model','year','variant','material','capacity','service_scope','category']);
const words=value=>value.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
const containsPhrase=(text,phrase)=>(' '+words(text).join(' ')+' ').includes(' '+words(phrase).join(' ')+' ');
const claimsFor=(values,origin,sourceRef)=>Object.entries(values).filter(([,value])=>value!==null).map(([field,value])=>({field,value,origin,sourceRef}));
const normalizedFields=(input,{required=false}={})=>{
  if(!object(input)||Object.keys(input).some(field=>!fields.has(field)))throw new Error('Unknown offer field.');
  const values={};
  for(const [field,value] of Object.entries(input))values[field]=optional(value,field==='product'?500:field==='location'?120:250,field);
  if(values.category&&!['goods','service','wholesale'].includes(values.category))throw new Error('Choose product, service or wholesale.');
  if(required&&(!values.product||!values.location))throw new Error('Confirm a product and location before research.');
  return values;
};

// The caller authenticates the owner and resolves a private, owner-scoped
// asset or approved page before using its opaque reference here. The model
// can suggest observations, but cannot create seller-confirmed assertions.
export function createOfferDraft({ownerId,source,sellerInput,modelObservations=[]}){
  const owner=clean(ownerId,128,'owner');
  if(!object(source)||!['description','image','page'].includes(source.kind))throw new Error('Invalid offer source.');
  const sourceRef=clean(source.ref,256,'source reference');
  if(!Array.isArray(modelObservations)||modelObservations.length>24)throw new Error('Too many observations.');
  const seller=normalizedFields(sellerInput);
  const origin=source.kind==='image'?'image_observed':source.kind==='page'?'page_asserted':'text_observed';
  const observed=modelObservations.map(item=>{
    if(!object(item)||!fields.has(item.field))throw new Error('Invalid observation.');
    return {field:item.field,value:clean(item.value,250,'observation'),origin,sourceRef};
  });
  return {id:randomUUID(),ownerId:owner,source:{kind:source.kind,ref:sourceRef},status:'needs_confirmation',claims:[...claimsFor(seller,'seller_stated',sourceRef),...observed]};
}

export function confirmOfferDraft(draft,{ownerId,fields:confirmed,exactTerms=[]}){
  if(!object(draft)||draft.status!=='needs_confirmation'||draft.ownerId!==ownerId)throw new Error('This offer cannot be confirmed by this owner.');
  const values=normalizedFields(confirmed,{required:true});
  if(!Array.isArray(exactTerms)||exactTerms.length>6)throw new Error('Invalid exact product terms.');
  const terms=[...new Set(exactTerms.map(value=>clean(value,80,'product term')))];
  if(!terms.length){if(values.product.length>80)throw new Error('Confirm a short exact product term.');terms.push(values.product);}
  // The existing research tool accepts only terms literally present in the
  // seller-confirmed product; model-supplied alternate terms stay hypotheses.
  if(terms.some(term=>!words(term).some(word=>/\p{L}/u.test(word))||!containsPhrase(values.product,term)))throw new Error('Exact product terms must appear in the confirmed offer.');
  return {id:draft.id,ownerId:draft.ownerId,version:1,status:'confirmed',source:draft.source,fields:values,exactTerms:terms,
    claims:[...draft.claims,...claimsFor(values,'seller_confirmed',draft.source.ref)]};
}

export function bindResearchPlan(offer,{hypotheses,limit=10}){
  if(!object(offer)||offer.status!=='confirmed'||!object(offer.fields))throw new Error('Research requires a confirmed offer.');
  // Product, location and exact terms are constructed server-side. A planning
  // LLM is allowed to propose routes and queries, never overwrite the offer.
  const input=buyerResearchInput({product:offer.fields.product,location:offer.fields.location,productTerms:offer.exactTerms,hypotheses,limit});
  return {offerId:offer.id,offerVersion:offer.version,ownerId:offer.ownerId,input};
}

// Only a trusted original-source checker may supply verification. Treat all
// missing facts as unknown. An excerpt alone cannot enter a buyer tier.
export function classifyOpportunity(candidate,verification){
  if(!object(candidate)||!['possible_request','buying_route','market_context'].includes(candidate.kind))throw new Error('Invalid candidate.');
  if(!object(verification)||verification.originalChecked!==true)return {tier:'research_lead',reason:'original_source_unchecked'};
  if(verification.active===false||verification.authorRole==='seller'||verification.productFit===false||verification.locationFit===false)return {tier:'excluded',reason:verification.active===false?'inactive':verification.authorRole==='seller'?'seller_listing':'incompatible'};
  if(candidate.kind==='market_context')return {tier:'market_context',reason:'no_buying_request'};
  if(candidate.kind==='buying_route')return verification.businessRole==='intermediary'&&verification.productFit===true&&verification.locationFit===true?{tier:'buying_route',reason:'intermediary_fit_checked'}:{tier:'research_lead',reason:'route_unconfirmed'};
  if(verification.authorRole!=='buyer'||verification.active!==true||verification.productFit!==true||verification.locationFit!==true)return {tier:'research_lead',reason:'request_unconfirmed'};
  if(verification.needConfirmed===true&&verification.termsFit===true&&verification.contactAllowed===true)return {tier:'qualified_opportunity',reason:'need_terms_and_contact_checked'};
  return {tier:'verified_request',reason:'further_qualification_needed'};
}
