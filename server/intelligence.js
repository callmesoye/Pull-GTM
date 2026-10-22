import {discoveryInput,searchConfiguration,discoverPrivatePages} from './discovery.js';
import {qualify} from '../dist/engine.js';
import {validateWorkspace} from '../dist/workspace.js';

const schema=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const string={type:'string'};
export const intelligenceToolDefinitions={
  search_prospects:{type:'function',function:{name:'search_prospects',description:'Research named private-sector prospects using the user’s explicit audience, industry, location and requested count. Ask for missing criteria first. Search costs source credits. Never infer buying intent from a listing.',strict:true,parameters:schema({audience:string,industry:string,location:string,source:{type:'string',description:'A requested platform/domain, or empty for all supported web sources.'},limit:{type:'integer',minimum:1,maximum:50}})}},
  review_workspace:{type:'function',function:{name:'review_workspace',description:'Read this authenticated user’s saved Pull workspace and assess audience fit and evidence gaps. Imported facts remain unverified. Does not change data.',strict:true,parameters:schema({})}},
  list_workflows:{type:'function',function:{name:'list_workflows',description:'List this user’s available workflows. The user must review and run one in Automations. This tool cannot execute or send anything.',strict:true,parameters:schema({})}}
};

export function createIntelligenceTools({db,ownerId,env,transport,useWorkspace=false,allowResearch=false,now=()=>new Date()}) {
  const tools={};
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
  if(result?.type!=='research')return result;
  return {type:'research',input:result.input,provider:result.provider,requestsUsed:result.requestsUsed,target:result.target,notice:result.notice,diagnostics:result.diagnostics,researchQuality:result.researchQuality,reviewQueue:(result.reviewQueue||[]).slice(0,12),people:(result.people||[]).slice(0,50).map(p=>({name:p.name,title:p.title,company:p.company,industry:p.industry,location:p.location,source_url:p.source_url,source_excerpt:p.source_excerpt,supporting_sources:p.supporting_sources}))};
}
