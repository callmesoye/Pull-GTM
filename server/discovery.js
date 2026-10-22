import {personFromSource,parseSourceIdentity} from './person-evidence.js';
import {buildResearchTriage} from './research-triage.js';
import {canonicalProfile} from '../dist/prospect-records.js';
import {assessPrivateSector} from '../dist/prospect-policy.js';

const blockHost=/(^|\.)(gov|gouv|gc|go|edu|ac|mil)\.[a-z.]+$/i;
const blockWords=/\b(government|ministry|public university|state university|federal university|public school|public institution|state-owned|government-owned|civil service|regulator|commission|registry|parliament|municipal|council|national assembly)\b/i;
const privateEvidence=/\b(privately[- ]owned|private[- ]sector|private (business|company|companies|school|schools|clinic|hospital|practice|car dealership|dealership|agency)|independent (business|professional|consultant|trader)|self[- ]employed|sole proprietor)\b/i;
const commercialEvidence=/\b(agri(?:culture|business|cultural)|farming|farm|farms|real estate|property develop(?:er|ment)|property management|software|saas|technology|e[- ]?commerce|retail|wholesale|car dealership|automotive|auto dealer|construction|logistics|freight|manufacturing|fintech|financial services|insurance|hospitality|restaurant|travel agency|consult(?:ing|ancy)|creative agency|design agency|marketing agency|digital marketing|advertising|fashion|beauty|salon|distribution|energy|renewables|solar|telecommunications|telecom|food processing|food production|exports|imports|business services)\b/i;
const legalBusiness=/\b(ltd\.?|limited|llc|inc\.?|incorporated|plc|corp\.?|corporation|gmbh|pty|pvt)\b/i;
const ambiguousInstitution=/\b(university|college|polytechnic|school|academy|institute|hospital|clinic|health centre|health center|foundation|authority|commission|council|municipality|statutory|federal|national|public|central bank|reserve bank|national bank|agency of|department of)\b/i;
const roleGroups=[
  ['ceo','chief executive officer','chief executive'],['founder','co-founder','cofounder'],
  ['cfo','chief financial officer'],['cto','chief technology officer'],['coo','chief operating officer'],['cmo','chief marketing officer'],['cro','chief revenue officer'],
  ['owner','business owner','proprietor'],['director','managing director'],
  ['teacher','school teacher','educator'],['recruiter','hiring manager'],
  ['agent','real estate agent','realtor'],['dealer','car dealer','auto dealer']
];
const industryGroups=[['agriculture','agribusiness','agricultural','farming'],['real estate','property development','property management'],['used cars','used car','car dealership','automotive','auto dealer'],['technology','software','saas']];
const locationGroups=[['usa','us','united states','united states of america'],['uk','united kingdom','great britain'],['nyc','new york','new york city'],['uae','united arab emirates']];
const countryGroups=[['Nigeria'],['United States of America','United States','USA','US','U.S.'],['United Kingdom','Great Britain','UK','U.K.'],['Canada'],['Australia'],['Mexico'],['United Arab Emirates','UAE'],['Ghana'],['Kenya'],['South Africa'],['India'],['France'],['Germany'],['Brazil'],['Spain'],['Italy'],['China'],['Japan'],['Singapore'],['New Zealand'],['Ireland'],['Netherlands'],['Sweden'],['Norway'],['Denmark'],['Finland'],['Switzerland'],['Belgium'],['Portugal'],['Pakistan'],['Bangladesh'],['Indonesia'],['Malaysia'],['Philippines'],['Egypt'],['Saudi Arabia'],['Israel'],['Turkey'],['Uganda'],['Tanzania'],['Rwanda'],['Zambia'],['Zimbabwe'],['Morocco'],['Senegal'],['Cameroon']];
const profileHost=/(^|\.)(linkedin\.com|x\.com|twitter\.com|facebook\.com|instagram\.com)$/i;
const strip=value=>String(value??'').trim().replace(/\s+/g,' ');
const professionalDescription=value=>strip(value).replace(/\bEducation\s*:\s*.*?(?=\s*[·|;]|\s+\b(?:Location|Experience|Company|Employer|Connections|Followers)\s*:|$)/giu,'');
const stopWords=new Set(['a','an','and','are','at','by','for','from','in','is','near','of','on','or','the','to','with','who','want','need','buyers','people','business','businesses','private','company','companies']);
const singular=word=>word.length>4&&word.endsWith('ies')?word.slice(0,-3)+'y':word.length>4&&word.endsWith('s')&&!word.endsWith('ss')?word.slice(0,-1):word;
const words=value=>[...new Set((strip(value).toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu)||[]).filter(word=>!stopWords.has(word)).map(singular))];
const textWords=value=>new Set((strip(value).toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu)||[]).map(singular));
const matchingTerms=(text,query)=>{
  const groups=String(query).split(',').map(words).filter(group=>group.length);
  for(const group of groups){
    if(group.every(word=>text.has(word)))return group;
    const aliasGroup=[...roleGroups,...industryGroups,...locationGroups].find(aliases=>aliases.some(alias=>words(alias).join(' ')===group.join(' ')));
    const alias=aliasGroup?.map(words).find(terms=>terms.every(word=>text.has(word)));
    if(alias)return alias;
  }
  return [];
};

const escapePattern=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function phraseIn(text,phrase) {
  const exact=new RegExp('(?<![\\p{L}\\p{N}])'+escapePattern(phrase).replace(/\s+/g,'\\s+')+'(?![\\p{L}\\p{N}])',/^[A-Z.]{2,4}$/.test(phrase)?'u':'iu');
  return String(text).match(exact)?.[0]||'';
}
function actualLocationTerm(text,query) {
  const country=countryGroups.find(group=>group.some(alias=>alias.toLowerCase()===strip(query).toLowerCase()));
  const aliases=country||locationGroups.find(group=>group.some(alias=>alias.toLowerCase()===strip(query).toLowerCase()))||[strip(query)];
  return aliases.map(alias=>phraseIn(text,alias)).find(Boolean)||'';
}
function geographicEvidence(page,query) {
  const description=professionalDescription(page.description),raw=[page.title,description].join(' '),label=description.match(/\bLocation\s*:\s*([^·|;]+?)(?=\s+(?:Experience|Education|Connections|Followers)\s*:|[·|;]|$)/iu)?.[1];
  const excerpt=label?strip(label).replace(/\.\s+[A-Z].*$/u,'').slice(0,180):raw;
  const components=strip(query).split(',').map(strip).filter(Boolean),matches=components.map(part=>actualLocationTerm(excerpt,part));
  const requestedCountries=components.map(part=>countryGroups.find(group=>group.some(alias=>alias.toLowerCase()===part.toLowerCase()))).filter(Boolean);
  const observedCountries=countryGroups.map(group=>({group,value:group.map(alias=>phraseIn(excerpt,alias)).find(Boolean)})).filter(item=>item.value);
  const conflict=requestedCountries.length&&observedCountries.some(item=>!requestedCountries.includes(item.group));
  return {matches,eligible:components.length>0&&matches.every(Boolean)&&!conflict,location:label?strip(label).slice(0,180):matches.filter(Boolean).join(', '),country:observedCountries.length===1?observedCountries[0].value:'',conflict:Boolean(conflict)};
}

function sectorEvidence(page,identity) {
  const text=page.title+' '+professionalDescription(page.description);
  if(privateEvidence.test(text))return 'explicit-private-sector';
  // Institutions can be publicly owned even when their names sound commercial.
  if(identity&&ambiguousInstitution.test(identity.company))return null;
  if(identity?.company&&commercialEvidence.test(text))return 'commercial-business-context';
  if(!profileHost.test(page.source)&&commercialEvidence.test(text)&&legalBusiness.test(text)&&!ambiguousInstitution.test(page.title))return 'commercial-business-context';
  return null;
}

const sourceDomains={linkedin:'linkedin.com/in/',x:'x.com',twitter:'twitter.com',facebook:'facebook.com',instagram:'instagram.com',jiji:'jiji.ng',jumia:'jumia.com.ng'};
function sourceConstraint(value) {
  const source=strip(value).toLowerCase();
  if(!source||/^(?:(?:private|business|company|public) (?:websites?|sources?|businesses?)|any|all|web|website|websites)$/i.test(source))return '';
  if(/^(?:email|e-mail|email contacts?)$/.test(source))return '("email" OR "contact")';
  if(source.includes(',')){
    const sources=source.split(',').map(sourceConstraint).filter(Boolean);
    return sources.length?'('+sources.join(' OR ')+')':'';
  }
  if(sourceDomains[source])return 'site:'+sourceDomains[source];
  try {const url=new URL(source.includes('://')?source:'https://'+source);if(/^[\w.-]+\.[a-z]{2,}$/i.test(url.hostname))return 'site:'+url.hostname+url.pathname.replace(/\/$/,'');}catch{}
  return source.replace(/["()]/g,'');
}
function matchesSourceSite(value,site) {
  try {
    const actual=new URL(value),expected=new URL('https://'+site),host=actual.hostname.toLowerCase().replace(/\.$/,''),wanted=expected.hostname.toLowerCase().replace(/\.$/,'');
    if(!['https:','http:'].includes(actual.protocol)||actual.username||actual.password||!(host===wanted||host.endsWith('.'+wanted)))return false;
    const path=expected.pathname.replace(/\/$/,'');
    return !path||actual.pathname===path||actual.pathname.startsWith(path+'/');
  }catch{return false;}
}
function matchesPreferredSource(page,value) {
  return strip(value).split(',').some(part=>{
    const constraint=sourceConstraint(part),source=strip(part).toLowerCase();
    if(!constraint)return false;
    const sites=[...constraint.matchAll(/site:([^\s)]+)/g)].map(match=>match[1]);
    if(sites.length)return sites.some(site=>matchesSourceSite(page.url,site));
    if(/^email|^e-mail/.test(source))return /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(page.description);
    return [page.source,page.title,page.description].some(value=>String(value).toLowerCase().includes(source));
  });
}
function audienceQuery(value) {
  const aliases=[];
  for(const part of strip(value).split(',')){
    const canonical=words(part).join(' '), group=roleGroups.find(group=>group.some(alias=>words(alias).join(' ')===canonical));
    for(const term of group||[strip(part)])if(term&&!aliases.includes(term))aliases.push(term);
  }
  return aliases.length>1?'('+aliases.map(term=>'"'+term.replace(/"/g,'')+'"').join(' OR ')+')':aliases[0]||'';
}
export function discoveryQueries(input) {
  const role=audienceQuery(input.audience), source=sourceConstraint(input.source), topic=strip(input.industry).replace(/["()]/g,''), location=strip(input.location).replace(/["()]/g,'');
  const base=[role,topic,location].filter(Boolean).join(' ');
  return source?[base+' '+source,base+' '+source+' leadership',base+' '+source+' company']:[base,base+' site:linkedin.com/in/',base+' leadership team'];
}

function simpleDiscoveryQuery(input,{profile=false,leadership=false}={}) {
  const source=strip(input.source),constraint=sourceConstraint(source);
  const simpleSource=constraint?source.replace(/https?:\/\/|www\./gi,'').replace(/["():/]/g,' '):'';
  return [input.location,input.industry,strip(input.audience).split(',')[0],simpleSource|| (profile?'LinkedIn':''),leadership?'leadership':''].filter(Boolean).join(' ').replace(/[,"():]/g,' ').replace(/\s+/g,' ').trim().slice(0,500);
}

async function searchProviderError(response) {
  let message='';
  // Read at most 4 KB of an error response. Never propagate provider text or keys.
  const reader=response.body?.getReader?.();
  if(reader){
    const decoder=new TextDecoder();let bytes=0,text='';
    try {
      while(bytes<4096){const {done,value}=await reader.read();if(done)break;const chunk=value.subarray(0,4096-bytes);bytes+=chunk.length;text+=decoder.decode(chunk,{stream:true});if(bytes>=4096){await reader.cancel();break;}}
      text+=decoder.decode();
      try {message=String(JSON.parse(text)?.message||'');}catch{}
    }catch{}finally{reader.releaseLock();}
  }
  let code='PROVIDER_UNAVAILABLE',description='Source search is temporarily unavailable.';
  if(response.status===401||response.status===403){code='KEY_REJECTED';description='The search-provider key was rejected. Check the active key in server settings.';}
  else if(response.status===402){code='CREDITS_EXHAUSTED';description='The search-provider account has no search credits available. Search stopped; wait for free quota to renew or use another authorized key.';}
  else if(response.status===429){code='RATE_LIMITED';description='Search limit reached. Try again later.';}
  else if(response.status===400&&/query pattern not allowed|query.*restricted|not allowed for free accounts/i.test(message)){code='QUERY_RESTRICTED';description='The search provider restricts this query on its free plan. The supported query alternatives could not complete the search.';}
  else if(response.status===400){code='QUERY_REJECTED';description='The search provider rejected this query. Simplify the audience, industry, location, or source.';}
  const error=new Error(description);error.code=code;error.providerStatus=response.status;return error;
}

export function assessSourceRelevance(page,input) {
  const text=textWords([page.title,professionalDescription(page.description)].join(' '));
  const identity=parseSourceIdentity(page),geography=geographicEvidence(page,input.location);
  const dimensions=[['Audience',input.audience],['Industry or need',input.industry]];
  const matched=[],missing=[];
  for(const [label,query] of dimensions){
    const hits=matchingTerms(label==='Audience'&&identity?textWords(identity.title):text,query);
    if(hits.length)matched.push({label,terms:hits});else missing.push(label);
  }
  if(geography.eligible)matched.push({label:'Location',terms:geography.matches});else missing.push('Location');
  const constraint=sourceConstraint(input.source),source=constraint?strip(input.source).toLowerCase():'';
  const sourceMatched=Boolean(source&&matchesPreferredSource(page,input.source));
  if(source&&sourceMatched)matched.push({label:'Preferred source',terms:[source]});
  if(source&&!sourceMatched)missing.push('Preferred source');
  const topic=matched.some(item=>item.label==='Audience'||item.label==='Industry or need');
  const score=(matched.some(item=>item.label==='Audience')?3:0)+(matched.some(item=>item.label==='Industry or need')?3:0)+(matched.some(item=>item.label==='Location')?2:0)+(sourceMatched?2:0);
  return {eligible:topic,score,matched,missing,geography,reason:matched.map(item=>`${item.label}: ${item.terms.join(', ')}`).join(' · ')||'No search terms confirmed in the source excerpt'};
}

export function searchConfiguration(env=process.env) {
  const provider=env.PULL_SEARCH_PROVIDER||(env.EXA_API_KEY?'exa':env.SERPER_API_KEY?'serper':'brave');
  if(!['exa','serper','brave'].includes(provider))return null;
  const key=strip(provider==='exa'?env.EXA_API_KEY:provider==='serper'?env.SERPER_API_KEY:env.BRAVE_SEARCH_API_KEY);
  if(!key)return null;
  const requested=Number(env.PULL_SEARCH_MAX_QUERIES||8);
  return {provider,key,maxQueries:Number.isInteger(requested)&&requested>=1&&requested<=12?requested:8,...(provider==='serper'?{queryMode:strip(env.PULL_SERPER_QUERY_MODE).toLowerCase()==='auto'?'auto':'plain'}:{})};
}

export function discoveryInput(body) {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Enter a search goal.');
  const allowed=['audience','industry','location','source','limit'];
  if(Object.keys(body).some(key=>!allowed.includes(key)))throw new Error('Use the audience, industry, location, and private source fields.');
  const input=Object.fromEntries(allowed.map(key=>[key,strip(body[key])]));
  for(const key of ['audience','industry','location'])if(!input[key]||input[key].length>120)throw new Error('Enter a concise audience, industry, and location.');
  if(input.source.length>120)throw new Error('Keep the source name short.');
  if(blockWords.test([input.audience,input.industry,input.source].join(' '))||/(^|[/.])(gov|gouv|gc|go|ac|mil|edu)(\.|\/|$)/i.test(input.source))throw new Error('Choose a private business, independent professional, or private-sector opportunity.');
  const limit=Number(body.limit||30);
  if(!Number.isInteger(limit)||limit<1||limit>50)throw new Error('Choose between 1 and 50 candidates.');
  return {...input,limit};
}

function safeSourcePage(row) {
  try {
    const url=new URL(row.url);
    if(url.protocol!=='https:'||url.username||url.password||blockHost.test(url.hostname)||/\.(gov|mil|edu)(\.|$)/i.test(url.hostname))return null;
    const title=strip(row.title).slice(0,240),description=strip(row.description).slice(0,900);
    if(!title||blockWords.test(title+' '+professionalDescription(description)+' '+url.hostname))return null;
    url.hash='';
    for(const key of [...url.searchParams.keys()])if(/^utm_|^(?:trk|trackingId|gclid|fbclid)$/i.test(key))url.searchParams.delete(key);
    const page={title,url:url.href,description,source:url.hostname};
    const identity=parseSourceIdentity(page);
    // Reuse public-employer/domain and unsafe-URL exclusions. This temporary
    // flag only selects the URL/sector check; it is never stored or returned.
    // Private ownership still requires source evidence and the owner's review.
    if(assessPrivateSector({...identity,source_url:page.url,source_title:title,source_excerpt:description,private_verified:'yes'}).status!=='eligible')return null;
    return page;
  }catch{return null;}
}

export function privateSourcePage(row) {
  const page=safeSourcePage(row);if(!page)return null;
  const basis=sectorEvidence(page,parseSourceIdentity(page));
  return basis?{...page,private_sector_basis:basis}:null;
}

// Apply exclusions again after contacts and geography have been extracted.
// The temporary flag checks prohibited evidence without marking ownership as reviewed.
const permittedDiscoveryPerson=person=>assessPrivateSector({...person,private_verified:'yes'}).status==='eligible';

// Used while retrieving and when assembling the result: progress counts only
// named people who satisfy the original filters, never topical source pages.
function personEvidence(candidate,input,assessment) {
  const person=personFromSource(candidate,assessment);
  if(!person?.company)return {diagnostic:'missingIdentity'};
  if(!matchingTerms(textWords(person.title),input.audience).length||assessment.missing.some(label=>['Audience','Industry or need','Location','Preferred source'].includes(label)))return {diagnostic:'missingTargetEvidence'};
  const industryTerms=assessment.matched.find(item=>item.label==='Industry or need')?.terms||[];
  const industry=phraseIn(candidate.title+' '+professionalDescription(candidate.description),industryTerms.join(' '));
  if(!industry)return {diagnostic:'missingTargetEvidence'};
  const result={...person,industry,location:assessment.geography.location,country:assessment.geography.country,private_sector_basis:candidate.private_sector_basis};
  return permittedDiscoveryPerson(result)?{person:result}:{diagnostic:'excludedSectorOrSource'};
}

function personKeys(person) {
  const employer=strip(person.company).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\b(?:ltd|limited|llc|inc|incorporated|corp|corporation)\b/g,'').replace(/\s+/g,' ').trim();
  const name='name:'+strip(person.name).normalize('NFKC').toLowerCase()+'|'+employer;
  const profiles=[...new Set(['profile_url','linkedin_url','x_url','instagram_url','facebook_url'].map(field=>canonicalDiscoveryProfile(person[field])).filter(Boolean).map(url=>'profile:'+url))];
  return {name,profiles};
}

function indexPerson(person,index) {
  const keys=personKeys(person),profileMatches=new Set(keys.profiles.flatMap(key=>[...(index.get(key)||[])])),nameMatches=index.get(keys.name)||new Set();
  // Multiple profile owners or an unnamed profile choice cannot establish a
  // new unique person. Keep their source candidate for review without counting.
  if(profileMatches.size>1||!keys.profiles.length&&nameMatches.size>1)return 'ambiguous';
  let existing=[...profileMatches][0];
  if(!existing&&nameMatches.size===1){
    const candidate=[...nameMatches][0];
    // Two distinct stated profiles can belong to same-name coworkers. A name
    // fallback is usable only when one side has no profile and is unambiguous.
    if(!keys.profiles.length||!candidate.profiles.size)existing=candidate;
  }
  const entry=existing||{profiles:new Set()};
  for(const key of [keys.name,...keys.profiles]){
    if(!index.has(key))index.set(key,new Set());index.get(key).add(entry);
  }
  keys.profiles.forEach(key=>entry.profiles.add(key));
  // Register aliases even when the same profile reports another name/employer;
  // that evidence never adds a second count for an already-seen profile.
  return existing?'duplicate':'added';
}

// Variants retain the original filters; equivalent titles/industries change
// retrieval vocabulary only. Assessment still applies the unmodified input.
function queryVariants(value,groups) {
  const explicit=strip(value).split(',').map(strip).filter(Boolean),result=[...explicit];
  for(const part of explicit){
    const group=groups.find(group=>group.some(term=>words(term).join(' ')===words(part).join(' ')));
    for(const term of group||[])if(!result.some(value=>value.toLowerCase()===term.toLowerCase()))result.push(term);
  }
  return result;
}
function exaSourceDomains(value) {
  if(!strip(value))return [];
  return [...new Set(strip(value).split(',').flatMap(part=>{
    const constraint=sourceConstraint(part);
    return /^site:[^ ()]+$/.test(constraint)?[constraint.slice(5)]:[];
  }))];
}
function exaNaturalQuery(input,{audience=input.audience,industry=input.industry,source=input.source,leadership=false}={}) {
  return `Find ${leadership?'current leadership profiles for':'named professionals working as'} ${strip(audience)} at private-sector businesses in ${strip(industry)}, personally based in ${strip(input.location)}.${sourceConstraint(source)?' Use '+strip(source)+' as the profile source.':''} Require source evidence for their current role, employer, industry, and personal location.`.slice(0,700);
}
function exaRetrievalQueries(input) {
  const sources=sourceConstraint(input.source)?strip(input.source).split(',').map(strip).filter(Boolean):[''];
  const roles=queryVariants(input.audience,roleGroups),industries=queryVariants(input.industry,industryGroups);
  const groups=sources.map((source,group)=>{
    const variants=[...roles.map(audience=>exaNaturalQuery(input,{audience,source})),...industries.slice(1).map(industry=>exaNaturalQuery(input,{industry,source})),exaNaturalQuery(input,{source,leadership:true})];
    return [...new Set(variants)].map((query,variant)=>({query,group,variant,page:1,exhausted:false,seen:new Set(),yield:0}));
  });
  return Array.from({length:Math.max(...groups.map(group=>group.length))},(_,index)=>groups.map(group=>group[index]).filter(Boolean)).flat();
}
function retrievalQueries(input,provider) {
  if(provider==='exa')return exaRetrievalQueries(input);
  const hasSource=Boolean(sourceConstraint(input.source)),sources=hasSource?strip(input.source).split(',').map(strip).filter(Boolean):[''];
  const roles=queryVariants(input.audience,roleGroups),industries=queryVariants(input.industry,industryGroups);
  const groups=sources.map((source,group)=>{
    const scoped={...input,source},primary=provider==='serper'?simpleDiscoveryQuery(scoped,{profile:!hasSource}):discoveryQueries(scoped)[0];
    const variants=[primary];
    if(!hasSource)variants.push(provider==='serper'?simpleDiscoveryQuery(scoped,{leadership:true}):discoveryQueries(scoped)[2],simpleDiscoveryQuery(scoped));
    for(const audience of roles.slice(1))variants.push(provider==='serper'?simpleDiscoveryQuery({...scoped,audience},{profile:!hasSource}):discoveryQueries({...scoped,audience})[0]);
    for(const industry of industries.slice(1))variants.push(provider==='serper'?simpleDiscoveryQuery({...scoped,industry},{profile:!hasSource}):discoveryQueries({...scoped,industry})[0]);
    if(hasSource)variants.push(simpleDiscoveryQuery(scoped,{leadership:true})+' leadership team');
    const site=sourceConstraint(source||'linkedin'),sourceText=simpleDiscoveryQuery({audience:'',industry:'',location:'',source},{profile:!hasSource});
    return [...new Set(variants.map(query=>query.slice(0,500)))].map((query,variant)=>({query,precise:provider==='serper'&&(hasSource||variant!==2)&&/^site:[^ ()]+$/.test(site)?(query.replace(new RegExp('(?:^|\\s)'+escapePattern(sourceText)+'(?=\\s|$)','i'),' ').replace(/\s+/g,' ').trim()+' '+site).slice(0,500):query,group,variant,page:1,exhausted:false,seen:new Set(),yield:0}));
  });
  // Each chosen source and each explicitly selected audience gets a fair turn.
  return Array.from({length:Math.max(...groups.map(group=>group.length))},(_,index)=>groups.map(group=>group[index]).filter(Boolean)).flat();
}

const employerKey=value=>strip(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\b(?:ltd|limited|llc|inc|incorporated|corp|corporation|plc)\b/g,'').replace(/\s+/g,' ').trim();
function corroborationCandidate(page,input) {
  const identity=parseSourceIdentity(page);if(!identity?.company||employerKey(identity.company).split(' ').length<2)return null;
  if(ambiguousInstitution.test(identity.company)&&!privateEvidence.test(page.title+' '+professionalDescription(page.description)))return null;
  const assessment=assessSourceRelevance(page,input);
  // Employer evidence cannot establish a person's role, city, or country.
  if(assessment.missing.some(label=>['Audience','Location','Preferred source'].includes(label)))return null;
  if(!matchingTerms(textWords(identity.title),input.audience).length)return null;
  return {page,identity,assessment};
}
function employerSupport(page,company,input) {
  const safe=privateSourcePage(page);if(!safe)return null;
  const heading=strip(safe.title).split(/\s*[|·–—]\s*|\s+-\s+/u)[0].replace(/^(?:About|Welcome to)\s+/i,'');
  if(employerKey(heading)!==employerKey(company)||parseSourceIdentity(safe))return null;
  // Do not use another person's social profile as company corroboration.
  if(profileHost.test(safe.source)&&!/^https:\/\/(?:[a-z]+\.)?linkedin\.com\/company\//i.test(safe.url))return null;
  const terms=matchingTerms(textWords(safe.title+' '+professionalDescription(safe.description)),input.industry);
  const industry=terms.length?phraseIn(safe.title+' '+professionalDescription(safe.description),terms.join(' ')):'';
  if(!industry||!geographicEvidence(safe,input.location).eligible)return null;
  return {...safe,industry};
}

function canonicalDiscoveryProfile(value) {
  try{const url=new URL(value);if(/(^|\.)linkedin\.com$/i.test(url.hostname))url.hostname='linkedin.com';return canonicalProfile(url.href);}catch{return '';}
}
function personalProfileKey(page) {
  const person=personFromSource(page);if(!person)return '';
  const profile=['profile_url','x_url','instagram_url','facebook_url'].map(field=>person[field]).find(Boolean);if(!profile)return '';
  return canonicalDiscoveryProfile(profile);
}
function observedProfileLocation(page) {
  const description=professionalDescription(page.description),label=description.match(/\bLocation\s*:\s*([^·|;]+?)(?=\s+(?:Experience|Education|Connections|Followers)\s*:|[·|;]|$)/iu)?.[1];
  return strip(label||'').toLowerCase();
}
function mergeProfileEvidence(previous,current,input) {
  const key=personalProfileKey(previous);
  if(!key||key!==personalProfileKey(current))return null;
  const before=parseSourceIdentity(previous),after=parseSourceIdentity(current);
  if(!before?.company||!after?.company||strip(before.name).toLowerCase()!==strip(after.name).toLowerCase()||employerKey(before.company)!==employerKey(after.company))return null;
  if(!matchingTerms(textWords(before.title),input.audience).length||!matchingTerms(textWords(after.title),input.audience).length)return null;
  const oldLocation=observedProfileLocation(previous),newLocation=observedProfileLocation(current);
  // Labeled locations must agree. A later snippet may supply a missing personal
  // location, but employer headquarters and conflicting locations never join.
  if(oldLocation&&newLocation&&oldLocation!==newLocation)return null;
  const countries=page=>countryGroups.filter(group=>group.some(alias=>phraseIn(professionalDescription(page.description),alias)));
  const firstCountries=countries(previous),nextCountries=countries(current);
  if(firstCountries.length&&nextCountries.length&&firstCountries.some(group=>!nextCountries.includes(group)))return null;
  const excerpts=[...new Set([...(previous.profile_excerpts||[{url:previous.url,title:previous.title,excerpt:previous.description}]),{url:current.url,title:current.title,excerpt:current.description}].map(item=>JSON.stringify(item)))].map(value=>JSON.parse(value));
  if(excerpts.length===(previous.profile_excerpts?.length||1))return null;
  // Both title/snippet pairs identify the same profile, role, and employer.
  // Keep the original excerpts alongside the composed assessment evidence.
  const description=[...new Set(excerpts.map(item=>professionalDescription(item.excerpt)))].join(' · ');
  return {...current,description,profile_excerpts:excerpts};
}
function profileResearchCandidate(page,input) {
  if(!personalProfileKey(page))return null;
  const identity=parseSourceIdentity(page);if(!identity?.company||ambiguousInstitution.test(identity.company))return null;
  if(!matchingTerms(textWords(identity.title),input.audience).length)return null;
  const assessment=assessSourceRelevance(page,input);
  if(assessment.missing.includes('Preferred source')||!assessment.missing.some(label=>['Industry or need','Location'].includes(label)))return null;
  if(!assessment.matched.some(item=>['Industry or need','Location'].includes(item.label)))return null;
  return {page,identity};
}
function inspectableProfileEvidence(person,page) {
  if(!page.profile_excerpts)return person;
  const primary=page.profile_excerpts.at(-1);
  return {...person,source_excerpt:primary.excerpt,supporting_sources:[...(person.supporting_sources||[]),...page.profile_excerpts.slice(0,-1).map(item=>({...item,supports:['Same-profile audience, employer, industry, or personal location evidence']}))]};
}

export async function discoverPrivatePages(input,{key,provider='brave',maxQueries=8,maxDurationMs=45000,queryMode='plain',beforeRequest,transport=fetch}={}) {
  if(!key)return {configured:false,candidates:[],people:[],notice:'Live prospect discovery needs a search-provider key. Your imported list and local audience review still work.'};
  if(!['exa','brave','serper'].includes(provider))throw new Error('Choose a supported search provider in the server settings.');
  if(!['plain','auto'].includes(queryMode))throw new Error('Choose plain or auto Serper queries in the server settings.');
  if(!Number.isInteger(maxQueries)||maxQueries<1||maxQueries>12)throw new Error('Choose a request budget between 1 and 12.');
  if(!Number.isInteger(maxDurationMs)||maxDurationMs<1||maxDurationMs>45000)throw new Error('Choose a search timeout between 1 and 45000 milliseconds.');
  const hasSource=Boolean(sourceConstraint(input.source)),queries=retrievalQueries(input,provider),deadline=Date.now()+maxDurationMs;
  const count=Math.min(Math.max(input.limit*3,10),provider==='serper'?50:20);
  const seen=new Map(),peopleIndex=new Map(),candidates=[],people=[],attempted=new Set(),pending=new Map(),supportCache=new Map(),corroborationTried=new Set(),profileResearch=new Map(),profileResearchTried=new Set();
  const diagnostics={providerResults:0,duplicateSources:0,duplicatePeople:0,ambiguousIdentity:0,excludedSectorOrSource:0,unrelatedSources:0,missingIdentity:0,missingTargetEvidence:0,corroboratedPeople:0,corroborationRequests:0,failedRequests:[],partial:false};
  let requestsUsed=0,successfulRequests=0,restrictedError=null,active=queries[0],stopReason='',lastGroup=-1,preciseSources=provider==='serper'&&queryMode==='auto',restrictionFallbackUsed=false;
  const addPerson=person=>{
    if(!permittedDiscoveryPerson(person)){diagnostics.excludedSectorOrSource++;return false;}
    const identity=indexPerson(person,peopleIndex);
    if(identity==='duplicate'){diagnostics.duplicatePeople++;return false;}
    if(identity==='ambiguous'){diagnostics.ambiguousIdentity++;return false;}
    people.push(person);return true;
  };
  const applySupport=(item,support)=>{
    const person=personFromSource(item.page,item.assessment);if(!person)return false;
    const supports=['Industry or need',...(!sectorEvidence(item.page,item.identity)?['Private-sector context']:[])];
    const enriched={...person,industry:support.industry,location:item.assessment.geography.location,country:item.assessment.geography.country,private_sector_basis:'corroborated-commercial-business-context',missing:person.missing.filter(label=>label!=='Industry or need'),reason:person.reason+' · Industry or need: employer source',supporting_sources:[{url:support.url,title:support.title,excerpt:support.description,supports}]};
    if(addPerson(inspectableProfileEvidence(enriched,item.page))){diagnostics.corroboratedPeople++;return true;}return false;
  };
  const nextQuery=()=>{
    const available=queries.filter(query=>!query.exhausted&&!attempted.has(query.query+'|'+query.page));
    const first=available.filter(query=>query.page===1).sort((a,b)=>a.variant-b.variant||a.group-b.group);
    return first.find(query=>query.group!==lastGroup)||first[0]||available.sort((a,b)=>a.page-b.page)[0];
  };
  const nextCorroboration=()=>{
    // Group shared employers so one evidence request can resolve several people.
    const choices=[...pending].filter(([company])=>!corroborationTried.has(company)).sort((a,b)=>b[1].length-a[1].length);
    const selected=choices[0];if(!selected)return null;
    const [company,items]=selected;
    return {query:[items[0].identity.company,input.industry,input.location,'company'].join(' ').replace(/["():,]/g,' ').replace(/\s+/g,' ').slice(0,500),page:1,company,corroboration:true,seen:new Set()};
  };
  const nextProfileResearch=()=>{
    // Spend at most two calls on named profiles; every one already has an
    // attributable role/employer and at least one requested context dimension.
    if(profileResearchTried.size>=2)return null;
    const entry=[...profileResearch].find(([key])=>!profileResearchTried.has(key));if(!entry)return null;
    const [key,item]=entry,query=[item.identity.name,item.identity.company,input.audience.split(',')[0],input.industry,input.location,item.page.source.replace(/^(?:www\.|[a-z]{2}\.)/i,'')].join(' ').replace(/["():,/]/g,' ').replace(/\s+/g,' ').trim().slice(0,500);
    return {query,precise:query.replace(/\s+[^\s]+\.com$/i,'')+' site:'+new URL(item.page.url).host+new URL(item.page.url).pathname,page:1,group:-2,variant:0,exhausted:false,seen:new Set(),profileResearchKey:key};
  };
  while(active&&requestsUsed<maxQueries&&people.length<input.limit) {
    if(Date.now()>=deadline){stopReason='time_budget_reached';break;}
    if(beforeRequest){
      try{if(await beforeRequest()===false){stopReason='daily_budget_reached';break;}}
      catch{
        if(!successfulRequests)throw new Error('Search budget controls are unavailable. No further search credits were used.');
        diagnostics.budgetUnavailable=true;stopReason='budget_unavailable';break;
      }
    }
    if(Date.now()>=deadline){stopReason='time_budget_reached';break;}
    const {page}=active,query=provider==='exa'&&(active.corroboration||active.profileResearchKey)?`Find original private-sector professional or employer sources about ${active.query}. Require attributable current role, employer, industry, and personal location evidence.`:preciseSources?active.precise||active.query:active.query,endpoint=new URL(provider==='exa'?'https://api.exa.ai/search':provider==='serper'?'https://google.serper.dev/search':'https://api.search.brave.com/res/v1/web/search');
    if(provider==='brave'){
      endpoint.searchParams.set('q',query);endpoint.searchParams.set('count',String(count));endpoint.searchParams.set('safesearch','strict');endpoint.searchParams.set('extra_snippets','true');
      if(page>1)endpoint.searchParams.set('offset',String(page-1));
    }
    const headers=provider==='exa'?{'x-api-key':key,'Content-Type':'application/json','Accept':'application/json'}:provider==='serper'?{'X-API-KEY':key,'Content-Type':'application/json','Accept':'application/json'}:{'X-Subscription-Token':key,'Accept':'application/json'};
    // Employer evidence can come from the employer's private website. The
    // selected source remains mandatory for every returned prospect profile.
    const domains=provider==='exa'&&!active.corroboration?exaSourceDomains(input.source):[];
    const payload=provider==='exa'?{query,type:'auto',numResults:count,contents:{highlights:true},...(domains.length?{includeDomains:domains}:{})}:provider==='serper'?{q:query,num:count,...(page>1?{page}:{})}:null;
    attempted.add(active.query+'|'+page);requestsUsed++;
    if(active.profileResearchKey)profileResearchTried.add(active.profileResearchKey);
    if(active.corroboration){corroborationTried.add(active.company);diagnostics.corroborationRequests++;}
    let rows,moreResults;
    try {
      const response=await transport(endpoint,{method:provider==='brave'?'GET':'POST',headers,...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-Date.now()))),redirect:'error'});
      if(!response.ok)throw await searchProviderError(response);
      const data=await response.json(),rawRows=provider==='exa'?data?.results:provider==='serper'?data?.organic:data?.web?.results;
      if(rawRows!==undefined&&!Array.isArray(rawRows))throw new Error('The search provider returned an unexpected result.');
      rows=provider==='exa'?(rawRows||[]).map(row=>({title:row?.title,url:row?.url,description:(Array.isArray(row?.highlights)?row.highlights:[]).filter(value=>typeof value==='string').map(strip).join(' · ')})):provider==='serper'?(rawRows||[]).map(row=>({title:row?.title,url:row?.link,description:[row?.snippet,row?.subtitle].filter(value=>typeof value==='string').map(strip).join(' · ')})):(rawRows||[]).map(row=>({...row,description:[row.description,...(Array.isArray(row.extra_snippets)?row.extra_snippets:[])].filter(value=>typeof value==='string').map(strip).join(' · ')}));
      moreResults=provider==='brave'?data?.query?.more_results_available:undefined;
      successfulRequests++;
    }catch(error){
      diagnostics.failedRequests.push({code:error.code||'PROVIDER_UNAVAILABLE',status:error.providerStatus||null});
      if(Date.now()>=deadline){diagnostics.partial=true;stopReason='time_budget_reached';break;}
      if(error.code==='QUERY_RESTRICTED'){
        restrictedError=error;diagnostics.partial=true;
        if(restrictionFallbackUsed){if(!successfulRequests)throw error;stopReason='provider_unavailable';break;}
        restrictionFallbackUsed=true;preciseSources=false;diagnostics.sourceOperatorsRestricted=true;
        if(query!==active.query){attempted.delete(active.query+'|'+page);continue;}
        active.exhausted=true;
        const fallback=[simpleDiscoveryQuery({...input,source:''}),simpleDiscoveryQuery({...input,source:''},{leadership:true}),simpleDiscoveryQuery({...input,source:''},{profile:true})].find(q=>!attempted.has(q+'|1'));
        if(fallback){active={query:fallback,group:-1,variant:0,page:1,exhausted:false,seen:new Set(),fallback:true};queries.unshift(active);}else active=nextQuery();
        continue;
      }
      if(!successfulRequests){if(error.code)throw error;throw new Error('Source search is temporarily unavailable.');}
      diagnostics.partial=true;stopReason=error.code==='CREDITS_EXHAUSTED'?'provider_credits_exhausted':'provider_unavailable';break;
    }
    diagnostics.providerResults+=rows.length;
    if(active.corroboration){
      const items=pending.get(active.company)||[];
      const support=rows.map(row=>employerSupport(row,items[0]?.identity.company,input)).find(Boolean);
      if(support){supportCache.set(active.company,support);for(const item of items)applySupport(item,support);pending.delete(active.company);}
      active=nextQuery()||nextCorroboration();continue;
    }
    const before=people.length;let freshRows=0;
    lastGroup=active.group;
    for(const row of rows) {
      const rawKey=strip(row?.url)||strip(row?.title);
      if(rawKey&&!active.seen.has(rawKey)){freshRows++;active.seen.add(rawKey);}
      let safe=safeSourcePage(row);
      if(!safe){diagnostics.excludedSectorOrSource++;continue;}
      const sourceKey=personalProfileKey(safe)||safe.url,previous=seen.get(sourceKey);
      if(previous){
        diagnostics.duplicateSources++;
        const merged=mergeProfileEvidence(previous,safe,input);
        if(!merged){
          const duplicate=personFromSource(safe),keys=duplicate&&personKeys(duplicate);
          if(keys?.profiles.some(key=>peopleIndex.has(key))&&indexPerson(duplicate,peopleIndex)==='duplicate')diagnostics.duplicatePeople++;
          continue;
        }
        safe=merged;diagnostics.mergedProfileEvidence=(diagnostics.mergedProfileEvidence||0)+1;
      }
      seen.set(sourceKey,safe);
      const research=profileResearchCandidate(safe,input);if(research)profileResearch.set(sourceKey,research);else profileResearch.delete(sourceKey);
      const basis=sectorEvidence(safe,parseSourceIdentity(safe)),candidate=basis?{...safe,private_sector_basis:basis}:null,assessment=assessSourceRelevance(safe,input);
      const staged=corroborationCandidate(safe,input);
      if(staged&&(!candidate||assessment.missing.includes('Industry or need'))){
        const company=employerKey(staged.identity.company),support=supportCache.get(company);
        if(support){applySupport(staged,support);continue;}
        if(!pending.has(company))pending.set(company,[]);pending.get(company).push(staged);
      }
      if(!candidate){diagnostics.excludedSectorOrSource++;continue;}
      if(!assessment.eligible){diagnostics.unrelatedSources++;continue;}
      candidates.push({...candidate,relevance:assessment.score,matched:assessment.matched,missing:assessment.missing,reason:assessment.reason});
      const extracted=personEvidence(candidate,input,assessment);
      if(!extracted.person){diagnostics[extracted.diagnostic]++;continue;}
      addPerson(inspectableProfileEvidence(extracted.person,safe));
    }
    const added=people.length-before;
    active.yield=added;
    // Brave documents a hard offset ceiling of 9. Empty/repeated pages end only
    // this query; other requested roles, aliases, and sources still get a turn.
    if(provider==='exa'||!rows.length||!freshRows||moreResults===false||provider==='brave'&&page>=10)active.exhausted=true;
    else active.page++;
    if(people.length>=input.limit)break;
    const untriedSource=queries.find(q=>q.group!==active.group&&q.variant===0&&!q.exhausted&&!attempted.has(q.query+'|'+q.page));
    const support=nextCorroboration();
    // Productive source pages continue; noisy or duplicate pages move to new
    // vocabulary. Shared-employer evidence is useful before more blind paging.
    const sharedSupport=support&&(pending.get(support.company)||[]).length>1?support:null;
    const productive=!active.exhausted&&added>0&&(hasSource||rows.length>=count||moreResults===true)?active:null;
    active=untriedSource||sharedSupport||productive||support||nextProfileResearch()||nextQuery();
  }
  if(!successfulRequests&&restrictedError&&!stopReason)throw restrictedError;
  candidates.sort((a,b)=>b.relevance-a.relevance||a.title.localeCompare(b.title));
  people.sort((a,b)=>b.relevance-a.relevance||a.name.localeCompare(b.name));
  const selected=people.slice(0,input.limit),remaining=Math.max(0,input.limit-selected.length),exhausted=!nextQuery()&&!nextCorroboration()&&!nextProfileResearch(),failedBeforeExhaustion=Boolean(diagnostics.failedRequests.length&&exhausted);
  const reason=!remaining?'target_reached':stopReason|| (failedBeforeExhaustion?'provider_unavailable':exhausted?'source_exhausted':'request_budget_reached');
  const target={requested:input.limit,returned:selected.length,remaining,status:remaining?(selected.length?'partial':'empty'):'complete',reason,canContinue:Boolean(remaining&&reason!=='source_exhausted')};
  const notice=selected.length?`${selected.length} named ${selected.length===1?'prospect matches':'prospects match'} the audience, industry, and location in indexed search evidence. Employer evidence is linked where used. They are not verified customers, contacts, or buyers; buying intent and private contact details are not assumed. Confirm current details and private ownership on each original source before outreach.`:`Search checked ${diagnostics.providerResults} results but found no named private-sector prospects with evidence for all your filters. ${candidates.length?'Relevant source pages are available to inspect. ':''}Results are never filled with invented people.`;
  const endings={source_exhausted:'The available source queries were exhausted.',request_budget_reached:'The request budget was reached.',daily_budget_reached:'The daily source-search budget was reached.',time_budget_reached:'The search time limit was reached.',budget_unavailable:'Search budget controls became unavailable; no further provider requests were sent.',provider_unavailable:'The search provider became unavailable.',provider_credits_exhausted:'The provider has no free search credits available; no further requests were sent.'};
  const shortfall=remaining?` Requested ${input.limit}; found ${selected.length}; ${remaining} still needed with the original filters. ${endings[reason]||'The search stopped.'}`:'';
  const researchTriage=buildResearchTriage({input,people:selected,candidates,diagnostics,requestsUsed});
  return {configured:true,provider,requestsUsed,requested:input.limit,returned:selected.length,candidates:candidates.slice(0,input.limit),people:selected,diagnostics,target,...researchTriage,notice:notice+shortfall+(diagnostics.partial?remaining?' One search request failed; the available results are shown. Retry to complete the search.':' One search request failed; the requested count was reached using the available results.':'')};
}
