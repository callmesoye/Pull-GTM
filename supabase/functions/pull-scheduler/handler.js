import {applyAutomation} from './workflow-engine.js';
export function createScheduleHandler({store,crypto=globalThis.crypto,now=()=>new Date()}){
 return async request=>{
  const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply(405,{error:'Use POST.'});
  const nonce=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!nonce)return reply(401,{error:'Schedule authorization required.'});
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(nonce)),hash=[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
  try{const task=await store.claim(hash);if(!task||task.error)return reply(401,{error:'Schedule ticket unavailable.'});
   const result=applyAutomation(task.workflow,task.workspace,now());await store.commit(hash,task.revision,result.payload,{...result.counts,data_origin:result.payload.mode});return reply(200,{completed:true});
  }catch{try{await store.fail(hash);}catch{}return reply(409,{error:'Workflow could not commit. Existing workspace is kept.'});}
 };
}
