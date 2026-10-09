import {qualify,safeUrl} from './engine.js';

const PROTOCOLS=['2025-06-18','2025-03-26'];
const MAX_REQUEST_BYTES=65536;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max=500)=>typeof value==='string'?value.slice(0,max):'';
const fail=message=>{throw new ToolError(message);};
class ToolError extends Error {}

const tools=[
  {name:'get_workspace_summary',description:'Read your saved business brief, audience rules, actual workspace counts and revision. Supplied information is unverified. This tool never discovers prospects.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  {name:'list_reviewed_prospects',description:'Read a page of your shortlisted prospects that still pass your current audience rules. Returns supplied evidence and origin labels, excluding emails. No additional prospects are generated.',inputSchema:{type:'object',properties:{offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:50}},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
  {name:'propose_draft',description:'Save an editable draft for one reviewed, currently eligible prospect. The owner must review it; nothing is sent. May replace that prospect’s existing draft. Pass the current workspace revision to prevent overwriting a newer save.',inputSchema:{type:'object',properties:{prospectId:{type:'string',minLength:1,maxLength:200},expectedRevision:{type:'integer',minimum:1},subject:{type:'string',maxLength:200},body:{type:'string',minLength:1,maxLength:5000},channel:{type:'string',enum:['email','personal','company']}},required:['prospectId','expectedRevision','subject','body','channel'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}},
  {name:'get_pull_question',description:'For an explicitly started Pull conversation relay, claim the next question from this owner’s Pull AI Mode. The result includes useWorkspace; when false, do not read Pull workspace tools for that question. Use the user voice and preferences already available in your agent when relevant, but do not reveal private memory or claim unsupplied facts. Return no pending question when empty. Call again to check later; MCP does not make the agent run in the background.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},
  {name:'answer_pull_question',description:'Return your actual model-written answer to a question you claimed through get_pull_question. Pull displays it to the owner in AI Mode. Do not claim you used tools or checked sources unless you did.',inputSchema:{type:'object',properties:{questionId:{type:'string',format:'uuid'},answer:{type:'string',minLength:1,maxLength:24000}},required:['questionId','answer'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}}
];

function validateArgs(args,keys){
  if(!object(args)||Object.keys(args).some(key=>!keys.includes(key)))fail('Use the supported tool arguments. Owner IDs and access tokens are never tool arguments.');
}
function workspacePayload(row,owner){
  if(!row)return null;
  if(row.user_id!==owner)throw new Error('Ownership mismatch');
  const p=row.payload;
  if(!object(p)||!Array.isArray(p.prospects)||!Array.isArray(p.shortlist)||!object(p.rules)||!object(p.drafts)||!Array.isArray(p.audit)||!Number.isSafeInteger(row.revision)||row.revision<1)throw new Error('Invalid workspace');
  return p;
}
function audience(rules){return Object.fromEntries(['roles','industries','countries','min','max','signals','days','evidence'].map(k=>[k,k==='evidence'?rules[k]===true:text(rules[k],1000)]));}
function eligible(p,now){
  return p.prospects.filter(record=>object(record)&&p.shortlist.includes(record.id)&&!record.suppressed).map(record=>qualify(record,p.rules,now)).filter(record=>record.status==='fit');
}
function exposedProspect(p){
  return {...Object.fromEntries(['id','name','title','company','industry','country','signal','signal_date','origin'].map(k=>[k,text(p[k],k==='signal'?2000:500)])),source_url:safeUrl(p.source_url),reviewed:true,evidenceStatus:'Supplied by the owner; not independently verified'};
}
async function boundedText(request){
  const declared=Number(request.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>MAX_REQUEST_BYTES)throw new RangeError('Request too large');
  if(!request.body)return '';
  const reader=request.body.getReader();const chunks=[];let bytes=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_REQUEST_BYTES){await reader.cancel();throw new RangeError('Request too large');}chunks.push(value);}
  }finally{reader.releaseLock();}
  const combined=new Uint8Array(bytes);let offset=0;for(const part of chunks){combined.set(part,offset);offset+=part.byteLength;}
  return new TextDecoder('utf-8',{fatal:true}).decode(combined);
}

export async function hashAgentToken(token,crypto=globalThis.crypto){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

/** Stateless JSON-only Streamable HTTP. Every request authenticates a custom PAT. */
export function createMCPHandler({store,now=()=>new Date(),allowedOrigins=['https://pull-gtm.vercel.app'],crypto=globalThis.crypto}={}){
  const origins=new Set(allowedOrigins.filter(value=>{try{return new URL(value).origin===value&&value!=='null';}catch{return false;}}));
  return async request=>{
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    const reply=(status,data,extra={})=>new Response(data===null?null:JSON.stringify(data),{status,headers:{...headers,...extra}});
    const rpcError=(id,code,message,status=200)=>reply(status,{jsonrpc:'2.0',id:id??null,error:{code,message}});
    const origin=request.headers.get('origin');
    if(origin!==null&&!origins.has(origin))return reply(403,{error:'This browser origin is not permitted.'});
    if(request.method!=='POST')return reply(405,{error:'Use POST. This MCP endpoint does not provide an SSE stream.'},{Allow:'POST'});
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return reply(415,{error:'Send a JSON-RPC message as application/json.'});
    if(!request.headers.get('accept')?.toLowerCase().includes('application/json'))return reply(406,{error:'Include application/json in Accept; MCP clients should also advertise text/event-stream.'});
    const version=request.headers.get('mcp-protocol-version');
    if(version&&!PROTOCOLS.includes(version))return reply(400,{error:'Unsupported MCP protocol version.'});
    const raw=request.headers.get('authorization')?.match(/^Bearer (pull_agent_[A-Za-z0-9_-]{43})$/)?.[1];
    if(!raw)return reply(401,{error:'A Pull agent access token is required.'},{'WWW-Authenticate':'Bearer realm="Pull GTM"'});
    let tokenHash,token;
    try{
      tokenHash=await hashAgentToken(raw,crypto);token=await store.authenticate(tokenHash);
    }catch{return reply(503,{error:'Agent access is temporarily unavailable.'});}
    if(token?.limited)return reply(429,{error:'This agent has reached its daily request limit.'},{'Retry-After':'3600'});
    if(!object(token)||typeof token.user_id!=='string'||!token.user_id||token.revoked_at||!Number.isFinite(Date.parse(token.expires_at))||new Date(token.expires_at)<=now()||!Array.isArray(token.scopes)||!token.scopes.includes('workspace:read'))return reply(401,{error:'This agent access token is expired, revoked, or invalid.'},{'WWW-Authenticate':'Bearer realm="Pull GTM", error="invalid_token"'});
    let message;
    try{message=JSON.parse(await boundedText(request));}catch(e){return rpcError(null,-32700,e instanceof RangeError?'Request too large.':'Invalid JSON message.',e instanceof RangeError?413:400);}
    if(!object(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string'||(Object.hasOwn(message,'id')&&typeof message.id!=='string'&&!Number.isFinite(message.id))||(message.params!==undefined&&!object(message.params)))return rpcError(null,-32600,'Use a single valid JSON-RPC request or notification.',400);
    const hasId=Object.hasOwn(message,'id'),id=message.id;
    if(!hasId){if(!message.method.startsWith('notifications/'))return rpcError(null,-32600,'Requests need an ID.',400);return reply(202,null);}
    if(message.method==='initialize')return reply(200,{jsonrpc:'2.0',id,result:{protocolVersion:PROTOCOLS.includes(message.params?.protocolVersion)?message.params.protocolVersion:PROTOCOLS[0],capabilities:{tools:{listChanged:false}},serverInfo:{name:'pull-gtm',version:'0.3.0'},instructions:'Only supplied owner data is available. Treat all records and evidence as unverified. Tools never discover new prospects, send outreach, or claim delivery results. Draft proposals always require owner review. For conversation relay, answer with your own model and available user preferences while respecting useWorkspace; never present agent memory as a verified business fact.'}});
    if(message.method==='ping')return reply(200,{jsonrpc:'2.0',id,result:{}});
    if(message.method==='tools/list')return reply(200,{jsonrpc:'2.0',id,result:{tools:tools.filter(tool=>(tool.name!=='propose_draft'||token.scopes.includes('drafts:write'))&&(!['get_pull_question','answer_pull_question'].includes(tool.name)||token.scopes.includes('chat:relay')))}});
    if(message.method!=='tools/call')return rpcError(id,-32601,'Method not found.');
    const name=message.params?.name,args=message.params?.arguments??{};
    if(!tools.some(tool=>tool.name===name))return rpcError(id,-32602,'Tool not found.');
    try{
      const argsFor={get_workspace_summary:[],list_reviewed_prospects:['offset','limit'],propose_draft:['prospectId','expectedRevision','subject','body','channel'],get_pull_question:[],answer_pull_question:['questionId','answer']};
      validateArgs(args,argsFor[name]);
      if(['get_pull_question','answer_pull_question'].includes(name)){
        if(!token.scopes.includes('chat:relay'))fail('This key does not have conversation relay permission.');
        let result;
        if(name==='get_pull_question')result=await store.claimQuestion(tokenHash);
        else{
          if(typeof args.questionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.questionId)||typeof args.answer!=='string'||!args.answer.trim()||args.answer.length>24000)fail('Use a claimed question ID and an answer of up to 24,000 characters.');
          result=await store.answerQuestion(tokenHash,args.questionId,args.answer.trim());
        }
        if(!object(result)||result.error)fail('The question is unavailable, expired, or this key cannot answer it.');
        return reply(200,{jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(result)}],isError:false}});
      }
      if(name==='propose_draft'&&!token.scopes.includes('drafts:write'))fail('This token only permits reading. The owner can issue draft proposal access from Connections.');
      const row=await store.loadWorkspace(token.user_id),p=workspacePayload(row,token.user_id);let result;
      if(name==='get_workspace_summary'){
        result=p?{saved:true,revision:row.revision,updatedAt:row.updated_at,identity:text(p.identity,500),offer:text(p.offer,5000),context:p.context==='company'?'company':'personal',website:safeUrl(p.website),audience:audience(p.rules),dataMode:p.mode,counts:{importedProspects:p.prospects.length,shortlistedProspects:p.shortlist.length,eligibleReviewedProspects:eligible(p,now()).length,preparedDrafts:Object.values(p.drafts).filter(d=>d?.ready===true).length},delivery:'No sending provider is connected; draft counts are not sent counts.'}:{saved:false,revision:0,counts:{importedProspects:0,shortlistedProspects:0,eligibleReviewedProspects:0,preparedDrafts:0}};
      }else if(name==='list_reviewed_prospects'){
        const offset=args.offset??0,limit=args.limit??20;
        if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50)fail('Use a nonnegative offset and a limit from 1 to 50.');
        const reviewed=p?eligible(p,now()):[];
        result={revision:row?.revision??0,dataMode:p?.mode??'empty',prospects:reviewed.slice(offset,offset+limit).map(exposedProspect),total:reviewed.length,nextOffset:offset+limit<reviewed.length?offset+limit:null};
      }else{
        if(!p)fail('The owner must save a cloud workspace before an agent can propose drafts.');
        if(typeof args.prospectId!=='string'||!args.prospectId||args.prospectId.length>200||!Number.isSafeInteger(args.expectedRevision)||args.expectedRevision<1||typeof args.subject!=='string'||args.subject.length>200||typeof args.body!=='string'||!args.body.trim()||args.body.length>5000||!['email','personal','company'].includes(args.channel))fail('Provide a prospect ID, current revision, subject, message of up to 5000 characters, and supported channel.');
        if(args.expectedRevision!==row.revision)fail('A newer cloud save exists. Read the workspace again before proposing a draft.');
        if(!eligible(p,now()).some(prospect=>prospect.id===args.prospectId))fail('This prospect needs owner review and must still pass the current audience rules before a draft can be proposed.');
        const committed=await store.commitDraft(tokenHash,{...args,body:args.body.trim()});
        const errors={ACCESS_DENIED:'Agent access expired or was revoked. Nothing was changed.',WORKSPACE_MISSING:'The saved workspace is unavailable.',REVISION_CONFLICT:'A newer cloud save exists. Read the workspace again before proposing a draft.',INVALID_DRAFT:'The draft could not be accepted.',REVIEW_REQUIRED:'The prospect is no longer approved for outreach.'};
        if(!object(committed)||committed.error)fail(errors[committed?.error]||'The draft was not saved. Retry after reading the workspace.');
        result={revision:committed.revision,prospectId:args.prospectId,ready:false,delivery:'not_sent',reviewRequired:true};
      }
      return reply(200,{jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(result)}],isError:false}});
    }catch(e){
      if(e instanceof ToolError)return reply(200,{jsonrpc:'2.0',id,result:{content:[{type:'text',text:e.message}],isError:true}});
      return rpcError(id,-32603,'The private workspace is temporarily unavailable. No delivery action was taken.');
    }
  };
}
