import {compareCommercialTerms} from './commercial-terms.js';
const words=v=>String(v||'').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ')||'';
const has=(v,term)=>Boolean(words(term))&&(' '+words(v)+' ').includes(' '+words(term)+' ');
// All source adapters produce explicit assertions and unknowns. None may turn
// authenticated-account ownership into verified identity or ability to buy.
export function qualifyBuyerRequest(offer,record,{now=new Date()}={}){
  const request=record.payload||{},fields=offer.fields||{};
  const productMatch=Boolean(offer.exactTerms?.length)&&offer.exactTerms.every(term=>has(request.product,term));
  const checks=[{field:'product',state:productMatch?'match':'conflict',basis:'literal_product_terms'}];
  checks.push({field:'category',state:fields.category&&request.category?(fields.category===request.category?'match':'conflict'):'unknown',basis:'seller_and_buyer_stated_category'});
  checks.push({field:'product_scope',state:'unknown',basis:'literal_words_do_not_establish_full_product_or_service_fit'});
  const sameLocation=Boolean(words(fields.location))&&words(fields.location)===words(request.location);
  checks.push({field:'location',state:sameLocation?'match':'unknown',basis:sameLocation?'same_stated_location':'fulfilment_not_established'});
  const commercial=compareCommercialTerms(fields,request);
  checks.push(commercial.budget,commercial.quantity,commercial.minimumOrder);
  for(const [field,value] of Object.entries(request.requirements||{})){
    if(field==='quantity')continue;
    const supplied=fields[field],same=Boolean(words(supplied))&&words(supplied)===words(value);
    checks.push({field,state:same?'match':supplied&&['year','model'].includes(field)?'conflict':'unknown',basis:same?'same_stated_value':supplied?'different_stated_values_need_review':'seller_value_missing',requestValue:value,offerValue:supplied||null});
  }
  const expires=new Date(record.expires_at),current=request.status==='open'&&Number.isFinite(expires.getTime())&&expires>now;
  const discoverable=request.discoverable===true,contactAllowed=request.contactAllowed===true;
  const conflicts=checks.filter(c=>c.state==='conflict'),missing=checks.filter(c=>c.state==='unknown').map(c=>c.field);
  return {version:1,state:!current||!discoverable?'unavailable':conflicts.length?'conflicting_terms':'possible_match',productMatch,checks,conflicts,missing,
    provenance:{kind:record.origin==='buyer_submitted'?'buyer_submitted':'source_asserted',requestId:record.id,revision:record.revision},
    permission:{discoveryAllowed:discoverable,contactAllowed,currentAsOf:now.toISOString()},
    unknown:['legal_identity','ability_to_buy','interest_in_this_specific_offer','reachability','independent_qualification'],buyerConfirmed:false,
    nextStep:conflicts.length?'Review the different buying terms.':'Confirm the remaining details with the buyer through an approved contact route.'};
}

export function qualifySourceRequest(offer,candidate){
  const observed=candidate.sourceCheck?.assessment;
  return {version:1,state:!candidate.sourceCheck?.originalChecked?'original_unchecked':observed?.state==='ambiguous_page'?'attribution_unresolved':observed?.state==='request_language_found'?'request_observed':'request_unconfirmed',
    provenance:{kind:'source_asserted',sourceId:candidate.id,sourceUrl:candidate.source_url,checkedAt:candidate.sourceCheck?.checkedAt||null},
    conflicts:observed?.conflicts||[],missing:['author_identity','request_freshness','full_buying_terms','contact_permission','reachability'],
    offerReference:{id:offer.id,version:offer.version},buyerConfirmed:false};
}
