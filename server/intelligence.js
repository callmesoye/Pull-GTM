import {discoveryInput,searchConfiguration,discoverPrivatePages} from './discovery.js';
import {qualify} from '../dist/engine.js';
import {validateWorkspace} from '../dist/workspace.js';
import {randomUUID} from 'node:crypto';
import {createResearchJournal} from './research-journal.js';
import {buyerResearchInput,discoverBuyerRoutes,mergeBuyerResearch} from './buyer-research.js';
import {bindResearchPlan} from './v2-handoff.js';
import {approvedSourceHosts,checkBuyerSource,readApprovedPage} from './source-check.js';

const schema=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string={type:'string'};
export const intelligenceToolDefinitions={
  discover_buyer_routes:{type:'function',function:{name:'discover_buyer_routes',description:'Work backward from the seller product and explicit location to research several buyer hypotheses. Generate distinct expressed-demand, intermediary and market-context routes rather than asking the user to already know the audience. All reasons are hypotheses. Use exact product terms from the seller description. Include the full requested location in every query, with one fallback query per route where useful. Never infer personal wealth, income or affordability from lifestyle, occupation, appearance, interests or social engagement. Context is not a buyer and a selling listing is not a buying request. Returns unverified source excerpts and a bounded execution trace, not confirmed buyers. Uses source credits; no scraping private communities or sending.',strict:true,parameters:schema({product:{type:'string',maxLength:500},location:{type:'string',maxLength:120},productTerms:{type:'array',minItems:1,maxItems:6,items:{type:'string',maxLength:80}},limit:{type:'integer',minimum:1,maximum:20},hypotheses:{type:'array',minItems:1,maxItems:4,items:schema({buyerType:{type:'string',maxLength:160},reason:{type:'string',maxLength:400},route:{type:'string',enum:['expressed_demand','intermediary','market_context']},keywords:{type:'array',minItems:1,maxItems:6,items:{type:'string',maxLength:80}},queries:{type:'array',minItems:1,maxItems:2,items:{type:'string',maxLength:300}}})}})}},
  search_prospects:{type:'function',function:{name:'search_prospects',description:'Research named private-sector prospects using the user’s explicit audience, industry, location and requested count. Ask for missing criteria first. Search costs source credits. Never infer buying intent from a listing.',strict:true,parameters:schema({audience:string,industry:string,location:string,source:{type:'string',description:'A requested platform/domain, or empty for all supported web sources.'},limit:{type:'integer',minimum:1,maximum:50}})}},
  review_workspace:{type:'function',function:{name:'review_workspace',description:'Read this authenticated user’s saved Pull workspace and assess audience fit and evidence gaps. Imported facts remain unverified. Does not change data.',strict:true,parameters:schema({})}},
  list_workflows:{type:'function',function:{name:'list_workflows',description:'List this user’s available workflows. The user must review and run one in Automations. This tool cannot execute or send anything.',strict:true,parameters:schema({})}}
};

intelligenceToolDefinitions.refine_buyer_routes={type:'function',function:{name:'refine_buyer_routes',description:'Run one evidence-informed second pass after discover_buyer_routes. Use findings from the first pass to propose different buyers, buying routes or vocabulary. State which observed evidence or unresolved gap justifies each proposed route in reason; all proposals remain hypotheses. Product, exact terms, location, result limit and total source allowance are fixed by the original investigation. No repeated queries, contact, personal wealth inference or new product assumptions. Results replace the first source card batch with a consolidated batch.',strict:true,parameters:schema({hypotheses:intelligenceToolDefinitions.discover_buyer_routes.function.parameters.properties.hypotheses})}};

export function createIntelligenceTools({db,ownerId,env,transport,useWorkspace=false,allowResearch=false,requestKey,goalFingerprint,confirmedOffer,sourceReader=readApprovedPage,now=()=>new Date()}) {
  const tools={};
  let buyerSession=null,journal=null;
  const checkedSources=new Map();
  const checkSources=async result=>{
    if(!confirmedOffer)return;
    result.offerReference={id:confirmedOffer.id,version:confirmedOffer.version};
    if(env.PULL_SOURCE_CHECK_ENABLED!=='true')return;
    let hosts;try{hosts=approvedSourceHosts(env.PULL_SOURCE_CHECK_HOSTS||'');}catch{result.sourceChecks={status:'configuration_unavailable',attempted:0,opened:0,max:2};return;}
    for(const item of result.opportunities){
      let host;try{host=new URL(item.source_url).hostname;}catch{continue;}
      if(!hosts.includes(host)){item.sourceCheck={state:'not_approved',originalChecked:false};continue;}
      if(!checkedSources.has(item.source_url)&&checkedSources.size<2)checkedSources.set(item.source_url,await checkBuyerSource(item,confirmedOffer,{hosts,reader:sourceReader,now}));
      item.sourceCheck=checkedSources.get(item.source_url)||{state:'check_limit_reached',originalChecked:false};
    }
    result.sourceChecks={status:'bounded_pass_finished',attempted:checkedSources.size,opened:[...checkedSources.values()].filter(x=>x.originalChecked).length,unchecked:result.opportunities.filter(item=>!item.sourceCheck?.originalChecked).length,max:2};
  };
  const hooks=()=>journal?{beforeRequest:step=>journal.reserve(step),afterRequest:(step,response)=>journal.record(step,response)}:{beforeRequest:async()=>{
    const claim=await db.rpc('claim_pull_search_requests',{p_requests:1});
    if(claim.error)throw new Error('Source budget verification is unavailable.');
    return claim.data===true;
  }};
  const checkpoint=async()=>{if(journal&&buyerSession?.result){try{await journal.checkpoint(buyerSession.result);}catch{
    buyerSession.result.remainingSourceRequests=0;buyerSession.result.coverage={...buyerSession.result.coverage,status:'partial',stopReason:'persistence_unavailable'};
  }}};
  Object.defineProperty(tools,'finalizeBuyerResearch',{value:async()=>{
    if(!journal||!buyerSession?.result||!journal.state||journal.state.state==='replay')return;
    await journal.checkpoint(buyerSession.result,{complete:true});
  }});
  if(allowResearch&&env.PULL_BUYER_RESEARCH_ENABLED==='true')tools.discover_buyer_routes=async args=>{
    if(buyerSession)return {error:'A buyer investigation already ran for this question.'};
    const search=searchConfiguration(env);
    if(!search)return {error:'Source research is not configured. No buyer research was performed.'};
    if(confirmedOffer&&confirmedOffer.ownerId!==ownerId)throw new Error('Confirmed offer owner does not match this account.');
    let input=confirmedOffer?bindResearchPlan(confirmedOffer,{hypotheses:args?.hypotheses,limit:args?.limit}).input:buyerResearchInput(args),id=randomUUID(),cap=Math.min(search.maxQueries,8);
    // Persist the validated plan without internal hypothesis IDs. Retries use
    // this original plan rather than a new, nondeterministic model proposal.
    input={...input,hypotheses:input.hypotheses.map(({id,...h})=>h)};
    if(env.PULL_RESEARCH_DURABLE_ENABLED==='true'){
      journal=createResearchJournal({db,secret:env.PULL_RESEARCH_SECRET,requestKey,goalFingerprint:confirmedOffer?JSON.stringify([goalFingerprint,confirmedOffer.id,confirmedOffer.version]):goalFingerprint});
      const saved=await journal.start(input,cap);
      if(saved.state==='busy')return {error:'This investigation is already running. Retry after its current attempt finishes; no source request was repeated.'};
      id=saved.id;cap=saved.maxRequests;input=saved.input;
      if(saved.snapshot?.result){
        const result=structuredClone(saved.snapshot.result);
        Object.defineProperty(result,'sourceKeys',{value:saved.snapshot.sourceKeys||result.opportunities.map(item=>item.source_url)});
        result.remainingSourceRequests=0;
        if(saved.state==='resumed')result.coverage={...result.coverage,status:'partial',stopReason:'interrupted_after_checkpoint'};
        result.requestsUsed=saved.requestsUsed;
        buyerSession={id,startedAt:Date.now(),cap,result,refined:true};return result;
      }
      if(saved.state==='replay')throw new Error('The saved investigation is unavailable.');
    }
    buyerSession={id,startedAt:Date.now(),cap,result:null,refined:false};
    const result=await discoverBuyerRoutes(input,{...search,maxQueries:Math.min(cap,4),timeBudgetMs:16000,transport,now,...hooks()});
    if(journal)result.requestsUsed=journal.state.requestsUsed;
    const stopped=['key_rejected','credits_exhausted','rate_limited','source_budget_reached','budget_unavailable','persistence_unavailable'].includes(result.coverage.stopReason);
    buyerSession.result=Object.assign(result,{run_id:id,remainingSourceRequests:stopped?0:cap-result.requestsUsed});
    await checkSources(buyerSession.result);
    await checkpoint();
    return buyerSession.result;
  };
  if(allowResearch&&env.PULL_BUYER_RESEARCH_ENABLED==='true')tools.refine_buyer_routes=async args=>{
    if(!buyerSession?.result||buyerSession.refined)return {error:'Run an initial buyer investigation before requesting one refinement.'};
    buyerSession.refined=true;
    const previous=buyerSession.result,remaining=previous.remainingSourceRequests;
    if(remaining<1||Date.now()-buyerSession.startedAt>=35000)return {error:'The original investigation allowance is exhausted. Existing results are kept.'};
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>k!=='hypotheses')||!Array.isArray(args.hypotheses))throw new Error('Supply only revised hypotheses.');
    const queries=new Set(previous.trace.map(t=>t.query.toLowerCase()));
    if(args.hypotheses.some(h=>!h||!Array.isArray(h.queries)||h.queries.some(q=>typeof q!=='string'||queries.has(q.trim().replace(/\s+/g,' ').toLowerCase()))))throw new Error('Refinement must investigate new queries.');
    const search=searchConfiguration(env);
    if(!search)return {error:'Source research is not configured. Existing results are kept.'};
    const next=await discoverBuyerRoutes({...previous.input,hypotheses:args.hypotheses},{...search,maxQueries:remaining,timeBudgetMs:Math.min(16000,35000-(Date.now()-buyerSession.startedAt)),hypothesisOffset:previous.input.hypotheses.length,transport,now,...hooks()});
    const merged=mergeBuyerResearch(previous,next);
    const result={...merged,run_id:buyerSession.id,remainingSourceRequests:0,refinement:'completed'};
    Object.defineProperty(result,'sourceKeys',{value:merged.sourceKeys||[...new Set([...(previous.sourceKeys||[]),...(next.sourceKeys||[])])]});
    if(journal)result.requestsUsed=journal.state.requestsUsed;
    buyerSession.result=result;await checkSources(result);await checkpoint();return result;
  };
  if(allowResearch)tools.search_prospects=async args=>{
    const input=discoveryInput(args),search=searchConfiguration(env);
    if(!search)return {error:'Source research is not configured. No search was performed.'};
    const result=await discoverPrivatePages(input,{...search,transport,beforeRequest:async()=>{
      const claim=await db.rpc('claim_pull_search_requests',{p_requests:1});
      if(claim.error)throw new Error('Source budget verification is unavailable.');
      return claim.data===true;
    }});
    return {type:'research',input,...result};
  };
  if(useWorkspace){
    tools.review_workspace=async args=>{
      if(Object.keys(args).length)throw new Error('Workspace review takes no arguments.');
      const saved=await db.from('pull_workspaces').select('payload,revision,updated_at').eq('user_id',ownerId).maybeSingle();
      if(saved.error)throw new Error('Saved workspace is unavailable.');
      if(!saved.data)return {error:'No workspace has been saved. Use the supplied brief only.'};
      const workspace=validateWorkspace(saved.data.payload,{now:now()}),reviewed=workspace.prospects.map(p=>qualify(p,workspace.rules,now()));
      const counts={total:reviewed.length,fit:0,review:0,excluded:0};for(const p of reviewed)counts[p.status]++;
      return {type:'workspace_review',revision:saved.data.revision,updated_at:saved.data.updated_at,identity:workspace.identity,offer:workspace.offer,persona:workspace.persona,rules:workspace.rules,counts,records:reviewed.slice(0,20).map(p=>({name:p.name,company:p.company,title:p.title,status:p.status,source_url:p.source_url,reasons:p.reasons||[],signal:p.signal,signal_date:p.signal_date})),notice:'Rule fit is not proof of purchase intent. Records are supplied/source-asserted, not independently verified.'};
    };
    tools.list_workflows=async args=>{
      if(Object.keys(args).length)throw new Error('Workflow listing takes no arguments.');
      const r=await db.from('pull_automations').select('id,name,kind,enabled,archived,destination').eq('user_id',ownerId).all();
      if(r.error)throw new Error('Workflows are unavailable.');
      return {type:'workflows',workflows:(r.data||[]).filter(w=>w.enabled&&!w.archived).slice(0,30),notice:'These workflows have not run. Open Automations to review and approve an action.'};
    };
  }
  return tools;
}

export function modelToolResult(result){
  if(result?.type==='buyer_research')return {type:result.type,run_id:result.run_id,input:result.input,offerReference:result.offerReference,sourceChecks:result.sourceChecks,provider:result.provider,requestsUsed:result.requestsUsed,opportunities:result.opportunities,summary:result.summary,coverage:result.coverage,trace:result.trace,notice:result.notice,remainingSourceRequests:result.remainingSourceRequests,refinement:result.refinement};
  if(result?.type!=='research')return result;
  return {type:'research',input:result.input,provider:result.provider,requestsUsed:result.requestsUsed,target:result.target,notice:result.notice,diagnostics:result.diagnostics,people:(result.people||[]).slice(0,50).map(p=>({name:p.name,title:p.title,company:p.company,industry:p.industry,location:p.location,source_url:p.source_url,source_excerpt:p.source_excerpt,supporting_sources:p.supporting_sources}))};
}
