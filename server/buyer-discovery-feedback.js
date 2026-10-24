import {offerScenarioGuidance} from './scenario-planner.js';

const normalize=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const bounded=v=>String(v||'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,300);

// Feedback gives the reasoning layer a next investigation, not a confidence
// score or permission to contact. It never promotes a source to buyer status.
export function buyerDiscoveryFeedback(offer,result,{remainingRequests=result?.remainingSourceRequests||0}={}){
  const input=result?.input,fields=offer?.fields||{product:input?.product,location:input?.location};
  if(!fields.product||!fields.location)return null;
  const sources=Array.isArray(result?.opportunities)?result.opportunities:[];
  const possible=sources.filter(s=>s.kind==='possible_request'),routes=sources.filter(s=>s.kind==='buying_route');
  const sellerOnly=sources.filter(s=>s.excluded_as_request==='seller_listing');
  const seen=new Set((result?.trace||[]).map(t=>normalize(t.query)));
  const guidance=offerScenarioGuidance(offer||{fields,exactTerms:input?.productTerms});
  const jobs=(guidance?.cases||[]).map(c=>({caseId:c.scenarioId,buyerRole:c.proposedBuyerRole,conditionalTrigger:c.conditionalTrigger,requiredChecks:c.requiredChecks}));
  const actions=[];
  if(possible.length)actions.push({action:'check_original_request',reason:'Search-language cues propose a buying request; establish the actual author, current date, full requirement and permitted contact route.',sourceIds:possible.slice(0,3).map(s=>s.id),executesContact:false});
  if(routes.length)actions.push({action:'check_intermediary_mandate',reason:'Establish whether the business buys stock, brokers it, inspects it or only sells. Those roles have different transaction paths.',sourceIds:routes.slice(0,3).map(s=>s.id),executesContact:false});
  const candidateQueries=jobs.flatMap(job=>[
    {query:bounded(`${job.buyerRole} ${fields.location}`),caseId:job.caseId,purpose:'Investigate the downstream buyer job; this search does not establish a purchase need.'},
    {query:bounded(`${fields.product.slice(0,80)} purchasing requirements ${fields.location}`),caseId:job.caseId,purpose:'Investigate actual purchasing requirements instead of treating stock listings as demand.'}
  ]);
  if(!jobs.length)candidateQueries.push({query:bounded(`${fields.product.slice(0,80)} buying request ${fields.location}`),caseId:null,purpose:'Investigate a direct requirement for the actual offer; the model must propose a product-specific buyer job if this route fails.'});
  const location=normalize(fields.location),queries=[];
  for(const next of candidateQueries){
    const key=normalize(next.query);
    // A long role/offer cannot truncate the explicit seller geography.
    if(!key.includes(location)||seen.has(key))continue;
    seen.add(key);queries.push(next);if(queries.length===2)break;
  }
  const canRefine=Number.isInteger(remainingRequests)&&remainingRequests>0;
  if(!possible.length)actions.push({action:canRefine?'refine_buyer_job_route':'propose_permissioned_demand_capture',
    reason:!sources.length?'The selected routes returned no accepted source. Test a different buying job or an authorized local demand channel.':sellerOnly.length?'Selling pages describe supply. Investigate organizations that use the offer and establish their actual purchasing route.':'Business relevance or product use is context. Investigate a dated requirement and the responsible purchasing role.',
    sourceIds:sources.slice(0,3).map(s=>s.id),executesContact:false});
  return {version:1,offerReference:offer?.id?{id:offer.id,version:offer.version}:null,
    diagnosis:!sources.length?'no_accepted_sources':possible.length?'request_cues_need_original_review':sellerOnly.length?'supply_results_need_downstream_search':'context_without_established_demand',
    observed:{sources:sources.length,possibleRequestCues:possible.length,intermediaryRoutes:routes.length,sellingListings:sellerOnly.length,confirmedBuyers:0},
    buyerJobs:jobs,actions,suggestedQueries:canRefine?queries.slice(0,remainingRequests):[],
    unexecutedQueries:canRefine?[]:queries,remainingRequests:canRefine?remainingRequests:0,
    evidenceChain:[{layer:'seller_offer',state:offer?.status==='confirmed'?'seller_confirmed':offer?.researchScenario===true?'hypothetical_scenario':'user_supplied',basis:'Current offer product and location remain fixed.'},
      {layer:'buyer_job',state:jobs.length?'case_hypothesis':'needs_reasoning',basis:'A proposed use is not a verified customer need.'},
      {layer:'business_route',state:sources.length?'source_asserted':'not_observed',basis:'Source presence and location require review.'},
      {layer:'current_need',state:'unconfirmed',basis:'Original request and buyer response are required.'},
      {layer:'commercial_fit_and_contact',state:'unconfirmed',basis:'Specifications, authority, quantities, budget, fulfilment and permission remain separate checks.'}],
    buyerConfirmed:false,executesSearch:false,executesContact:false,
    notice:'Use this feedback to refine within the original allowance. A suggested query is unexecuted. If public demand is scarce, propose a seller-approved demand form or authorized partner route; never invent a buyer or send automatically.'};
}
