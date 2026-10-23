import {createHash} from 'node:crypto';

const digest=value=>createHash('sha256').update(value).digest('hex');
export function researchCapability(secret){
  if(typeof secret!=='string'||secret.length<32)throw new Error('Durable research authorization is unavailable.');
  return digest('pull-research-journal-v1\0'+secret);
}

// Only sanitized evidence/results belong here. No model can call these RPCs
// directly, and the capability never appears in a source request or response.
export function createResearchJournal({db,secret,requestKey,goalFingerprint}){
  const capability=researchCapability(secret);
  if(typeof requestKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey))throw new Error('A stable research request ID is required.');
  if(typeof goalFingerprint!=='string'||!goalFingerprint)throw new Error('Research goal binding is required.');
  let run=null;
  const rpc=async(name,args)=>{
    let response;try{response=await db.rpc(name,{...args,p_capability:capability},{signal:AbortSignal.timeout(3000)});}catch{throw new Error('Research persistence is unavailable.');}
    if(response.error||!response.data||typeof response.data!=='object')throw new Error('Research persistence is unavailable. Existing evidence is kept; no unreserved search may run.');
    return response.data;
  };
  const accept=data=>{
    if(Number.isInteger(data.requestsUsed))run.requestsUsed=data.requestsUsed;
    if(Number.isSafeInteger(data.revision))run.revision=data.revision;
    return data;
  };
  const stepKey=(query,provider)=>digest(JSON.stringify([provider,query.trim().replace(/\s+/g,' ').toLowerCase()]));
  return {
    async start(input,maxRequests){
      const data=await rpc('start_pull_research',{p_key:requestKey,p_goal:digest(goalFingerprint),p_input:input,p_max:maxRequests});
      if(!['created','resumed','replay','busy'].includes(data.state)||!data.id||!Number.isInteger(data.requestsUsed)||!Number.isSafeInteger(data.revision))throw new Error('Invalid research persistence response.');
      run=data;return {...data};
    },
    get state(){return run?{id:run.id,state:run.state,requestsUsed:run.requestsUsed,maxRequests:run.maxRequests,revision:run.revision}:null;},
    async reserve({query,provider}){
      if(!run?.lease)throw new Error('Research lease is unavailable.');
      return accept(await rpc('reserve_pull_research_step',{p_run:run.id,p_lease:run.lease,p_step:stepKey(query,provider)}));
    },
    async record({query,provider},response){
      if(!run?.lease)throw new Error('Research lease is unavailable.');
      accept(await rpc('finish_pull_research_step',{p_run:run.id,p_lease:run.lease,p_step:stepKey(query,provider),p_response:response}));
    },
    async checkpoint(result,{complete=false}={}){
      if(!run?.lease)throw new Error('Research lease is unavailable.');
      accept(await rpc('checkpoint_pull_research',{p_run:run.id,p_lease:run.lease,p_revision:run.revision,p_snapshot:{result,sourceKeys:result.sourceKeys||result.opportunities?.map(item=>item.source_url)||[]},p_complete:complete}));
      if(complete)run.lease=null;
    }
  };
}
