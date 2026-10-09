const TOKEN=/^pull_agent_[A-Za-z0-9_-]{43}$/;
const ALLOWED_TOOLS=new Set(['get_workspace_summary','list_reviewed_prospects','propose_draft']);

/** Verify a fixed backend endpoint. Never accept a user-supplied destination. */
export async function testAgentConnection({endpoint,token,transport=fetch}) {
  if(!TOKEN.test(token||''))return {status:400,error:'Use the access token created by Pull.'};
  const rpc=async(method,id,params)=>{
    const response=await transport(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:'Bearer '+token},body:JSON.stringify({jsonrpc:'2.0',id,method,...(params?{params}:{})})});
    if(!response.ok)throw Object.assign(new Error('MCP request failed'),{status:response.status});
    const reader=response.body.getReader();let bytes=0,parts=[];
    try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>65536){await reader.cancel();throw new Error('Oversized response');}parts.push(value);}}finally{reader.releaseLock();}
    const data=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(data.jsonrpc!=='2.0'||data.id!==id||data.error||!data.result)throw new Error('Invalid MCP response');
    return data.result;
  };
  try {
    const initialized=await rpc('initialize',1,{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'Pull connection check',version:'1.0.0'}});
    if(!['2025-06-18','2025-03-26'].includes(initialized.protocolVersion)||!initialized.capabilities?.tools)throw new Error('Unsupported server');
    const listed=await rpc('tools/list',2);
    if(!Array.isArray(listed.tools)||!listed.tools.length||listed.tools.some(t=>!ALLOWED_TOOLS.has(t.name)))throw new Error('Unexpected tools');
    return {status:200,reachable:true,tools:listed.tools.map(t=>t.name),message:'Pull’s server accepted this token. Finish adding it in your agent to complete the connection.'};
  }catch(error){
    if([401,403].includes(error.status))return {status:401,error:'This token was rejected. Create a new connection or check whether access was revoked.'};
    if(error.status===429)return {status:429,error:'The agent request limit was reached. Try again later.'};
    return {status:503,error:'Pull could not verify the agent server. Check the deployed MCP function, then retry.'};
  }
}
