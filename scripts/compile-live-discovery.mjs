import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {scenarioCatalog} from '../server/scenario-planner.js';
import {researchSourcePage} from '../server/discovery.js';
import {assessBuyerObservation,buyerResearchInput} from '../server/buyer-research.js';
import {buyerDiscoveryFeedback} from '../server/buyer-discovery-feedback.js';

const inputDir=process.argv[2];if(!inputDir)throw new Error('Supply the actual captured public-web receipt directory. This compiler does not perform live searches.');
const out=path.resolve(process.argv[3]||'research/scenario-lab/live-2026-10-24');await mkdir(out,{recursive:true});
const receipts=(await Promise.all((await readdir(inputDir)).filter(n=>/^receipts-\d+\.json$/.test(n)).sort().map(n=>readFile(path.join(inputDir,n),'utf8').then(JSON.parse)))).flat();
const followupDir=process.argv[4];
const followups=followupDir?(await Promise.all((await readdir(followupDir)).filter(n=>/^receipts-\d+\.json$/.test(n)).sort().map(n=>readFile(path.join(followupDir,n),'utf8').then(JSON.parse)))).flat():[];
const followupByCase=new Map(followups.map(r=>[r.caseId,r]));
if(followupByCase.size!==followups.length)throw new Error('Duplicate adaptive case receipt.');
const scenarios=new Map(scenarioCatalog().map(c=>[c.id,c])),sources=new Map(),cases=[],seen=new Set();
const words=s=>String(s||'').split(/\s+/).filter(Boolean);
const short=(s,n)=>words(s).slice(0,n).join(' ');
let reviewRecords=[];try{reviewRecords=JSON.parse(await readFile(path.join(out,'reviews.json'),'utf8')).reviews||[];}catch(error){if(error.code!=='ENOENT')throw error;}
function assessRows(receipt,input){
  const observations=[],candidates=[];let excluded=0;
  for(const raw of receipt.rows){
    const page=researchSourcePage(raw);if(!page){excluded++;continue;}
    const sourceId='L'+createHash('sha256').update(page.url).digest('hex').slice(0,16);
    if(!sources.has(sourceId)){
      const title=short(page.title.replace(/\+?\d[\d ()-]{8,}\d/g,'[business contact omitted]'),15);
      sources.set(sourceId,{id:sourceId,url:page.url,title,excerpt:short(page.description,Math.max(0,24-words(title).length)),citationRef:raw.ref,
        retrievedAt:receipt.checkedAt,reviewLevel:'search_excerpt_only',requestDate:null,currentNeed:'unconfirmed',buyerConfirmed:false});
    }
    const candidate=assessBuyerObservation(raw,input,input.hypotheses[0],{now:new Date(receipt.checkedAt)});
    observations.push({sourceId,citationRef:raw.ref,evidenceFingerprint:createHash('sha256').update(raw.title+'\n'+raw.description).digest('hex'),backendSourceId:candidate?.id||null,machineObservation:candidate?{kind:candidate.kind,matchedProductTerms:candidate.matched_product_terms,matchedRouteTerms:candidate.matched_route_terms,locationStatus:candidate.location_status,excludedAsRequest:candidate.excluded_as_request}:null});
    if(candidate)candidates.push(candidate);
  }
  return {observations,candidates,excluded};
}
for(const receipt of receipts){
  const c=scenarios.get(receipt.caseId);if(!c||seen.has(c.id))throw new Error('Unknown or duplicate live case.');seen.add(c.id);
  const buyerWords=words(c.buyerRole).map(w=>w.toLowerCase().replace(/[^\p{L}\p{N}-]/gu,'')).filter(w=>w.length>3&&!['private','commercial','independent','licensed','qualified','registered','authorized','verified','manager','purchasing','procurement','coordinator','officer','current','confirmed','with','that','from','lead','owner','business','team'].includes(w)).slice(0,5);
  const keywords=[c.product,...buyerWords].slice(0,6);
  const input=buyerResearchInput({product:c.product,location:c.location,productTerms:[c.product],limit:10,hypotheses:[{buyerType:c.buyerRole.slice(0,160),reason:c.trigger.slice(0,400),route:'market_context',keywords,queries:[receipt.query]}]});
  const {observations,candidates,excluded}=assessRows(receipt,input);
  const followup=followupByCase.get(c.id);let adaptive=null;
  if(followup){
    const checked=buyerResearchInput({...input,hypotheses:input.hypotheses.map(({id,...h})=>({...h,queries:[followup.query]}))});
    const next=assessRows(followup,checked);
    adaptive={query:followup.query,checkedAt:followup.checkedAt,status:followup.status,reason:followup.why,retainedTopSources:followup.rows.length,policyExcludedRetainedSources:next.excluded,sourceObservations:next.observations,
      machineAcceptedObservations:next.candidates.length,machinePossibleRequestCues:next.candidates.filter(s=>s.kind==='possible_request').length,
      recoveredLexicalObservation:candidates.length===0&&next.candidates.length>0,buyerConfirmed:false};
  }
  const offer={id:'live-case-'+c.id,version:1,researchScenario:true,fields:{product:c.product,location:c.location},exactTerms:[c.product]};
  const result={input,opportunities:candidates,trace:[{query:receipt.query,status:receipt.status}],remainingSourceRequests:2};
  const feedback=buyerDiscoveryFeedback(offer,result);
  cases.push({caseId:c.id,product:c.product,location:c.location,buyerRole:c.buyerRole,conditionalTrigger:c.trigger,requiredChecks:c.bindingCheck,
    query:receipt.query,checkedAt:receipt.checkedAt,status:receipt.status,durationMs:receipt.durationMs,providerReturnedSources:receipt.providerReturnedSources,
    retainedTopSources:receipt.rows.length,policyExcludedRetainedSources:excluded,sourceObservations:observations,
    machineAcceptedObservations:candidates.length,machinePossibleRequestCues:candidates.filter(s=>s.kind==='possible_request').length,
    nextInvestigation:{diagnosis:feedback.diagnosis,observed:feedback.observed,actions:feedback.actions,suggestedQueries:feedback.suggestedQueries,offerOrigin:'hypothetical_scenario',queriesExecuted:false},
    adaptive,originalReview:reviewRecords.some(r=>r.caseIds.includes(c.id))?'selected_checks_recorded_in_reviews':'not_yet_reviewed',
    queryLabelNote:c.id==='S428'?'The recorded first query used the earlier erroneous cold-storage label; the offer label was corrected to dry off-season gear storage. No corrected first query is claimed.':null,
    independentlyRelevant:null,confirmedBuyerCount:0,buyerFindingOutcome:null});
}
if(cases.length!==520)throw new Error('All 520 cases must have a captured receipt.');
const summary={checkedDate:'2026-10-24',cases:cases.length,executedSearches:receipts.length+followups.length,firstPassSearches:receipts.length,adaptiveSearches:followups.length,retainedTopSources:[...receipts,...followups].reduce((n,r)=>n+r.rows.length,0),
  uniquePolicyAdmissibleSources:sources.size,policyExcludedRetainedSources:cases.reduce((n,c)=>n+c.policyExcludedRetainedSources+(c.adaptive?.policyExcludedRetainedSources||0),0),
  casesWithMachineAcceptedObservations:cases.filter(c=>c.machineAcceptedObservations>0).length,machinePossibleRequestCues:cases.reduce((n,c)=>n+c.machinePossibleRequestCues,0),
  recoveredLexicalObservationCases:cases.filter(c=>c.adaptive?.recoveredLexicalObservation).length,adaptiveMachinePossibleRequestCues:cases.reduce((n,c)=>n+(c.adaptive?.machinePossibleRequestCues||0),0),
  failedSearches:[...receipts,...followups].filter(c=>c.status==='tool_error').length,confirmedBuyers:0,independentRelevancePrecision:null,buyerFindingRate:null};
const metadata={version:2,method:'One individually attributed external public-web search per hypothetical seller case, followed by feedback-generated buyer-job searches for zero-observation cases and one representative per sector. At most the first five parsed search sources per query were retained. Captured excerpts were assessed through PULL source policy and observation logic; this is not a live production-provider or end-to-end buyer-finding evaluation.',
  limitations:['Search results can be irrelevant, stale, seller advertisements, job listings or incomplete.','Request publication dates were not established by this pass.','Policy admissibility, lexical acceptance and recovered observations are not independent relevance, buyer-finding or private-ownership verification.','Case products, seller situations, buyer jobs and triggers remain hypothetical.','No outreach, buyer response or transaction was executed.','Adaptive selection is nonrandom and cannot establish a causal performance improvement.','Only the queries in the recorded first and adaptive passes were executed; other suggestions remain unexecuted.'],summary};
await writeFile(path.join(out,'manifest.json'),JSON.stringify(metadata,null,2)+'\n');
await writeFile(path.join(out,'cases.jsonl'),cases.map(c=>JSON.stringify(c)).join('\n')+'\n');
await writeFile(path.join(out,'sources.jsonl'),[...sources.values()].map(s=>JSON.stringify(s)).join('\n')+'\n');
console.log(JSON.stringify(summary));
