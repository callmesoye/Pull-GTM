// Shared record identity and review lifecycle. No network or model calls.
const norm = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const profileFields = ['profile_url','linkedin_url','x_url','instagram_url','facebook_url','jiji_url'];
const materialFields = ['name','title','company','industry','country','location','employees','signal','signal_date','source_url','source_title','source_excerpt','email','website_url',...profileFields,'private_verified','private_sector_basis','entity_type'];
const textFields = ['id','name','title','company','industry','country','location','employees','signal','signal_date','source_url','source_title','source_excerpt','email','website_url',...profileFields,'private_sector_status','private_sector_basis','identity_status','contact_status','discovered_at','search_match','search_gaps','search_relevance','additional_sources','conflict_details','suppression_aliases','private_review_key','review_key'];

export function canonicalProfile(value) {
  try {
    const url=new URL(String(value||''));
    if(url.protocol!=='https:'||url.username||url.password)return '';
    let host=url.hostname.toLowerCase().replace(/^(?:www|m|mobile)\./,'');
    if(host==='twitter.com')host='x.com';
    if(host==='fb.com')host='facebook.com';
    const social=['linkedin.com','x.com','instagram.com','facebook.com'].includes(host);
    const path=(social?url.pathname.toLowerCase():url.pathname).replace(/\/+$/,'');
    let query='';
    if(host==='facebook.com'&&path==='/profile.php'){
      const id=url.searchParams.get('id');if(!/^\d+$/.test(id||'')||url.searchParams.getAll('id').length!==1)return '';
      query='?id='+id;
    }else if(!social){
      for(const key of [...url.searchParams.keys()])if(/^utm_|^(?:trk|trackingId|gclid|fbclid)$/i.test(key))url.searchParams.delete(key);
      url.searchParams.sort();query=url.searchParams.size?'?'+url.searchParams.toString():'';
    }
    return 'https://'+host+(url.port?':'+url.port:'')+path+query;
  }catch{return '';}
}

export function suppressionKeys(record) {
  const keys=[];
  const email=norm(record.email);
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))keys.push('email:'+email);
  for(const field of profileFields){const url=canonicalProfile(record[field]);if(url)keys.push('profile:'+url);}
  const name=norm(record.name),company=norm(record.company);
  if(name&&company)keys.push('entity:'+name+'|'+company);
  if(!name&&company)keys.push('entity:|'+company);
  if(!name){const url=canonicalProfile(record.website_url);if(url)keys.push('business:'+url);}
  if(record.suppressed===true){try{const aliases=JSON.parse(record.suppression_aliases||'[]');if(Array.isArray(aliases))keys.push(...mergeSuppressions(aliases));}catch{}}
  return [...new Set(keys)];
}

export function mergeSuppressions(...ledgers) {
  const out=new Set();
  for(const ledger of ledgers){
    if(ledger===undefined)continue;
    if(!Array.isArray(ledger))throw new Error('Invalid do-not-contact history.');
    for(const key of ledger){
      if(typeof key!=='string'||key.length>1024||!key||! /^(?:email|profile|entity|business):/.test(key)||/[\u0000-\u001f\u007f]/.test(key))throw new Error('Invalid do-not-contact history.');
      out.add(key);
      if(out.size>10000)throw new Error('Do-not-contact history is full. Export your data before adding more records.');
    }
  }
  return [...out].sort();
}

export function isSuppressed(record,ledger=[]) {
  return record.suppressed===true||suppressionKeys(record).some(key=>ledger.includes(key));
}

export function applySuppressionLedger(prospects,ledger=[]) {
  const keys=new Set(mergeSuppressions(ledger));
  return prospects.map(record=>{
    const explicit=record.suppressed===true&&record.suppression_origin!=='matched';
    const matched=suppressionKeys(record).some(key=>keys.has(key));
    return {...record,suppressed:explicit||matched,...(!explicit&&(record.suppression_origin==='matched'||matched)?{suppression_origin:'matched'}:{})};
  });
}

function fingerprint(values) {
  const text=JSON.stringify(values);let a=2166136261,b=5381;
  for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
  // Change detection only, not a signature or authorization credential.
  return 'review-v1-'+(a>>>0).toString(16)+(b>>>0).toString(16);
}
export function recordFingerprint(record) {
  return fingerprint([...materialFields.map(key=>key.endsWith('_url')?String(record[key]||'').trim():norm(record[key])),...(record.conflicts||[]).map(norm).sort(),record.suppressed===true]);
}
export function privateReviewFingerprint(record) {
  return fingerprint(['name','company','title','source_url','website_url',...profileFields].map(key=>key.endsWith('_url')?String(record[key]||'').trim():norm(record[key])));
}

export function normalizeProspect(record,{origin=record.origin||'import'}={}) {
  const extra=Object.fromEntries(Object.entries(record).filter(([key,value])=>typeof value==='string'&&!['__proto__','prototype','constructor'].includes(key)));
  const normalized={...extra,...Object.fromEntries(textFields.filter(key=>record[key]!==undefined).map(key=>[key,String(record[key]??'').trim()]))};
  return {...normalized,record_version:'2',entity_type:record.entity_type==='business'||(!norm(record.name)&&norm(record.company))?'business':'person',origin,suppressed:record.suppressed===true,conflicts:[...new Set((Array.isArray(record.conflicts)?record.conflicts:[]).filter(value=>typeof value==='string'))]};
}

function compatible(a,b,shared) {
  if(a.origin==='discovery'&&b.origin==='discovery'&&a.id&&a.id===b.id)return true;
  if(norm(a.name)&&norm(b.name)&&norm(a.name)!==norm(b.name))return false;
  if(!norm(a.name)&&!norm(b.name)&&['country','location'].some(key=>norm(a[key])&&norm(b[key])&&norm(a[key])!==norm(b[key])))return false;
  if(shared.some(key=>key.startsWith('profile:')))return true;
  const aProfiles=suppressionKeys(a).filter(key=>key.startsWith('profile:')),bProfiles=suppressionKeys(b).filter(key=>key.startsWith('profile:'));
  if(aProfiles.length&&bProfiles.length&&!aProfiles.some(key=>bProfiles.includes(key)))return false;
  return true;
}

export function deduplicateRecords(records) {
  const prospects=[],index=new Map();let duplicates=0;
  const indexRecord=(record,alias=record)=>{
    const keys=suppressionKeys(alias);
    if(alias.origin==='discovery'&&alias.id)keys.push('discovery-id:'+alias.id);
    for(const key of keys){if(!index.has(key))index.set(key,new Set());index.get(key).add(record);}
  };
  for(const original of records){
    const incoming={...original,conflicts:[...(original.conflicts||[])]},keys=suppressionKeys(incoming);
    if(incoming.origin==='discovery'&&incoming.id)keys.push('discovery-id:'+incoming.id);
    const candidates=new Set(keys.flatMap(key=>[...(index.get(key)||[])]));
    const matching=[...candidates].filter(record=>compatible(record,incoming,keys.filter(key=>suppressionKeys(record).includes(key))));
    if(matching.length!==1){prospects.push(incoming);indexRecord(incoming);continue;}
    const previous=matching[0];duplicates++;
    const explicitSuppression=[previous,incoming].some(record=>record.suppressed===true&&record.suppression_origin!=='matched');
    const suppressionAliases=previous.suppressed===true||incoming.suppressed===true?mergeSuppressions(suppressionKeys(previous),suppressionKeys(incoming)):[];
    previous.suppressed=previous.suppressed===true||incoming.suppressed===true;
    if(previous.suppressed)previous.suppression_origin=explicitSuppression?'explicit':'matched';
    if(suppressionAliases.length)previous.suppression_aliases=JSON.stringify(suppressionAliases);
    const compared=(record,key)=>key.endsWith('_url')?canonicalProfile(record[key]):norm(record[key]);
    const conflicts=materialFields.filter(key=>!['private_verified','private_sector_basis'].includes(key)&&norm(previous[key])&&norm(incoming[key])&&compared(previous,key)!==compared(incoming,key));
    previous.conflicts=[...new Set([...previous.conflicts,...incoming.conflicts,...conflicts])];
    if(conflicts.length){
      let details={};try{const parsed=JSON.parse(previous.conflict_details||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))details=parsed;}catch{}
      for(const key of conflicts)details[key]=[...new Set([...(Array.isArray(details[key])?details[key]:[]),String(previous[key]),String(incoming[key])])];
      previous.conflict_details=JSON.stringify(details);
    }
    const urls=[previous.source_url,incoming.source_url];
    for(const record of [previous,incoming]){try{urls.push(...JSON.parse(record.additional_sources||'[]'));}catch{}}
    if(urls.filter(Boolean).length>1)previous.additional_sources=JSON.stringify([...new Set(urls.filter(url=>typeof url==='string'&&canonicalProfile(url)))]);
    for(const [key,value] of Object.entries(incoming)){
      if(['id','origin','suppressed','suppression_origin','suppression_aliases','conflicts','private_verified','private_review_key','review_key','conflict_details'].includes(key))continue;
      if(!norm(previous[key])&&norm(value))previous[key]=value;
    }
    indexRecord(previous);indexRecord(previous,incoming);
  }
  return {prospects,duplicates};
}

export function reconcileReviews(workspace,previous,qualifier,now=new Date()) {
  const ledger=mergeSuppressions(previous?.suppressions,workspace.suppressions,...[previous,workspace].filter(Boolean).flatMap(value=>value.prospects.filter(record=>record.suppressed===true&&record.suppression_origin!=='matched').map(suppressionKeys)));
  const prospects=applySuppressionLedger(workspace.prospects,ledger),old=new Map((previous?.prospects||[]).map(record=>[record.id,record]));
  const rulesChanged=previous&&JSON.stringify(previous.rules)!==JSON.stringify(workspace.rules);
  const approved=new Set();
  for(const record of prospects){
    const before=old.get(record.id);
    if(record.private_review_key&&record.private_review_key!==privateReviewFingerprint(record))record.private_verified='no';
    if(before&&privateReviewFingerprint(before)!==privateReviewFingerprint(record)&&record.private_review_key!==privateReviewFingerprint(record))record.private_verified='no';
    const key=recordFingerprint(record),explicit=record.review_key===key;
    const unchanged=!before||recordFingerprint(before)===key;
    if(workspace.shortlist.includes(record.id)&&!rulesChanged&&(unchanged||explicit)&&(!record.review_key||explicit)&&qualifier(record,workspace.rules,now).status==='fit')approved.add(record.id);
  }
  const drafts=Object.fromEntries(Object.entries(workspace.drafts).map(([id,draft])=>[id,{...draft,ready:draft.ready===true&&approved.has(id)}]));
  return {...workspace,prospects,suppressions:ledger,shortlist:workspace.shortlist.filter(id=>approved.has(id)),drafts};
}
