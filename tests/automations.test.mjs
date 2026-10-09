import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomationsBackend,applyAutomation} from '../server/automations.js';
import {createClient} from '../server/supabase-rest.js';
import {renderAutomationView} from '../dist/automations.js';

const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WA='11111111-1111-4111-8111-111111111111',WB='22222222-2222-4222-8222-222222222222',WD='33333333-3333-4333-8333-333333333333';
const at='2026-10-08T18:00:00.000Z';
const workflow=(id=WA,owner=A,kind='audience_review',trigger='manual')=>({id,user_id:owner,name:'Useful workflow',kind,trigger,enabled:true,archived:false,created_at:at,updated_at:at});
const workspace=()=>({version:1,prospects:[
  {id:'p1',name:'Ada',title:'Founder',company:'Example',industry:'SaaS',country:'Nigeria',signal:'Hiring',signal_date:'2026-10-05',source_url:'https://example.test/hiring',suppressed:false},
  {id:'p2',name:'Ben',title:'Founder',company:'Example two',industry:'SaaS',signal:'',source_url:'',signal_date:''},
  {id:'p3',name:'Chao',title:'Founder',company:'Example three',industry:'SaaS',signal:'Hiring',signal_date:'2026-10-05',source_url:'https://example.test/hiring',suppressed:true},
],shortlist:['p1','p2','p3'],drafts:{},audit:[],mode:'import',identity:'Pull',context:'company',website:'',offer:'Help reviewing prospects',setup:true,duplicates:0,rules:{roles:'Founder',industries:'SaaS',countries:'',min:'',max:'',signals:'',days:'90',evidence:true}});
const request=(body,{user=A,account=user,origin='https://pull.example',cookie,method}={})=>new Request('https://pull.example/api/automations',{method:method||(body===undefined?'GET':'POST'),headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie??(user?'__Host-pull-access=valid-'+user+'; __Host-pull-refresh=refresh-'+user:''),...(account?{'X-Pull-Account':account}:{})},body:body===undefined?undefined:JSON.stringify(body)});

function fixture({anonymous=false,outage=false,conflict='',refreshStatus=0}={}) {
  const workflows=new Map([[WA,workflow()],[WB,workflow(WB,B)],[WD,workflow(WD,A,'draft_suggestions','on_import')]]);
  const rows=new Map([[A,{user_id:A,payload:workspace(),revision:1,updated_at:at}],[B,{user_id:B,payload:{...workspace(),identity:'Private B'},revision:1,updated_at:at}]]),runs=[],calls=[];
  const transport=async(input,options)=>{
    const url=new URL(input),body=options.body?JSON.parse(options.body):null;calls.push({url,options,body});
    if(outage)throw new Error('Offline');
    const token=options.headers.Authorization?.replace('Bearer ',''),owner=token?.startsWith('valid-')?token.slice(6):null;
    if(url.pathname==='/auth/v1/user')return owner?Response.json({id:owner,is_anonymous:anonymous}):Response.json({},{status:401});
    if(url.pathname==='/auth/v1/token')return refreshStatus?Response.json({},{status:refreshStatus}):Response.json({access_token:'valid-'+A,refresh_token:'refresh-'+A,expires_in:3600});
    if(!owner)return Response.json({},{status:401});
    if(url.pathname==='/rest/v1/rpc/pull_apply_automations'){
      const row=rows.get(owner),before=structuredClone(row);
      if(conflict==='workspace'){rows.set(owner,{...row,payload:{...row.payload,identity:'Newer cloud work'},revision:2});return Response.json({code:'P0001'},{status:400});}
      if(conflict==='definition')return Response.json({code:'P0001'},{status:400});
      if(conflict==='history')return Response.json({code:'XX000'},{status:500});
      if(row.revision!==body.p_revision||body.p_runs.some(r=>!workflows.get(r.id)||workflows.get(r.id).user_id!==owner))return Response.json({code:'P0001'},{status:400});
      const history=body.p_runs.map((input,index)=>({id:'run-'+(runs.length+index),automation_id:input.id,user_id:owner,name:workflows.get(input.id).name,kind:workflows.get(input.id).kind,status:'completed',counts:input.counts,base_revision:row.revision,result_revision:row.revision+1,created_at:at}));
      rows.set(owner,{...before,payload:body.p_payload,revision:row.revision+1,updated_at:at});runs.push(...history);
      return Response.json({revision:row.revision+1,updated_at:at,runs:history.map(({user_id,...safe})=>safe)});
    }
    const table=url.pathname.split('/').at(-1),match=row=>[...url.searchParams].filter(([key])=>!['select','order','limit'].includes(key)).every(([key,value])=>String(row[key])===value.slice(3));
    const project=row=>Object.fromEntries((url.searchParams.get('select')||'').split(',').filter(k=>k in row).map(k=>[k,row[k]]));
    if(table==='pull_automations'){
      if(options.method==='POST'){
        if(body.user_id!==owner)return Response.json({code:'42501'},{status:403});
        const row={...body,id:'44444444-4444-4444-8444-444444444444',archived:false,created_at:at,updated_at:at};workflows.set(row.id,row);return Response.json([project(row)],{status:201});
      }
      const selected=[...workflows.values()].filter(r=>r.user_id===owner&&match(r));
      if(options.method==='PATCH'){for(const row of selected)workflows.set(row.id,{...row,...body});return Response.json(selected.map(row=>project(workflows.get(row.id))));}
      return Response.json(selected.map(project));
    }
    if(table==='pull_workspaces')return Response.json([...rows.values()].filter(r=>r.user_id===owner&&match(r)).map(project));
    if(table==='pull_automation_runs')return Response.json(runs.filter(r=>r.user_id===owner&&match(r)).slice(-20).reverse().map(project));
    throw new Error('Unexpected table');
  };
  const backend=createAutomationsBackend({env,now:()=>new Date(at),clientFactory:(url,key,options)=>createClient(url,key,{...options,global:{...options.global,fetch:transport}})});
  return {backend,workflows,rows,runs,calls};
}

test('Audience review reports fit without approving or replacing user decisions',()=>{
  const original=workspace(),result=applyAutomation(workflow(),original,new Date(at));
  assert.deepEqual(result.payload.shortlist,original.shortlist);assert.deepEqual(result.payload.drafts,{});assert.deepEqual(result.payload.prospects,original.prospects);
  assert.equal(result.counts.matches,1);assert.equal(result.counts.needs_evidence,1);assert.equal(result.counts.excluded,1);assert.equal(original.audit.length,0);assert.equal(result.payload.audit.length,1);
});

test('Draft suggestions require a reviewed qualifying nonsuppressed prospect and stay unprepared',()=>{
  const original=workspace(),result=applyAutomation(workflow(WD,A,'draft_suggestions'),original,new Date(at));
  assert.deepEqual(Object.keys(result.payload.drafts),['p1']);assert.equal(result.payload.drafts.p1.ready,false);assert.equal(result.counts.drafts_created,1);assert.equal(result.counts.not_eligible,2);
  const unreviewed={...workspace(),shortlist:[]};assert.equal(applyAutomation(workflow(WD,A,'draft_suggestions'),unreviewed,new Date(at)).counts.drafts_created,0);
});

test('Repeated suggestion runs preserve custom subject, body, channel and preparation decisions',()=>{
  const original=workspace(),custom={subject:'My subject',body:'My carefully edited message',channel:'personal',ready:true};original.drafts.p1=custom;
  const result=applyAutomation(workflow(WD,A,'draft_suggestions'),original,new Date(at));assert.deepEqual(result.payload.drafts.p1,custom);assert.equal(result.counts.drafts_created,0);assert.equal(result.counts.existing_drafts,1);
});

test('Unconfigured deployments, anonymous visitors and stale account headers cannot run or read private workflows',async()=>{
  const noConfig=createAutomationsBackend({env:{}});assert.deepEqual(await(await noConfig(request())).json(),{configured:false,workflows:[],runs:[]});assert.equal((await noConfig(request({action:'run',id:WA,revision:1}))).status,503);
  for(const [options,req,status] of [[{},request(undefined,{user:null}),401],[{anonymous:true},request(),401],[{},request(undefined,{account:B}),409]]){
    const f=fixture(options),response=await f.backend(req);assert.equal(response.status,status);assert.ok(!f.calls.some(c=>c.url.pathname.includes('/rest/v1/')));
  }
});

test('Cross-site mutations are rejected before authentication and every list is owner filtered',async()=>{
  const f=fixture();assert.equal((await f.backend(request({action:'create'},{origin:'https://evil.example'}))).status,403);assert.equal(f.calls.length,0);
  const result=await(await f.backend(request())).json();assert.equal(result.workflows.length,2);assert.ok(!result.workflows.some(w=>w.id===WB));
  assert.ok(f.calls.filter(c=>c.url.pathname.startsWith('/rest/v1/')).every(c=>c.url.searchParams.get('user_id')==='eq.'+A));
});

test('Create and update validate fixed operations and cannot reassign ownership',async()=>{
  const f=fixture();
  for(const values of [{name:'x',kind:'send_email',trigger:'manual'},{name:'x',kind:'audience_review',trigger:'cron'},{name:'x',kind:'audience_review',trigger:'manual',user_id:B},{name:' '.repeat(5),kind:'audience_review',trigger:'manual'}])assert.equal((await f.backend(request({action:'create',...values}))).status,400);
  const response=await f.backend(request({action:'create',name:'  My review  ',kind:'audience_review',trigger:'manual'}));assert.equal(response.status,201);const created=(await response.json()).workflow;assert.equal(created.name,'My review');assert.equal(f.workflows.get(created.id).user_id,A);
  assert.equal((await f.backend(request({action:'update',id:WA,user_id:B}))).status,400);assert.equal((await f.backend(request({action:'update',id:WB,enabled:false}))).status,404);
  assert.equal((await f.backend(request({action:'update',id:WA,archived:true}))).status,200);assert.equal(f.workflows.get(WA).archived,true);assert.equal(f.workflows.get(WA).enabled,false);
});

test('Destination choices are saved as handoffs and never enable sending',async()=>{
  const f=fixture();
  const response=await f.backend(request({action:'create',name:'Car buyer review',kind:'audience_review',trigger:'manual',destination:'jiji'}));
  assert.equal(response.status,201);
  const created=(await response.json()).workflow;
  assert.equal(created.destination,'jiji');
  assert.equal(f.workflows.get(created.id).destination,'jiji');
  assert.equal((await f.backend(request({action:'create',name:'Bad channel',kind:'audience_review',trigger:'manual',destination:'bulk_dm'}))).status,400);
  const html=renderAutomationView({configured:true,signedIn:true,workflows:[created],runs:[]});
  assert.match(html,/Jiji/);
  assert.match(html,/posting and messages stay in your Jiji account/i);
});

test('Run reads only the saved workspace and atomically records its revision and history',async()=>{
  const f=fixture(),response=await f.backend(request({action:'run',id:WD,revision:1}));assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.workspace.revision,2);assert.equal(result.results[0].counts.drafts_created,1);assert.equal(f.rows.get(A).revision,2);assert.equal(f.rows.get(B).revision,1);assert.equal(f.runs.length,1);assert.equal(f.runs[0].user_id,A);
  assert.ok(f.calls.some(c=>c.url.pathname==='/rest/v1/rpc/pull_apply_automations'));assert.ok(!f.calls.some(c=>c.url.pathname.endsWith('pull_workspaces')&&c.options.method==='PATCH'));
  assert.equal((await f.backend(request({action:'run',id:WD,revision:2,workspace:{...workspace(),identity:'Override'}}))).status,400);
});

test('Disabled or another owner workflows cannot run',async()=>{
  const f=fixture();f.workflows.get(WA).enabled=false;
  assert.equal((await f.backend(request({action:'run',id:WA,revision:1}))).status,409);assert.equal((await f.backend(request({action:'run',id:WB,revision:1}))).status,404);assert.equal(f.runs.length,0);assert.equal(f.rows.get(A).revision,1);
});

test('A newer cloud save or changed workflow cannot be overwritten by a run',async()=>{
  for(const conflict of ['workspace','definition']){
    const f=fixture({conflict}),before=structuredClone(f.rows.get(A)),response=await f.backend(request({action:'run',id:WD,revision:1}));assert.equal(response.status,409);assert.equal((await response.json()).code,'WORKSPACE_CHANGED');assert.equal(f.runs.length,0);
    if(conflict==='workspace'){assert.equal(f.rows.get(A).payload.identity,'Newer cloud work');assert.deepEqual(f.rows.get(A).payload.drafts,{});}else assert.deepEqual(f.rows.get(A),before);
  }
  const f=fixture();f.rows.get(A).revision=3;assert.equal((await f.backend(request({action:'run',id:WD,revision:1}))).status,409);assert.ok(!f.calls.some(c=>c.url.pathname.includes('/rpc/')));
});

test('History-write failures leave the saved workspace unchanged and return no success',async()=>{
  const f=fixture({conflict:'history'}),before=structuredClone(f.rows.get(A));const response=await f.backend(request({action:'run',id:WD,revision:1}));assert.equal(response.status,503);assert.deepEqual(f.rows.get(A),before);assert.equal(f.runs.length,0);
});

test('After-import runs only enabled matching workflows in one atomic revision',async()=>{
  const f=fixture();f.workflows.get(WA).trigger='on_import';
  const response=await f.backend(request({action:'on_import',revision:1}));assert.equal(response.status,200);const result=await response.json();assert.equal(result.results.length,2);assert.equal(f.rows.get(A).revision,2);assert.equal(f.runs.length,2);assert.ok(f.runs.every(r=>r.base_revision===1&&r.result_revision===2));
  const next=await f.backend(request({action:'on_import',revision:2}));assert.equal(next.status,200);assert.equal((await next.json()).results.find(r=>r.kind==='draft_suggestions').counts.drafts_created,0);
});

test('After-import workflows reject example data and successful example runs stay labelled',async()=>{
  const f=fixture();f.rows.get(A).payload.mode='example';
  assert.equal((await f.backend(request({action:'on_import',revision:1}))).status,400);assert.equal(f.rows.get(A).revision,1);
  const response=await f.backend(request({action:'run',id:WA,revision:1}));assert.equal(response.status,200);assert.equal(f.runs[0].counts.data_origin,'example');
  assert.ok(renderAutomationView({configured:true,signedIn:true,workflows:[],runs:f.runs}).includes('Fictional example'));
});

test('Temporary auth limits preserve browser cookies and never touch cloud data',async()=>{
  const f=fixture({refreshStatus:429}),response=await f.backend(request(undefined,{cookie:'__Host-pull-access=expired; __Host-pull-refresh=refresh-'+A}));assert.equal(response.status,503);assert.equal(response.headers.getSetCookie().length,0);assert.ok(!f.calls.some(c=>c.url.pathname.startsWith('/rest/')));
});

test('Automation view escapes user input and clearly describes available behavior',()=>{
  const w={...workflow(),name:'<img src=x onerror=alert(1)>'};const html=renderAutomationView({configured:true,signedIn:true,workflows:[w],runs:[]});assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('data-action="automation-run"'));assert.ok(html.includes('Nothing sends messages'));assert.match(html,/After.*import.*(?:saved|save).*cloud/is);
  assert.ok(renderAutomationView({configured:true,signedIn:false}).includes('Sign in to create workflows'));
});
