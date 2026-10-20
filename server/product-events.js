import {productJson,productOriginOk} from './product-auth.js';
// Strict categorical telemetry. Never transmit PULL workspace content or contact details.
const EVENTS=new Set(['pull_view_opened','pull_action_selected','pull_milestone_reached','pull_runtime_error']);
const VIEWS=new Set(['home','prospects','shortlist','drafts','inbox','results','connections','assistant','automations','settings','connect','support']);
const ACTIONS=new Set(['import','sample','ai-mode','workspace','guide','account','backup','discover','review','prepare','copy','connect']);
const MILESTONES=new Set(['example_opened','workspace_saved','prospect_reviewed','draft_prepared','audience_reviewed','source_added','discovery_completed','suppression_applied']);
const CATEGORIES=new Set(['navigation','workspace','runtime']);
const HOSTS=new Set(['https://us.i.posthog.com','https://eu.i.posthog.com']);
export function validateProductEvent(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||!EVENTS.has(input.event)||!/^pull_[0-9a-f-]{36}$/.test(input.distinct_id||''))return null;
  const raw=input.properties;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const properties={};
  for(const [key,valid] of [['view',VIEWS],['action',ACTIONS],['milestone',MILESTONES],['category',CATEGORIES]]) {
    if(raw[key]===undefined)continue;
    if(typeof raw[key]!=='string'||!valid.has(raw[key]))return null;
    properties[key]=raw[key];
  }
  if(input.event==='pull_view_opened'&&!properties.view)return null;
  if(input.event==='pull_action_selected'&&!properties.action&&!properties.view)return null;
  if(input.event==='pull_milestone_reached'&&!properties.milestone)return null;
  if(input.event==='pull_runtime_error'&&properties.category!=='runtime')return null;
  return {event:input.event,distinct_id:input.distinct_id,properties};
}
export function createProductEventHandler({env=process.env,transport=fetch}={}) {
  return async request=>{
    if(request.method!=='POST')return productJson(405,{error:'Method not allowed'});
    if(!productOriginOk(request))return productJson(403,{error:'Origin not allowed'});
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return productJson(415,{error:'JSON required'});
    const host=env.POSTHOG_CAPTURE_HOST||'https://us.i.posthog.com';
    if(!env.POSTHOG_PROJECT_API_KEY||!HOSTS.has(host))return productJson(503,{error:'Product analytics is not configured'});
    let event;
    try{
      const raw=await request.text();
      if(raw.length>1024)return productJson(413,{error:'Event too large'});
      event=validateProductEvent(JSON.parse(raw));
    }catch{return productJson(400,{error:'Invalid event'});}
    if(!event)return productJson(400,{error:'Unsupported event'});
    const payload={api_key:env.POSTHOG_PROJECT_API_KEY,event:event.event,distinct_id:event.distinct_id,
      properties:{...event.properties,source:'pull-web',schema_version:1,'$process_person_profile':false,'$ip':null}};
    try{
      const response=await transport(host+'/i/v0/e/',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(4500)});
      return response.ok?productJson(202,{accepted:true}):productJson(502,{error:'Analytics provider unavailable'});
    }catch{return productJson(502,{error:'Analytics provider unavailable'});}
  };
}
