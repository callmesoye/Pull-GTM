/** The service credential is supplied by Supabase to this server runtime only. */
export function createAgentStore({url,key,transport=fetch}){
  const base=new URL(url);if(base.protocol!=='https:'||!key)throw new Error('Server configuration unavailable');
  async function call(path,{method='GET',body}={}){
    const headers={apikey:key,'Content-Type':'application/json'};
    // New secret keys authenticate on apikey; legacy service JWTs also use Bearer.
    if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
    const response=await transport(base.origin+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Private store unavailable');
    return response.json();
  }
  return {
    authenticate:tokenHash=>call('rpc/authenticate_pull_agent',{method:'POST',body:{p_token_hash:tokenHash}}),
    loadWorkspace:async owner=>{
      const query=new URLSearchParams({select:'user_id,payload,revision,updated_at',user_id:'eq.'+owner,limit:'1'});
      const rows=await call('pull_workspaces?'+query);return rows[0]??null;
    },
    commitDraft:(tokenHash,args)=>call('rpc/commit_pull_agent_draft',{method:'POST',body:{p_token_hash:tokenHash,p_revision:args.expectedRevision,p_prospect_id:args.prospectId,p_subject:args.subject,p_body:args.body,p_channel:args.channel}}),
    claimQuestion:tokenHash=>call('rpc/claim_pull_agent_question',{method:'POST',body:{p_token_hash:tokenHash}}),
    answerQuestion:(tokenHash,id,answer)=>call('rpc/answer_pull_agent_question',{method:'POST',body:{p_token_hash:tokenHash,p_question_id:id,p_answer:answer}})
  };
}
