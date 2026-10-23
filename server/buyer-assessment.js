const tokens=value=>String(value||'').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ')||'';
const has=(text,term)=>(' '+tokens(text)+' ').includes(' '+tokens(term)+' ');
const request=/\b(?:looking for|wanted to buy|want to buy|need to buy|buying request|request for quotation|seeking (?:a |an )?supplier)\b/i;
const closed=/\b(?:no longer (?:looking|needed|available)|not looking for|not interested in|do not need|don't need|request (?:closed|fulfilled)|already (?:bought|purchased)|found (?:a |the )?supplier|do not contact)\b/i;
const seller=/\b(?:for sale|selling my|selling our|we sell|sell my|available for purchase|looking for (?:a )?buyer|seeking (?:a )?buyer)\b/i;
const hypothetical=/\b(?:for example|sample request|example request|hypothetical|how to|what if)\b/i;
function money(value){
  const match=String(value||'').trim().match(/^(NGN|₦|USD|\$|GBP|£|EUR|€)\s*([\d,]+(?:\.\d+)?)\s*(million|thousand|m|k)?$/i);
  if(!match)return null;
  const currency={NGN:'NGN','₦':'NGN',USD:'USD','$':'USD',GBP:'GBP','£':'GBP',EUR:'EUR','€':'EUR'}[match[1].toUpperCase()];
  const amount=Number(match[2].replaceAll(',',''))*(/^(million|m)$/i.test(match[3])?1000000:/^(thousand|k)$/i.test(match[3])?1000:1);
  return currency&&Number.isFinite(amount)&&amount>0?{currency,amount}:null;
}
// Observations stay source-asserted. A matching phrase is insufficient to prove
// the author, current need, contact permission, or a qualified buyer.
export function observeBuyerRequest(text,offer){
  const fields=offer.fields||{};
  const chunks=String(text||'').normalize('NFKC').split(/(?<=[.!?])\s+|\n+/).map(s=>s.trim()).filter(s=>s.length&&s.length<=700);
  const relevant=chunks.filter(s=>offer.exactTerms.every(term=>has(s,term)));
  const requestQuote=relevant.find(s=>request.test(s)&&!hypothetical.test(s))||null;
  const closureQuote=relevant.find(s=>closed.test(s))||(requestQuote&&closed.test(requestQuote)?requestQuote:null);
  const sellerQuote=relevant.find(s=>seller.test(s))||null;
  const conflicts=[];
  if(requestQuote){
    // Compare only an explicitly labelled upper budget in the same statement.
    const budget=requestQuote.match(/\bbudget\s*(?:(?:of|is|up to|maximum|max|not exceeding)\s*)?:?\s*((?:NGN|₦|USD|\$|GBP|£|EUR|€)\s*[\d,]+(?:\.\d+)?\s*(?:million|thousand|m|k)?)/i);
    const afterBudget=budget?requestQuote.slice(budget.index+budget[0].length).trimStart():'';
    const budgetIsRangeOrFlexible=/^(?:[-–—]|to\b|and\b)/i.test(afterBudget)||/\b(?:negotiable|flexible)\b/i.test(requestQuote);
    const buyerBudget=budgetIsRangeOrFlexible?null:money(budget?.[1]),price=money(fields.price);
    if(buyerBudget&&price&&buyerBudget.currency===price.currency&&price.amount>buyerBudget.amount)conflicts.push({field:'price',reason:'asking_price_exceeds_stated_budget',quote:budget[0]});
    if(fields.year&&/^\d{4}$/.test(fields.year)){
      const escaped=offer.exactTerms.map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
      const year=new RegExp('(?:'+escaped+')\\s+(?:model\\s+)?(20\\d{2})\\b','i').exec(requestQuote)?.[1];
      if(year&&year!==fields.year)conflicts.push({field:'year',reason:'different_year_in_request',quote:year});
    }
  }
  return {version:1,basis:'original_page_text',state:closureQuote?'closure_language_found':sellerQuote?'seller_language_found':requestQuote?'request_language_found':'no_local_request',
    requestQuote:requestQuote?.slice(0,700)||null,closureQuote:closureQuote?.slice(0,700)||null,sellerQuote:sellerQuote?.slice(0,700)||null,
    locationMentioned:requestQuote?has(requestQuote,fields.location):false,conflicts,
    unknown:['author_identity','current_need','request_date','complete_specifications','contact_permission','reachability'],buyerConfirmed:false};
}
export const reviewFields=['requestActive','productFit','locationFit','termsFit','contactAllowed','reachable'];
export function validateBuyerReview(answers,note=''){
  if(!answers||typeof answers!=='object'||Array.isArray(answers)||Object.keys(answers).some(k=>!['actorRole',...reviewFields].includes(k))
    ||!['buyer','seller','intermediary','unknown'].includes(answers.actorRole)||reviewFields.some(k=>!['yes','no','unknown'].includes(answers[k])))throw new Error('Answer every review question, using unknown where needed.');
  if(typeof note!=='string'||note.trim().length>1000||Object.values(answers).some(v=>v==='yes'||v==='buyer')&&note.trim().length<20)throw new Error('Briefly record what you checked (20–1,000 characters for a positive assessment).');
  return {answers:{...answers},note:note.trim()};
}
export function assessBuyerReview(candidate,answers){
  const observed=candidate.sourceCheck?.assessment;
  const missing=reviewFields.filter(k=>answers[k]==='unknown');
  if(answers.actorRole==='unknown')missing.unshift('actorRole');
  const excluded=answers.actorRole==='seller'||answers.requestActive==='no'||answers.productFit==='no'||answers.locationFit==='no'||answers.termsFit==='no';
  const conflict=observed?.conflicts?.length||['closure_language_found','seller_language_found'].includes(observed?.state);
  return {state:excluded?'seller_marked_unsuitable':conflict?'source_needs_review':missing.length||answers.actorRole!=='buyer'||answers.contactAllowed!=='yes'||answers.reachable!=='yes'?'needs_more_checks':'seller_reviewed_match',
    basis:'seller_reported',missing,sourceWarnings:observed?.conflicts||[],sourceRequestObserved:observed?.state==='request_language_found',
    originalPageChecked:candidate.sourceCheck?.originalChecked===true,buyerConfirmed:false,
    notice:'This is the seller’s assessment. It is not independently verified buyer demand.'};
}
