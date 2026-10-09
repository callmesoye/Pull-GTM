export const norm = value => String(value ?? '').normalize('NFKC').trim().toLowerCase();
export const terms = value => String(value ?? '').split(',').map(norm).filter(Boolean);
export const hasIdentity = prospect => [prospect?.name,prospect?.company,prospect?.email].some(norm)||Boolean(safePrivateProfileUrl(prospect?.profile_url));
export function safeUrl(value) {
  try {const u=new URL(String(value));return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
export function safePrivateProfileUrl(value){
  const url=safeUrl(value);if(!url||!url.startsWith('https://'))return '';
  const host=new URL(url).hostname;
  return /\.(gov|mil|edu)(\.|$)/i.test(host)||/(^|\.)(gov|gouv|gc|go|edu|ac|mil)\.[a-z.]+$/i.test(host)?'':url;
}
export function parseCSV(input) {
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
  const aliases={full_name:'name',first_name:'first_name',last_name:'last_name',job_title:'title',position:'title',organization:'company',organisation:'company',company_name:'company',company_size:'employees',email_address:'email',linkedin_url:'profile_url',twitter_url:'x_url',evidence_url:'source_url',intent_signal:'signal',date:'signal_date',do_not_contact:'suppressed'};
  const mapped=headers.map(h=>aliases[h]||h);
  if(new Set(mapped).size!==mapped.length)throw new Error('Two columns map to the same field. Keep one column for each field.');
  return rows.map((values,index)=>{
    if(values.length!==headers.length)throw new Error('Row '+(index+2)+' has '+values.length+' values; expected '+headers.length+'.');
    const p=Object.fromEntries(mapped.map((h,i)=>[h,values[i]?.trim()||'']));
    if(!p.name&&(p.first_name||p.last_name))p.name=[p.first_name,p.last_name].filter(Boolean).join(' ');
    if(!hasIdentity(p))throw new Error('Row '+(index+2)+' has no person, company, email, or profile link. Add an identity before importing.');
    return {...p,id:'import-'+index,origin:'import',suppressed:['true','yes','1'].includes(norm(p.suppressed))};
  });
}
export function deduplicate(prospects) {
  const seen=new Map(),clean=[];let duplicates=0;
  for(const item of prospects) {
    const key=norm(item.email)||norm(item.profile_url).replace(/\/$/,'')||(norm(item.name)||norm(item.company)?norm(item.name)+'|'+norm(item.company):'row:'+item.id);
    if(seen.has(key)) {
      duplicates++;const previous=seen.get(key);
      previous.suppressed=previous.suppressed||item.suppressed;
      const conflicts=['title','company','industry','country','employees','signal','signal_date','source_url'].filter(k=>previous[k]&&item[k]&&norm(previous[k])!==norm(item[k]));
      previous.conflicts=[...new Set([...(previous.conflicts||[]),...(item.conflicts||[]),...conflicts])];
      for(const [field,value] of Object.entries(item)){if(['id','origin','suppressed','conflicts'].includes(field))continue;if(!norm(previous[field])&&norm(value))previous[field]=value;}
    }else {const copy={...item};seen.set(key,copy);clean.push(copy);}
  }
  return {prospects:clean,duplicates};
}
export function qualify(p,rules,now=new Date()) {
  const checks=[],fail=[],missing=[];
  if(!hasIdentity(p))missing.push('Prospect identity is missing');
  if(p.origin==='discovery'&&p.private_verified!=='yes')missing.push('Confirm this is a current private-sector person and business');
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
    if(!safeUrl(p.source_url))evidence.push('A valid source link is missing');
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
