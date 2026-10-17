import {applyAutomation} from '../dist/workflow-engine.js';
export {applyAutomation} from '../dist/workflow-engine.js';
import {configuration} from './config.js';
import {createClient} from './supabase-rest.js';
import {qualify,draftFor} from '../dist/engine.js';
import {validateWorkspace} from '../dist/workspace.js';
import {destinationIds} from '../dist/platforms.js';

const KINDS = ['audience_review','draft_suggestions'];
const TRIGGERS = ['manual','on_import'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKFLOW_FIELDS = 'id,name,kind,trigger,destination,enabled,archived,created_at,updated_at';
const RUN_FIELDS = 'id,automation_id,name,kind,status,counts,base_revision,result_revision,created_at';
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const validSession = s => object(s) && ['access_token','refresh_token'].every(k=>typeof s[k]==='string'&&s[k]&&encodeURIComponent(s[k]).length<=3800) && Number.isSafeInteger(s.expires_in) && s.expires_in>0;
const unavailable = () => Object.assign(new Error('Automations are temporarily unavailable. Your saved workspace is kept.'),{status:503});

function definition(value,partial=false) {
  if (!object(value)) throw new Error('Choose a valid workflow.');
  const fields = ['name','kind','trigger','destination','enabled',...(partial?['archived']:[])];
  if (Object.keys(value).some(k=>!fields.includes(k))) throw new Error('Unsupported workflow setting.');
  if ((!partial || Object.hasOwn(value,'name')) && (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 100)) throw new Error('Give the workflow a name of 1 to 100 characters.');
  if ((!partial || Object.hasOwn(value,'kind')) && !KINDS.includes(value.kind)) throw new Error('Choose audience review or draft suggestions.');
  if ((!partial || Object.hasOwn(value,'trigger')) && !TRIGGERS.includes(value.trigger)) throw new Error('Choose a manual or after-import trigger.');
  if (Object.hasOwn(value,'destination') && !destinationIds.includes(value.destination)) throw new Error('Choose a supported destination.');
  if (Object.hasOwn(value,'enabled') && typeof value.enabled !== 'boolean') throw new Error('Choose whether the workflow is enabled.');
  if (Object.hasOwn(value,'archived') && typeof value.archived !== 'boolean') throw new Error('Choose whether the workflow is archived.');
  const out = {...value}; if (out.name) out.name=out.name.trim();
  if (!partial && !Object.hasOwn(out,'enabled')) out.enabled=true;
  if (!partial && !Object.hasOwn(out,'destination')) out.destination='none';
  if (out.archived) out.enabled=false;
  return out;
}

function validWorkflow(row) {
  return object(row) && UUID.test(row.id) && typeof row.name==='string' && row.name.length<=100 && KINDS.includes(row.kind) && TRIGGERS.includes(row.trigger) && destinationIds.includes(row.destination??'none') && typeof row.enabled==='boolean' && typeof row.archived==='boolean' && typeof row.updated_at==='string' && Number.isFinite(Date.parse(row.updated_at));
}


async function bodyJSON(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw Object.assign(new Error('Send JSON data.'),{status:415});
  if (!request.body) throw Object.assign(new Error('Invalid automation request.'),{status:400});
  const reader=request.body.getReader(),chunks=[];let bytes=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();throw Object.assign(new Error('Automation request is too large.'),{status:413});}chunks.push(value);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!object(body))throw new Error();return body;
  } catch(error){if(error.status)throw error;throw Object.assign(new Error('Invalid automation request.'),{status:400});}finally{reader.releaseLock();}
}

function cookies(request) {
  const out={};for(const part of (request.headers.get('cookie')||'').split(';')){const i=part.indexOf('=');if(i<0)continue;try{out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1));}catch{}}
  return out;
}

export function createAutomationsBackend({env=process.env,clientFactory=createClient,now=()=>new Date(),transport=fetch}={}) {
  const config=configuration(env);
  return async function automations(request) {
    const url=new URL(request.url),secure=url.protocol==='https:',prefix=secure?'__Host-pull-':'pull-',outCookies=[];
    const reply=(status,data)=>{const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});for(const c of outCookies)headers.append('Set-Cookie',c);return new Response(JSON.stringify(data),{status,headers});};
    const setCookie=(name,value,age)=>outCookies.push(`${prefix}${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`);
    if(!['GET','POST'].includes(request.method))return reply(405,{error:'Method not allowed.'});
    if(request.method==='POST'&&(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site'))return reply(403,{error:'Open Pull GTM directly to manage automations.'});
    if(!config)return request.method==='GET'?reply(200,{configured:false,workflows:[],runs:[]}):reply(503,{error:'Cloud automations are not configured yet.'});
    const makeClient=token=>clientFactory(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:token?{Authorization:'Bearer '+token}:{},fetch:(target,options={})=>transport(target,{...options,signal:options.signal||AbortSignal.timeout(15000),redirect:'error'})}});
    try {
      let body=request.method==='POST'?await bodyJSON(request):null;
      const saved=cookies(request),base=makeClient();let access=saved[prefix+'access'],refresh=saved[prefix+'refresh'],renewedSession=null;
      let verified=access?await base.auth.getUser(access):{data:{user:null},error:{status:401}};
      if(verified.error&&[400,401,403].includes(verified.error.status)&&refresh){
        const renewed=await base.auth.refreshSession({refresh_token:refresh});
        if(renewed.error?.status===429||renewed.error?.status>=500)throw unavailable();
        if(!renewed.error&&!validSession(renewed.data?.session))throw unavailable();
        if(renewed.error||!renewed.data.session){setCookie('access','',0);setCookie('refresh','',0);return reply(401,{error:'Sign in to manage your automations.'});}
        renewedSession=renewed.data.session;access=renewedSession.access_token;verified=await base.auth.getUser(access);
      }
      if(verified.error?.status===429||verified.error?.status>=500)throw unavailable();
      const user=verified.data.user;
      if(verified.error||!user||typeof user.id!=='string'||!user.id||user.is_anonymous)return reply(401,{error:'Sign in to manage your automations.'});
      if(request.headers.get('x-pull-account')!==user.id)return reply(409,{code:'ACCOUNT_CHANGED',error:'Your account changed. Open your cloud workspace again.'});
      if(renewedSession){if(renewedSession.user?.id&&renewedSession.user.id!==user.id)throw unavailable();setCookie('access',access,Math.max(60,Math.min(renewedSession.expires_in,2592000)));setCookie('refresh',renewedSession.refresh_token,60*60*24*30);}
      const db=makeClient(access),list=async()=>{
        const workflows=await db.from('pull_automations').select(WORKFLOW_FIELDS).eq('user_id',user.id).eq('archived',false).order('created_at',{ascending:false}).all();
        const runs=await db.from('pull_automation_runs').select(RUN_FIELDS).eq('user_id',user.id).order('created_at',{ascending:false}).limit(20).all();
        const schedules=await db.from('pull_workflow_schedules').select('id,workflow_id,interval_seconds,enabled,next_run_at,last_run_at,last_status,last_revision').eq('user_id',user.id).all();
        const schedulesMissing=['42P01','PGRST205'].includes(schedules.error?.code);
        if(workflows.error||runs.error||(schedules.error&&!schedulesMissing)||!workflows.data.every(validWorkflow))throw unavailable();
        return {configured:true,workflows:workflows.data,runs:runs.data,schedules:schedules.data||[],schedulingAvailable:!schedulesMissing};
      };
      if(request.method==='GET')return reply(200,await list());
      if(['schedule','update_schedule'].includes(body.action)){
        if(body.action==='schedule'){
          if(Object.keys(body).some(k=>!['action','workflowId','intervalSeconds'].includes(k))||!UUID.test(body.workflowId||'')||!Number.isInteger(body.intervalSeconds)||body.intervalSeconds<3600||body.intervalSeconds>604800)return reply(400,{error:'Choose a workflow and a repeat interval between one hour and seven days.'});
          const workflow=await db.from('pull_automations').select(WORKFLOW_FIELDS).eq('user_id',user.id).eq('id',body.workflowId).maybeSingle();if(workflow.error)throw unavailable();if(!workflow.data||!workflow.data.enabled||workflow.data.archived)return reply(409,{error:'Enable this workflow before scheduling it.'});
          const saved=await db.from('pull_workspaces').select('revision').eq('user_id',user.id).maybeSingle();if(saved.error)throw unavailable();if(!saved.data)return reply(409,{error:'Save a cloud workspace before scheduling it.'});
          const result=await db.from('pull_workflow_schedules').insert({user_id:user.id,workflow_id:body.workflowId,interval_seconds:body.intervalSeconds,next_run_at:new Date(now().getTime()+body.intervalSeconds*1000).toISOString(),enabled:true}).select('id').single();if(result.error?.code==='23505')return reply(409,{error:'This workflow already has a schedule. Use its pause or resume control.'});if(result.error?.code==='54000')return reply(400,{error:'Pause a schedule before enabling another. Up to ten may be active.'});if(result.error)throw unavailable();return reply(201,{schedule:result.data});
        }
        if(Object.keys(body).some(k=>!['action','id','enabled'].includes(k))||!UUID.test(body.id||'')||typeof body.enabled!=='boolean')return reply(400,{error:'Choose a schedule to pause or resume.'});
        const result=await db.from('pull_workflow_schedules').update({enabled:body.enabled}).eq('user_id',user.id).eq('id',body.id).select('id').maybeSingle();if(result.error)throw unavailable();return result.data?reply(200,{schedule:result.data}):reply(404,{error:'Schedule unavailable.'});
      }
      let proposalQuestion=null,proposalSnapshot=null;
      if(body.action==='run_proposal'){
        if(Object.keys(body).some(k=>!['action','questionId'].includes(k))||!UUID.test(body.questionId||''))return reply(400,{error:'Choose an agent workflow proposal.'});
        const proposal=await db.from('pull_agent_chat_requests').select('id,workflow_proposal,workflow_result,expires_at').eq('user_id',user.id).eq('id',body.questionId).maybeSingle();
        if(proposal.error)throw unavailable();
        if(!proposal.data)return reply(404,{error:'This proposal is unavailable.'});
        if(proposal.data.workflow_result)return reply(200,{alreadyExecuted:true,workspace:{revision:proposal.data.workflow_result.revision,updated_at:proposal.data.workflow_result.updated_at},runs:proposal.data.workflow_result.runs,results:[]});
        const proposed=proposal.data.workflow_proposal;
        if(!object(proposed)||!UUID.test(proposed.workflowId||'')||!Number.isSafeInteger(proposed.revision)||new Date(proposal.data.expires_at)<=now())return reply(409,{error:'This proposal expired. Ask your agent for a new one.'});
        proposalQuestion=body.questionId;proposalSnapshot=proposed;
        body={action:'run',id:proposed.workflowId,revision:proposed.revision};
      }
      if(!['create','update','run','on_import'].includes(body.action))return reply(400,{error:'Choose a supported automation action.'});
      if(body.action==='create'){
        const {action,...values}=body;let definitionRow;try{definitionRow=definition(values);}catch(error){return reply(400,{error:error.message});}
        const result=await db.from('pull_automations').insert({...definitionRow,user_id:user.id}).select(WORKFLOW_FIELDS).single();
        if(result.error||!validWorkflow(result.data))throw unavailable();
        return reply(201,{workflow:result.data});
      }
      if(body.action==='update'){
        const {action,id,...values}=body;if(!UUID.test(id||''))return reply(400,{error:'Choose a valid workflow.'});
        let changes;try{changes=definition(values,true);if(!Object.keys(changes).length)throw new Error('Choose a setting to update.');}catch(error){return reply(400,{error:error.message});}
        const result=await db.from('pull_automations').update(changes).eq('user_id',user.id).eq('id',id).select(WORKFLOW_FIELDS).maybeSingle();
        if(result.error)throw unavailable();if(!result.data)return reply(404,{error:'This workflow is unavailable.'});if(!validWorkflow(result.data))throw unavailable();return reply(200,{workflow:result.data});
      }
      if(Object.keys(body).some(k=>!['action','id','revision'].includes(k))||(body.action==='on_import'&&Object.hasOwn(body,'id')))return reply(400,{error:'Run the workflow against your saved workspace.'});
      if(!Number.isSafeInteger(body.revision)||body.revision<1||body.revision>=Number.MAX_SAFE_INTEGER)return reply(400,{error:'Save your cloud workspace before running an automation.'});
      let workflows;
      if(body.action==='run'){
        if(!UUID.test(body.id||''))return reply(400,{error:'Choose a valid workflow.'});
        const result=await db.from('pull_automations').select(WORKFLOW_FIELDS).eq('user_id',user.id).eq('id',body.id).maybeSingle();if(result.error)throw unavailable();if(!result.data)return reply(404,{error:'This workflow is unavailable.'});workflows=[result.data];
      }else{
        const result=await db.from('pull_automations').select(WORKFLOW_FIELDS).eq('user_id',user.id).eq('archived',false).eq('enabled',true).eq('trigger','on_import').order('created_at').all();if(result.error)throw unavailable();workflows=result.data;
      }
      if(proposalSnapshot&&workflows.some(w=>w.updated_at!==proposalSnapshot.workflowUpdatedAt&&Date.parse(w.updated_at)!==Date.parse(proposalSnapshot.workflowUpdatedAt)))return reply(409,{error:'The workflow changed. Ask your agent for a new proposal.'});
      if(!workflows.every(validWorkflow))throw unavailable();
      if(workflows.some(w=>!w.enabled||w.archived))return reply(409,{error:'Enable this workflow before running it.'});
      if(!workflows.length)return reply(200,{results:[],workspace:null,runs:[]});
      if(workflows.length>100)return reply(400,{error:'Choose up to 100 enabled after-import workflows.'});
      const stored=await db.from('pull_workspaces').select('payload,revision,updated_at').eq('user_id',user.id).maybeSingle();if(stored.error)throw unavailable();if(!stored.data)return reply(409,{error:'Save a cloud workspace before running this workflow.'});
      if(stored.data.revision!==body.revision)return reply(409,{code:'WORKSPACE_CHANGED',error:'A newer cloud workspace exists. Load it before running this workflow.'});
      let payload=validateWorkspace(stored.data.payload);const results=[],runInputs=[],at=now();
      if(body.action==='on_import'&&payload.mode!=='import')return reply(400,{error:'Save an imported prospect list before running after-import workflows.'});
      for(const workflow of workflows){const applied=applyAutomation(workflow,payload,at);payload=applied.payload;const counts={...applied.counts,data_origin:payload.mode};results.push({workflow_id:workflow.id,name:workflow.name,kind:workflow.kind,counts});runInputs.push({id:workflow.id,updated_at:workflow.updated_at,counts});}
      const committed=await db.rpc(proposalQuestion?'execute_pull_agent_workflow':'pull_apply_automations',{...(proposalQuestion?{p_question_id:proposalQuestion}:{}),p_revision:body.revision,p_payload:payload,p_runs:runInputs});
      if(committed.error?.code==='P0001')return reply(409,{code:'WORKSPACE_CHANGED',error:'Your workspace or workflow changed. Reload before running it again.'});
      if(committed.error||!object(committed.data)||committed.data.revision!==body.revision+1||!Array.isArray(committed.data.runs)||typeof committed.data.updated_at!=='string')throw unavailable();
      return reply(200,{results,workspace:{revision:committed.data.revision,updated_at:committed.data.updated_at},runs:committed.data.runs});
    }catch(error){return reply(error.status||503,{error:error.status?error.message:'Automations are temporarily unavailable. Your saved workspace is kept.'});}
  };
}
