import {createHash} from 'node:crypto';

// Read search-provider evidence only; never fetch social pages or guess contacts.
const rolePattern=/\b(co[- ]?founder|founder|chief (?:executive|operating|technology|financial|marketing|revenue)(?: officer)?|ceo|coo|cto|cfo|cmo|cro|owner|(?:creative |executive |managing )?director|head of [\p{L} ]{2,35}|president|managing partner|hiring manager|principal|teacher|(?:real estate )?agent|realtor|(?:lead )?broker|dealer|consultant|(?:software |web |ai |machine learning )?(?:engineer|developer)|(?:graphic |product |web )?designer|recruiter)\b/iu;
const separators=/\s*[–—|·]\s*|\s+-\s+/u;
const platformName=/^(linkedin|facebook|instagram|x|twitter|profile|team|about|professional profile)$/i;
const genericName=/\b(company|companies|business|businesses|founders?|ceos?|chief|executive|directors?|owners?|school|teachers?|estate|realty|group|solutions|technologies|limited|ltd|llc|inc|top|best|private|people|directory|profiles?|jobs?|careers?|search|results|leadership|university|meet|interview|story|news|about|blog|contact|latest|our|board|team)\b/i;
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const pastRolePrefix=/\b(?:former|previous|previously|past|retired)\b|\bex[- ]$/i;

function sourceUrl(page){
  try{
    const url=new URL(page.url);
    if(url.protocol!=='https:'||url.username||url.password)return null;
    if(page.source&&clean(page.source).replace(/^www\./i,'').toLowerCase()!==url.hostname.replace(/^www\./i,'').toLowerCase())return null;
    return url;
  }catch{return null;}
}

function profileField(url){
  const host=url.hostname.replace(/^www\./,'').toLowerCase(),parts=url.pathname.split('/').filter(Boolean);
  if(/(^|\.)linkedin\.com$/.test(host))return parts.length===2&&parts[0]==='in'?'profile_url':'';
  if(host==='x.com'||host==='twitter.com')return parts.length===1&&/^[A-Za-z0-9_]{1,15}$/.test(parts[0])&&!/^(home|search|explore|notifications|messages|settings|intent|i)$/i.test(parts[0])?'x_url':'';
  if(host==='instagram.com')return parts.length===1&&/^[A-Za-z0-9_.]{1,30}$/.test(parts[0])&&!/^(p|reel|reels|stories|explore|accounts|direct)$/i.test(parts[0])?'instagram_url':'';
  if(host==='facebook.com'||host==='fb.com'){
    if(url.pathname==='/profile.php'&&/^\d+$/.test(url.searchParams.get('id')||''))return 'facebook_url';
    if(parts.length===3&&parts[0]==='people'&&/^\d+$/.test(parts[2]))return 'facebook_url';
    if(parts.length===1&&/^[A-Za-z0-9.]+$/.test(parts[0])&&!/^(posts|groups|pages|search|watch|reel|reels|events|marketplace|login|share|story.php|photo.php)$/i.test(parts[0]))return 'facebook_url';
  }
  return '';
}

function personName(value,{profile=false}={}){
  const name=clean(value).replace(/^(?:Dr\.?|Mr\.?|Mrs\.?|Ms\.?)\s+/i,'').replace(/,\s*(?:MBA|PhD|MD|CPA|MSc|BSc)(?:\b.*)?$/i,'').replace(profile?/\s*\(@[A-Za-z0-9_.]+\)\s*$/u:/$^/u,'');
  const tokens=name.split(' ');
  if(tokens.length<2||tokens.length>5||genericName.test(name))return '';
  if(tokens.some(token=>!/^\p{L}[\p{L}'’.-]*$/u.test(token)))return '';
  if(!profile&&tokens.some(token=>!/^\p{Lu}/u.test(token)))return '';
  return name;
}

function companyName(value,{explicit=false}={}){
  let company=clean(value);
  company=company.split(/[|·]/u)[0].replace(/\s+[–—-]\s+(?:LinkedIn|Facebook|Instagram|Twitter|X)$/iu,'');
  company=company.replace(/,\s+(?:a|an|the|I|we|they|he|she|where|which|who|based|located)\b.*$/iu,'').replace(/\.\s+[\p{Lu}].*$/u,'');
  if(/…|\.{3}/u.test(company))return '';
  company=company.replace(/[.,;:]+$/u,'').replace(/\s+(?:in|based in|located in|from)\s+.*$/iu,'').trim();
  if(!company||company.length>100||/^(?:self-employed|freelancer?|helping|serving|building|connecting|find|buy|sell|learn)\b/i.test(company)||(!explicit&&(platformName.test(company)||rolePattern.test(company)))||/^(?:a|an|the|my|our|your|their|his|her)\s+(?:private\s+)?(?:company|business|school|agency|profile|team)\b/i.test(company))return '';
  return company;
}

function roleAndCompany(text){
  const roleMatch=String(text).match(rolePattern);
  if(!roleMatch)return null;
  if(pastRolePrefix.test(String(text).slice(0,roleMatch.index)))return null;
  const after=String(text).slice(roleMatch.index).split(/\b(?:reporting to|reports to|working with|works with|supporting the|supports the)\b/iu)[0].trim();
  const relation=/^head of\b/i.test(after)?/(?:\b(?:at|with|for)|@)\s+([^|·–—;\n]+)/iu:/(?:\b(?:at|of|with|for)|@)\s+([^|·–—;\n]+)/iu;
  const relationMatch=after.match(relation),firstSegment=after.split(separators)[0];
  const explicit=relationMatch&&relationMatch.index<firstSegment.length?relationMatch:null;
  const stated=explicit?.[1]?.replace(/\.(?:\s+[\p{Lu}])(?!(?:Inc|Ltd|Co)\b).*$/u,'');
  const segment=after.split(separators)[0],comma=explicit?null:segment.match(/^(.+?),\s*(.+)$/u);
  let prefix=roleMatch[0];
  for(let tail=after.slice(prefix.length);;){
    const connector=tail.match(/^\s*(?:&|and|\/)\s*/iu);if(!connector)break;
    const next=tail.slice(connector[0].length).match(rolePattern);if(!next||next.index!==0)break;
    prefix+=connector[0]+next[0];tail=after.slice(prefix.length);
  }
  const sentence=explicit||comma?null:after.slice(prefix.length).match(/^\.\s+([^.;·|]+)\./u);
  const company=companyName(stated||comma?.[2]||sentence?.[1]||'',{explicit:Boolean(explicit)});
  const role=clean(comma?comma[1]:explicit?segment.slice(0,explicit.index):prefix).replace(/[.,;:]+$/u,'');
  return {title:role.length<=100?role:roleMatch[0],company};
}

export function parseSourceIdentity(page){
  const url=sourceUrl(page);if(!url)return null;
  const profile=Boolean(profileField(url)),description=clean(page.description);
  const title=clean(page.title).replace(profile?/\s*(?:\/|\||•)\s*(?:X|Twitter|Facebook|Instagram(?: photos and videos)?|LinkedIn)\s*$/iu:/$^/u,'');
  const segments=title.split(separators).filter(Boolean);
  let name=personName(segments[0],{profile});
  let body=segments.slice(1).filter(segment=>!platformName.test(segment));
  if(!name){
    const statement=description.match(/^([\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){1,4})[.:]\s+(.+)$/u);
    if(statement&&profile){name=personName(statement[1],{profile:true});body=[statement[2],...body];}
  }
  if(!name)return null;
  let evidence=roleAndCompany(body.join(' - '));
  if(!evidence&&body.some(segment=>{const role=segment.match(rolePattern);return role&&pastRolePrefix.test(segment.slice(0,role.index));}))return null;
  // Profile excerpts describe their named account. Other source excerpts must
  // explicitly repeat the name before a professional role can be attributed.
  if(!evidence&&(profile||description.toLocaleLowerCase().includes(name.toLocaleLowerCase())))evidence=roleAndCompany(description);
  if(!evidence)return null;
  let company=evidence.company;
  if(!company){
    const roleIndex=body.findIndex(segment=>rolePattern.test(segment));
    if(roleIndex>=0)company=companyName(body[roleIndex+1]||'');
  }
  if(!company&&(profile||description.toLocaleLowerCase().includes(name.toLocaleLowerCase()))){
    const snippetEvidence=roleAndCompany(description);
    const roleKeys=value=>[...clean(value).toLowerCase().replace(/chief executive(?: officer)?/g,'ceo').replace(/chief technology(?: officer)?/g,'cto').replace(/chief financial(?: officer)?/g,'cfo').replace(/chief operating(?: officer)?/g,'coo').replace(/chief marketing(?: officer)?/g,'cmo').replace(/chief revenue(?: officer)?/g,'cro').matchAll(new RegExp(rolePattern.source,'giu'))].map(match=>match[0]);
    if(snippetEvidence?.company&&roleKeys(evidence.title).some(role=>roleKeys(snippetEvidence.title).includes(role)))company=snippetEvidence.company;
  }
  if(!company&&profile){
    const experience=description.match(/\b(?:Experience|Company|Employer)\s*:\s*([^·|;]+?)(?=\s+(?:Location|Education|Connections|Followers)\s*:|[·|;]|$)/iu);
    company=companyName(experience?.[1]||'',{explicit:Boolean(experience)});
  }
  if(!company&&profile){
    const parts=description.split(separators);
    const roleIndex=parts.findIndex(part=>{const role=roleAndCompany(part);return role&&clean(part).toLowerCase()===role.title.toLowerCase();});
    if(roleIndex>=0)company=companyName(parts[roleIndex+1]||'');
  }
  if(!company&&!profile)return null;
  return {name,title:evidence.title,company};
}

export function personFromSource(page,assessment={}) {
  const identity=parseSourceIdentity(page);if(!identity)return null;
  const url=sourceUrl(page),field=profileField(url);
  const missing=[...new Set([...(assessment.missing||[]),...(!identity.company?['Company']:[])])];
  const email=clean(page.title+' '+page.description).match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)?.[0]||'';
  const id='source-'+createHash('sha256').update(url.href+'|'+identity.name.toLowerCase()).digest('hex').slice(0,20);
  return {id,...identity,...(field?{[field]:url.href}:{}),...(email?{email}:{}),source_url:url.href,source_title:clean(page.title),source_excerpt:clean(page.description),source:url.hostname,relevance:assessment.score||0,reason:assessment.reason||'',missing,identity_status:'source-asserted',contact_status:field?'public-profile':email?'public-email':'unknown',private_sector_status:'source-asserted'};
}
