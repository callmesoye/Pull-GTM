import {assessPrivateSector} from './prospect-policy.js';
import {deduplicateRecords,privateReviewFingerprint} from './prospect-records.js';
export {canonicalProfile,suppressionKeys,mergeSuppressions,isSuppressed,applySuppressionLedger,recordFingerprint,privateReviewFingerprint,normalizeProspect,reconcileReviews} from './prospect-records.js';
export const norm = value => String(value ?? '').normalize('NFKC').trim().toLowerCase();
export const terms = value => String(value ?? '').split(',').map(norm).filter(Boolean);
export const hasIdentity = prospect => [prospect?.name,prospect?.company,prospect?.email].some(norm)||['profile_url','website_url','x_url','instagram_url','facebook_url','jiji_url'].some(key=>Boolean(safePrivateProfileUrl(prospect?.[key])));
export function safeUrl(value) {
  try {const u=new URL(String(value));return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
export function safePrivateProfileUrl(value){
  const url=safeUrl(value);if(!url||!url.startsWith('https://'))return '';
  const host=new URL(url).hostname;
  return /\.(gov|mil|edu)(\.|$)/i.test(host)||/(^|\.)(gov|gouv|gc|go|edu|ac|mil)\.[a-z.]+$/i.test(host)?'':url;
}
let importBatch=0;
export function parseCSV(input,{allowIncomplete=false}={}) {
  const text=String(input).replace(/^\uFEFF/,'');
  const rows=[];let row=[],cell='',quoted=false,closedQuote=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {
      if(quoted&&text[i+1]==='"'){cell+='"';i++;}
      else if(quoted){quoted=false;closedQuote=true;}
      else if(cell===''&&!closedQuote){quoted=true;}
      else throw new Error('Unexpected quote in CSV. Put quoted values inside double quotes.');
    }else if(c===','&&!quoted){row.push(cell);cell='';closedQuote=false;}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';closedQuote=false;}
    else if(closedQuote)throw new Error('Unexpected text after a quoted CSV value. Separate columns with commas.');
    else cell+=c;
  }
  if(quoted)throw new Error('Unclosed quotation mark in CSV.');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  if(rows.length<2)throw new Error('Add a header row and at least one prospect.');
  const headers=rows.shift().map(h=>norm(h).replace(/[\s-]+/g,'_'));
  if(new Set(headers).size!==headers.length)throw new Error('CSV contains duplicate column names.');
  const aliases={full_name:'name',contact_name:'name',person_name:'name',customer_name:'name',lead_name:'name',first_name:'first_name',last_name:'last_name',job_title:'title',position:'title',role:'title',target_role:'title',organization:'company',organisation:'company',company_name:'company',business_name:'company',store_name:'company',shop_name:'company',dealer_name:'company',company_size:'employees',email_address:'email',contact_email:'email',business_email:'email',linkedin_url:'profile_url',linkedin:'profile_url',profile:'profile_url',profile_link:'profile_url',url:'profile_url',link:'profile_url',twitter_url:'x_url',twitter:'x_url',website:'website_url',business_website:'website_url',jiji_link:'jiji_url',listing_url:'jiji_url',evidence_url:'source_url',intent_signal:'signal',date:'signal_date',do_not_contact:'suppressed',sector:'industry',category:'industry',target_industry:'industry',target_audience:'audience',customer_segment:'audience',city:'location',region:'location',area:'location'};
  const mapped=headers.map(h=>aliases[h]||h);
  if(new Set(mapped).size!==mapped.length)throw new Error('Two columns map to the same field. Keep one column for each field.');
  const batch=Date.now().toString(36)+'-'+(++importBatch).toString(36);
  return rows.map((values,index)=>{
    if(values.length!==headers.length)throw new Error('Row '+(index+2)+' has '+values.length+' values; expected '+headers.length+'.');
    const p=Object.fromEntries(mapped.map((h,i)=>[h,values[i]?.trim()||'']));
    if(!p.name&&(p.first_name||p.last_name))p.name=[p.first_name,p.last_name].filter(Boolean).join(' ');
    if(!allowIncomplete&&!hasIdentity(p))throw new Error('Row '+(index+2)+' has no person, company, email, or profile link. Add an identity before importing.');
    // CSV values can describe evidence but cannot award their own review approval.
    for(const key of ['review_key','private_review_key','suppression_origin','suppression_aliases','conflicts','conflict_details'])delete p[key];
    const suppressed=['true','yes','1'].includes(norm(p.suppressed));
    const record={...p,id:'import-'+batch+'-'+index,record_version:'2',entity_type:p.entity_type==='business'||(!norm(p.name)&&norm(p.company))?'business':'person',origin:'import',private_verified:'no',suppressed,...(suppressed?{suppression_origin:'explicit'}:{})};
    if(!allowIncomplete&&assessPrivateSector(record).status==='excluded')throw new Error('Row '+(index+2)+' is outside private-sector scope.');
    return record;
  });
}
export function planCSVImport(input){
  const rows=parseCSV(input,{allowIncomplete:true}),prospects=[],targets=[],skipped=[],rejected=[];
  rows.forEach((row,index)=>{
    const sector=assessPrivateSector(row);if(sector.status==='excluded'){rejected.push({row:index+2,reason:sector.reason});return;}
    if(hasIdentity(row)){prospects.push(row);return;}
    const audience=row.audience||row.title||'',industry=row.industry||'',location=row.location||row.country||'';
    if(audience||industry||location)targets.push({row:index+2,audience,industry,location});
    else skipped.push(index+2);
  });
  return {prospects,targets,skipped,rejected};
}
export function deduplicate(prospects) {
  return deduplicateRecords(prospects);
}
export function qualify(p,rules,now=new Date()) {
  const checks=[],fail=[],missing=[];
  if(!hasIdentity(p))missing.push('Prospect identity is missing');
  const sector=assessPrivateSector(p);
  if(sector.status==='excluded')fail.push(sector.reason);
  else if(sector.status==='review')missing.push(sector.reason);
  if(p.private_review_key&&p.private_review_key!==privateReviewFingerprint(p))missing.push('Identity or source changed; confirm private-sector status again');
  const match=(label,value,options,mode='exact')=>{
    if(!options.length)return;
    if(!norm(value)){missing.push(label+' is missing');checks.push({label,state:'unknown',detail:'Not provided'});return;}
    const normalized=norm(value),pass=options.some(t=>mode==='title'?(' '+normalized.split(/[^\p{L}\p{N}]+/u).join(' ')+' ').includes(' '+t.split(/[^\p{L}\p{N}]+/u).join(' ')+' '):normalized===t);
    checks.push({label,state:pass?'pass':'fail',detail:String(value)});
    if(!pass)fail.push(label+' does not match');
  };
  match('Role',p.title,terms(rules.roles),'title');match('Industry',p.industry,terms(rules.industries));match('Country',p.country,terms(rules.countries));
  if(rules.min!==''||rules.max!=='') {
    const size=Number(p.employees),valid=String(p.employees??'').trim()!==''&&Number.isFinite(size)&&size>=0;
    if(!valid){missing.push('Company size is missing or invalid');checks.push({label:'Company size',state:'unknown',detail:'Not provided'});}
    else {const pass=(rules.min===''||size>=Number(rules.min))&&(rules.max===''||size<=Number(rules.max));checks.push({label:'Company size',state:pass?'pass':'fail',detail:size+' employees'});if(!pass)fail.push('Company size is outside your range');}
  }
  if(terms(rules.signals).length) {
    if(!norm(p.signal)){missing.push('Buying signal is missing');checks.push({label:'Signal',state:'unknown',detail:'Not provided'});}
    else {const pass=terms(rules.signals).some(t=>norm(p.signal).includes(t));checks.push({label:'Signal',state:pass?'pass':'fail',detail:p.signal});if(!pass)fail.push('Signal does not match');}
  }
  const evidence=[];
  if(rules.evidence) {
    if(!safePrivateProfileUrl(p.source_url))evidence.push('A valid private-sector HTTPS source link is missing');
    if(!norm(p.signal))evidence.push('Signal context is missing');
    const date=String(p.signal_date??''), parsed=new Date(date+'T00:00:00Z');
    const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(+parsed)&&parsed.toISOString().slice(0,10)===date;
    if(!validDate)evidence.push('A valid signal date is missing');
    else {
      const age=Math.floor((new Date(now.toISOString().slice(0,10)+'T00:00:00Z')-parsed)/86400000);
      if(age<0)evidence.push('Signal date is in the future');
      else if(age>Number(rules.days||90))evidence.push('Signal is older than '+(rules.days||90)+' days');
    }
  }
  if(p.conflicts?.length)missing.push('Duplicate records disagree: '+p.conflicts.join(', '));
  if(p.suppressed)fail.unshift('Marked do not contact');
  const hasRules=checks.length>0;
  if(!hasRules)missing.push('Define at least one audience criterion');
  const reasons=[...fail,...missing,...evidence];
  const status=fail.length?'excluded':missing.length||evidence.length?'review':'fit';
  return {...p,status,checks,reasons,matched:checks.filter(c=>c.state==='pass').length,evidenceUrl:safeUrl(p.source_url)};
}
export function csvExport(rows,fields) {
  const escape=value=>{let s=String(value??'');if(/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return [fields,...rows.map(r=>fields.map(f=>r[f]))].map(r=>r.map(escape).join(',')).join('\r\n');
}
export function draftFor(p,offer,identity) {
  const opening=p.name?'Hi '+p.name.split(' ')[0]+',':'Hello,';
  return `${opening}\n\nI’m reaching out from ${identity||'your company'} about ${offer||'[add your offer]'}${p.company?' for '+p.company:''}.\n\nWould it be useful to see whether this fits what your team needs?\n\n[Your name]`;
}
