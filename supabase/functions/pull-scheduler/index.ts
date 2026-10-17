import {createScheduleHandler} from './handler.js';
const url=Deno.env.get('SUPABASE_URL');let key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');try{key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||key;}catch{}
if(!url||!key){Deno.serve(()=>Response.json({error:'Scheduler unavailable.'},{status:503}));}else{
 const call=async(name:string,body:unknown)=>{const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key!,'Content-Type':'application/json',...(!key!.startsWith('sb_secret_')?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Schedule store unavailable');return response.json();};
 Deno.serve(createScheduleHandler({store:{claim:(hash:string)=>call('claim_pull_schedule',{p_ticket_hash:hash}),commit:(hash:string,revision:number,payload:unknown,counts:unknown)=>call('commit_pull_schedule',{p_ticket_hash:hash,p_revision:revision,p_payload:payload,p_counts:counts}),fail:(hash:string)=>call('fail_pull_schedule',{p_ticket_hash:hash})}}));
}
