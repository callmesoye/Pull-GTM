import {createHash} from 'node:crypto';
import {researchSourcePage} from './discovery.js';

const clean=value=>String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const kinds=new Set(['expressed_demand','intermediary','market_context']);
const words=value=>clean(value).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
const hasPhrase=(text,phrase)=>(' '+words(text).join(' ')+' ').includes(' '+words(phrase).join(' ')+' ');
const requestPattern=/\b(?:looking for|searching for|want(?:ed)? to buy|need to buy|seeking (?:a |an )?(?:supplier|dealer|seller)|request for quotation|buying request|in search of)\b/giu;
const closedPattern=/\b(?:no longer (?:looking|needed|available)|request (?:closed|fulfilled|cancelled|canceled)|already (?:bought|purchased)|found (?:a |the )?(?:car|supplier|seller))\b/iu;
const salePattern=/\b(?:for sale|selling my|we sell|cars? available|buy now|available for purchase)\b/iu;
const priceResearchPattern=/\b(?:what (?:is|s) the price|how much (?:is|does)|dream car|love this car|wish i (?:had|could))\b/iu;

function boundedString(value,min,max,label){
  if(typeof value!=='string')throw new Error('Invalid '+label+'.');
  const result=clean(value);
  if(result.length<min||result.length>max)throw new Error('Invalid '+label+'.');
  return result;
}

export function buyerResearchInput(value){
  if(!object(value)||Object.keys(value).some(k=>!['product','location','productTerms','hypotheses','limit'].includes(k)))throw new Error('Use a product, location and bounded buyer hypotheses.');
  const product=boundedString(value.product,3,500,'product'),location=boundedString(value.location,2,120,'location');
  if(!Array.isArray(value.productTerms)||!value.productTerms.length||value.productTerms.length>6)throw new Error('Use one to six exact product terms.');
  const productTerms=[...new Set(value.productTerms.map(term=>boundedString(term,2,80,'product term')))];
  // The model may propose new buyer categories, but cannot replace the product
  // with arbitrary targeting terms. Aliases can be added to the seller brief.
  if(productTerms.some(term=>!words(term).some(w=>/\p{L}/u.test(w))||!hasPhrase(product,term)))throw new Error('Product terms must occur in the seller product description.');
  if(!Array.isArray(value.hypotheses)||value.hypotheses.length<1||value.hypotheses.length>4)throw new Error('Use one to four buyer hypotheses.');
  const hypotheses=value.hypotheses.map((h,index)=>{
    if(!object(h)||Object.keys(h).some(k=>!['buyerType','reason','route','keywords','queries'].includes(k))||!kinds.has(h.route))throw new Error('Invalid buyer hypothesis.');
    if(!Array.isArray(h.keywords)||h.keywords.length<1||h.keywords.length>6||!Array.isArray(h.queries)||h.queries.length<1||h.queries.length>2)throw new Error('Use bounded route keywords and queries.');
    const queries=[...new Set(h.queries.map(q=>boundedString(q,3,300,'query')))];
    // Explicit geography is not silently broadened by a generated query.
    if(queries.some(q=>!hasPhrase(q,location)))throw new Error('Every query must preserve the requested location.');
    return {id:'H'+(index+1),buyerType:boundedString(h.buyerType,3,160,'buyer type'),reason:boundedString(h.reason,3,400,'hypothesis reason'),route:h.route,keywords:[...new Set(h.keywords.map(k=>boundedString(k,2,80,'keyword')))],queries};
  });
  if(!Number.isInteger(value.limit)||value.limit<1||value.limit>20)throw new Error('Choose one to twenty research sources.');
  return {product,location,productTerms,hypotheses,limit:value.limit};
}

export function assessBuyerObservation(page,input,hypothesis,{now=new Date()}={}){
  const source=researchSourcePage(page);if(!source)return null;
  const text=source.title+' '+source.description;
  const matchedTerms=input.productTerms.filter(term=>hasPhrase(text,term));
  const routeTerms=hypothesis.keywords.filter(term=>hasPhrase(text,term));
  if(!matchedTerms.length&&!routeTerms.length)return null;
  const locationMatched=hasPhrase(text,input.location);
  const published=typeof page.published_at==='string'&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(page.published_at)?new Date(page.published_at):null;
  const publishedAt=published&&Number.isFinite(published.getTime())&&published.getTime()<=now.getTime()?published.toISOString():null;
  const stale=Boolean(publishedAt&&now.getTime()-published.getTime()>30*86400000);
  const closed=closedPattern.test(text),sellerListing=salePattern.test(text);
  // A nearby product mention is a lead for review, not proof of who authored
  // it, whether it is current, what budget exists or whether contact is allowed.
  const requestWindows=[...text.matchAll(requestPattern)].map(m=>text.slice(Math.max(0,m.index-40),m.index+180));
  const requestExcerpt=requestWindows.find(s=>input.productTerms.some(term=>hasPhrase(s,term)));
  const possibleRequest=Boolean(requestExcerpt&&!closed&&!stale&&!sellerListing&&!priceResearchPattern.test(requestExcerpt));
  const kind=possibleRequest?'possible_request':hypothesis.route==='intermediary'&&routeTerms.length?'buying_route':'market_context';
  return {
    id:'buyer-source-'+createHash('sha256').update(source.url).digest('hex').slice(0,20),
    title:source.title,source_url:source.url,source_excerpt:source.description,
    observed_at:now.toISOString(),published_at:publishedAt,kind,
    matched_product_terms:matchedTerms,matched_route_terms:routeTerms,
    hypothesis_ids:[hypothesis.id],hypothesis_status:'proposed',
    evidence_status:'search-excerpt-unverified',location_status:locationMatched?'source-asserted':'unknown',
    need_status:'unconfirmed',affordability_status:'unknown',contact_permission:'unknown',
    request_excerpt:possibleRequest?requestExcerpt:'',
    missing:[...(!locationMatched?['Location']:[]),'Original source verification','Current requirement','Buyer identity or purchasing role','Contact permission',...(kind==='possible_request'?['Product specifications and budget']:[])],
    next_step:kind==='possible_request'?'Check the original request, date, author and specifications before considering an enquiry.':kind==='buying_route'?'Verify this intermediary handles the product and accepts supplier or seller enquiries.':'Use this source to investigate market language and buying routes; it is not a buyer lead.',
    excluded_as_request:closed?'closed_or_fulfilled':stale?'stale_request':sellerListing?'seller_listing':priceResearchPattern.test(text)?'interest_without_request':null
  };
}

function queryQueue(input){
  const seen=new Set(),queue=[];
  for(let index=0;index<2;index++)for(const hypothesis of input.hypotheses){
    const query=hypothesis.queries[index];if(!query)continue;
    const key=clean(query).toLowerCase();if(seen.has(key))continue;
    seen.add(key);queue.push({hypothesis,query,stage:index?'fallback':'initial'});
  }
  return queue;
}

async function search(query,{provider,key,transport,signal}){
  const endpoint=new URL(provider==='exa'?'https://api.exa.ai/search':provider==='serper'?'https://google.serper.dev/search':'https://api.search.brave.com/res/v1/web/search');
  if(provider==='brave'){endpoint.searchParams.set('q',query);endpoint.searchParams.set('count','10');endpoint.searchParams.set('safesearch','strict');endpoint.searchParams.set('extra_snippets','true');}
  const headers=provider==='exa'?{'x-api-key':key,'Content-Type':'application/json'}:provider==='serper'?{'X-API-KEY':key,'Content-Type':'application/json'}:{'X-Subscription-Token':key};
  const response=await transport(endpoint,{method:provider==='brave'?'GET':'POST',headers,signal,redirect:'error',...(provider==='brave'?{}:{body:JSON.stringify(provider==='exa'?{query,type:'auto',numResults:10,contents:{highlights:true}}:{q:query,num:10})})});
  if(!response.ok){const error=new Error('Source search did not complete.');error.code=[401,403].includes(response.status)?'KEY_REJECTED':response.status===402?'CREDITS_EXHAUSTED':response.status===429?'RATE_LIMITED':'PROVIDER_UNAVAILABLE';throw error;}
  const data=await response.json(),rows=provider==='exa'?data?.results:provider==='serper'?data?.organic:data?.web?.results;
  if(!Array.isArray(rows))throw new Error('Unexpected source response.');
  return rows.slice(0,10).filter(object).map(row=>({
    title:clean(row.title).slice(0,300),url:provider==='serper'?row.link:row.url,published_at:provider==='exa'?row.publishedDate:row.page_age,
    description:provider==='exa'?(Array.isArray(row.highlights)?row.highlights:[]).filter(v=>typeof v==='string').join(' '):[provider==='serper'?row.snippet:row.description,...(Array.isArray(row.extra_snippets)?row.extra_snippets:[])].filter(v=>typeof v==='string').join(' ')
  })).map(row=>({...row,url:clean(row.url).slice(0,2048),description:clean(row.description).slice(0,2000),published_at:clean(row.published_at).slice(0,80)}));
}

export async function discoverBuyerRoutes(raw,{provider,key,maxQueries=8,transport=fetch,beforeRequest,afterRequest,now=()=>new Date(),timeBudgetMs=25000,hypothesisOffset=0}={}){
  const input=buyerResearchInput(raw);
  input.hypotheses.forEach((h,index)=>{h.id='H'+(hypothesisOffset+index+1);});
  if(!['brave','exa','serper'].includes(provider)||typeof key!=='string'||!key.trim())throw new Error('Buyer research needs a configured source provider.');
  // A caller cannot accidentally run without the same quota boundary as the
  // established discovery endpoint. Budget is checked before every request.
  if(typeof beforeRequest!=='function')throw new Error('Source budget verification is required.');
  const cap=Math.min(8,Math.max(1,Number.isInteger(maxQueries)?maxQueries:8));
  const queue=queryQueue(input),sources=new Map(),trace=[];
  const deadline=Date.now()+Math.min(25000,Math.max(1,timeBudgetMs));
  let requestsUsed=0,stepsUsed=0,stopReason='routes_exhausted';
  const rank={possible_request:3,buying_route:2,market_context:1};
  for(const step of queue){
    if(stepsUsed>=cap){stopReason='request_budget_reached';break;}
    if(Date.now()>=deadline){stopReason='time_budget_reached';break;}
    // Context pages never satisfy a request for buyers; each selected route
    // gets an initial turn before any fallback vocabulary is attempted.
    let reservation;const identity={query:step.query,provider};
    try{reservation=await beforeRequest(identity);if(reservation!==true&&!['claimed','replay','uncertain'].includes(reservation?.state)){stopReason='source_budget_reached';break;}}
    catch{stopReason='budget_unavailable';break;}
    stepsUsed++;
    if(reservation?.state==='uncertain'){trace.push({hypothesis_id:step.hypothesis.id,stage:step.stage,query:step.query,status:'uncertain',accepted:0,duplicates:0});continue;}
    if(Date.now()>=deadline){stopReason='time_budget_reached';break;}
    const entry={hypothesis_id:step.hypothesis.id,stage:step.stage,query:step.query,status:'complete',accepted:0,duplicates:0};
    try{
      let receipt;
      if(reservation?.state==='replay'){receipt=reservation.response;entry.replayed=true;}
      else {
        requestsUsed++;
        try{receipt={rows:await search(step.query,{provider,key,transport,signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))})};}
        catch(error){receipt={error:['KEY_REJECTED','CREDITS_EXHAUSTED','RATE_LIMITED'].includes(error.code)?error.code:'PROVIDER_UNAVAILABLE'};}
        if(afterRequest){try{await afterRequest(identity,receipt);}catch{entry.status='unavailable';entry.code='PERSISTENCE_UNAVAILABLE';trace.push(entry);stopReason='persistence_unavailable';break;}}
      }
      if(receipt?.error){const error=new Error('Stored source failure.');error.code=receipt.error;throw error;}
      if(!Array.isArray(receipt?.rows))throw new Error('Invalid source receipt.');
      const rows=receipt.rows;
      entry.provider_results=rows.length;
      for(const row of rows){
        const candidate=assessBuyerObservation(row,input,step.hypothesis,{now:now()});if(!candidate)continue;
        const previous=sources.get(candidate.source_url);
        if(previous){
          entry.duplicates++;
          const ids=[...new Set([...previous.hypothesis_ids,...candidate.hypothesis_ids])];
          // Never splice separate snippets into a manufactured purchase quote.
          const chosen=rank[candidate.kind]>rank[previous.kind]?candidate:previous;
          sources.set(candidate.source_url,{...chosen,hypothesis_ids:ids});
        }else {sources.set(candidate.source_url,candidate);entry.accepted++;}
      }
    }catch(error){
      entry.status='unavailable';entry.code=['KEY_REJECTED','CREDITS_EXHAUSTED','RATE_LIMITED'].includes(error.code)?error.code:'PROVIDER_UNAVAILABLE';
      trace.push(entry);
      if(['KEY_REJECTED','CREDITS_EXHAUSTED','RATE_LIMITED'].includes(entry.code)){stopReason=entry.code.toLowerCase();break;}
      if(Date.now()>=deadline){stopReason='time_budget_reached';break;}
      continue;
    }
    trace.push(entry);
  }
  const all=[...sources.values()].sort((a,b)=>rank[b.kind]-rank[a.kind]||a.title.localeCompare(b.title));
  const opportunities=all.slice(0,input.limit);
  const summary={sources:opportunities.length,possibleRequests:opportunities.filter(x=>x.kind==='possible_request').length,buyingRoutes:opportunities.filter(x=>x.kind==='buying_route').length,marketContext:opportunities.filter(x=>x.kind==='market_context').length,confirmedBuyers:0};
  const partial=stopReason!=='routes_exhausted'||trace.some(t=>t.status!=='complete');
  const result={type:'buyer_research',input,provider,requestsUsed,opportunities,summary,trace,
    coverage:{selectedHypotheses:input.hypotheses.length,attemptedHypotheses:new Set(trace.map(t=>t.hypothesis_id)).size,plannedQueries:queue.length,completedQueries:trace.filter(t=>t.status==='complete').length,uniqueSourcesFound:all.length,displayedSources:opportunities.length,status:partial?'partial':'selected_routes_checked',stopReason},
    notice:'These are research sources and proposed buying routes, not verified buyers. Search excerpts do not establish current demand, identity, affordability or permission to contact. Original-source checks and buyer qualification remain necessary.'};
  // Keep the full key set for accurate cross-pass counts without exposing
  // undisplayed source URLs to the model or browser payload.
  Object.defineProperty(result,'sourceKeys',{value:all.map(item=>item.source_url)});
  return result;
}

export function mergeBuyerResearch(first,next){
  const rank={possible_request:3,buying_route:2,market_context:1},sources=new Map();
  for(const item of [...first.opportunities,...next.opportunities]){
    const previous=sources.get(item.source_url);
    sources.set(item.source_url,previous?{...(rank[item.kind]>rank[previous.kind]?item:previous),hypothesis_ids:[...new Set([...previous.hypothesis_ids,...item.hypothesis_ids])]}:item);
  }
  const opportunities=[...sources.values()].sort((a,b)=>rank[b.kind]-rank[a.kind]||a.title.localeCompare(b.title)).slice(0,first.input.limit);
  const trace=[...first.trace,...next.trace],keys=new Set([...(first.sourceKeys||first.opportunities.map(x=>x.source_url)),...(next.sourceKeys||next.opportunities.map(x=>x.source_url))]);
  const result={...next,input:{...first.input,hypotheses:[...first.input.hypotheses,...next.input.hypotheses]},opportunities,trace,requestsUsed:first.requestsUsed+next.requestsUsed,
    summary:{sources:opportunities.length,possibleRequests:opportunities.filter(x=>x.kind==='possible_request').length,buyingRoutes:opportunities.filter(x=>x.kind==='buying_route').length,marketContext:opportunities.filter(x=>x.kind==='market_context').length,confirmedBuyers:0},
    coverage:{...next.coverage,selectedHypotheses:first.input.hypotheses.length+next.input.hypotheses.length,attemptedHypotheses:new Set(trace.map(t=>t.hypothesis_id)).size,plannedQueries:first.coverage.plannedQueries+next.coverage.plannedQueries,completedQueries:trace.filter(t=>t.status==='complete').length,uniqueSourcesFound:keys.size,displayedSources:opportunities.length,status:trace.filter(t=>t.status==='complete').length<first.coverage.plannedQueries+next.coverage.plannedQueries||trace.some(t=>t.status!=='complete')||[first.coverage.stopReason,next.coverage.stopReason].some(reason=>reason!=='routes_exhausted'&&reason!=='request_budget_reached')?'partial':'selected_routes_checked'}};
  Object.defineProperty(result,'sourceKeys',{value:[...keys]});
  return result;
}
