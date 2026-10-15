import {personFromSource,parseSourceIdentity} from './person-evidence.js';
import {canonicalProfile} from '../dist/prospect-records.js';

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
  return source?[base+' '+source,base+' '+source,base+' '+source]:[base,base+' site:linkedin.com/in/',base+' leadership team'];
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
  else if(response.status===402){code='CREDITS_EXHAUSTED';description='The search-provider account has no search credits. Add credits or replace the server key.';}
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
  const provider=env.PULL_SEARCH_PROVIDER||(env.SERPER_API_KEY?'serper':'brave');
  if(!['serper','brave'].includes(provider))return null;
  const key=strip(provider==='serper'?env.SERPER_API_KEY:env.BRAVE_SEARCH_API_KEY);
  if(!key)return null;
  const requested=Number(env.PULL_SEARCH_MAX_QUERIES||2);
  return {provider,key,maxQueries:Number.isInteger(requested)&&requested>=1&&requested<=3?requested:2};
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

export function privateSourcePage(row) {
  try {
    const url=new URL(row.url);
    if(url.protocol!=='https:'||url.username||url.password||blockHost.test(url.hostname)||/\.(gov|mil|edu)(\.|$)/i.test(url.hostname))return null;
    const title=strip(row.title).slice(0,240),description=strip(row.description).slice(0,900);
    if(!title||blockWords.test(title+' '+professionalDescription(description)+' '+url.hostname))return null;
    url.hash='';
    for(const key of [...url.searchParams.keys()])if(/^utm_|^(?:trk|trackingId|gclid|fbclid)$/i.test(key))url.searchParams.delete(key);
    const page={title,url:url.href,description,source:url.hostname};
    const identity=parseSourceIdentity(page);
    const basis=sectorEvidence(page,identity);
    if(!basis)return null;
    return {...page,private_sector_basis:basis};
  }catch{return null;}
}

// Used while retrieving and when assembling the result: progress counts only
// named people who satisfy the original filters, never topical source pages.
function personEvidence(candidate,input,assessment) {
  const person=personFromSource(candidate,assessment);
  if(!person)return {diagnostic:'missingIdentity'};
  if(!matchingTerms(textWords(person.title),input.audience).length||assessment.missing.some(label=>['Audience','Industry or need','Location','Preferred source'].includes(label)))return {diagnostic:'missingTargetEvidence'};
  const industryTerms=assessment.matched.find(item=>item.label==='Industry or need')?.terms||[];
  const industry=phraseIn(candidate.title+' '+professionalDescription(candidate.description),industryTerms.join(' '));
  if(!industry)return {diagnostic:'missingTargetEvidence'};
  return {person:{...person,industry,location:assessment.geography.location,country:assessment.geography.country,private_sector_basis:candidate.private_sector_basis}};
}

function personKeys(person) {
  const employer=strip(person.company).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\b(?:ltd|limited|llc|inc|incorporated|corp|corporation)\b/g,'').replace(/\s+/g,' ').trim();
  const name='name:'+strip(person.name).normalize('NFKC').toLowerCase()+'|'+employer;
  const profiles=[...new Set(['profile_url','linkedin_url','x_url','instagram_url','facebook_url'].map(field=>canonicalProfile(person[field])).filter(Boolean).map(url=>'profile:'+url))];
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

function retrievalQueries(input,provider) {
  const hasSource=Boolean(sourceConstraint(input.source));
  const sources=hasSource?strip(input.source).split(',').map(strip).filter(Boolean):[];
  const queries=hasSource?sources.map(source=>provider==='serper'?simpleDiscoveryQuery({...input,source}):discoveryQueries({...input,source})[0]):provider==='serper'?[
    simpleDiscoveryQuery(input,{profile:true}),simpleDiscoveryQuery(input,{leadership:true}),simpleDiscoveryQuery(input)
  ]:discoveryQueries(input);
  return [...new Set(queries.map(query=>query.slice(0,500)))].map(query=>({query,page:1,exhausted:false,seen:new Set()}));
}

export async function discoverPrivatePages(input,{key,provider='brave',maxQueries=2,transport=fetch}={}) {
  if(!key)return {configured:false,candidates:[],people:[],notice:'Live prospect discovery needs a search-provider key. Your imported list and local audience review still work.'};
  if(!['brave','serper'].includes(provider))throw new Error('Choose a supported search provider in the server settings.');
  if(!Number.isInteger(maxQueries)||maxQueries<1||maxQueries>3)throw new Error('Choose a request budget between 1 and 3.');
  const hasSource=Boolean(sourceConstraint(input.source)),queries=retrievalQueries(input,provider);
  // Keep the page size stable so provider pagination does not overlap or skip
  // results when the number of still-needed people changes between requests.
  const count=Math.min(Math.max(input.limit*3,10),provider==='serper'?50:20);
  const seen=new Set(),peopleIndex=new Map(),candidates=[],people=[],attempted=new Set();
  const diagnostics={providerResults:0,duplicateSources:0,duplicatePeople:0,ambiguousIdentity:0,excludedSectorOrSource:0,unrelatedSources:0,missingIdentity:0,missingTargetEvidence:0,failedRequests:[],partial:false};
  let requestsUsed=0,successfulRequests=0,restrictedError=null,active=queries[0],providerFailure=false;
  const nextQuery=()=>queries.find(query=>!query.exhausted&&!attempted.has(query.query+'|'+query.page));
  while(active&&requestsUsed<maxQueries&&people.length<input.limit) {
    const {query,page}=active,endpoint=new URL(provider==='serper'?'https://google.serper.dev/search':'https://api.search.brave.com/res/v1/web/search');
    if(provider==='brave'){
      endpoint.searchParams.set('q',query);endpoint.searchParams.set('count',String(count));endpoint.searchParams.set('safesearch','strict');
      if(page>1)endpoint.searchParams.set('offset',String(page-1));
    }
    const headers=provider==='serper'?{'X-API-KEY':key,'Content-Type':'application/json','Accept':'application/json'}:{'X-Subscription-Token':key,'Accept':'application/json'};
    attempted.add(query+'|'+page);requestsUsed++;
    let rows,moreResults;
    try {
      const response=await transport(endpoint,{method:provider==='serper'?'POST':'GET',headers,...(provider==='serper'?{body:JSON.stringify({q:query,num:count,...(page>1?{page}:{})})}:{}),signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!response.ok)throw await searchProviderError(response);
      const data=await response.json(),rawRows=provider==='serper'?data?.organic:data?.web?.results;
      if(rawRows!==undefined&&!Array.isArray(rawRows))throw new Error('The search provider returned an unexpected result.');
      rows=provider==='serper'?(rawRows||[]).map(row=>({title:row?.title,url:row?.link,description:[row?.snippet,row?.subtitle].filter(value=>typeof value==='string').map(strip).join(' · ')})):rawRows||[];
      moreResults=provider==='brave'?data?.query?.more_results_available:undefined;
      successfulRequests++;
    }catch(error){
      diagnostics.failedRequests.push({code:error.code||'PROVIDER_UNAVAILABLE',status:error.providerStatus||null});
      if(error.code==='QUERY_RESTRICTED'){
        restrictedError=error;diagnostics.partial=true;active.exhausted=true;
        const fallback=[simpleDiscoveryQuery({...input,source:''}),simpleDiscoveryQuery({...input,source:''},{leadership:true}),simpleDiscoveryQuery({...input,source:''},{profile:true})].find(q=>!attempted.has(q+'|1'));
        if(fallback){active={query:fallback,page:1,exhausted:false,seen:new Set(),fallback:true};queries.unshift(active);}else active=nextQuery();
        continue;
      }
      // Preserve usable evidence when a later provider request fails.
      if(!diagnostics.providerResults)throw error;
      diagnostics.partial=true;providerFailure=true;break;
    }
    diagnostics.providerResults+=rows.length;
    let freshRows=0;
    for(const row of rows) {
      const rawKey=strip(row?.url)||strip(row?.title);
      if(rawKey&&!active.seen.has(rawKey)){freshRows++;active.seen.add(rawKey);}
      const candidate=privateSourcePage(row);
      if(!candidate){diagnostics.excludedSectorOrSource++;continue;}
      if(seen.has(candidate.url)){diagnostics.duplicateSources++;continue;}
      seen.add(candidate.url);
      const assessment=assessSourceRelevance(candidate,input);
      if(!assessment.eligible){diagnostics.unrelatedSources++;continue;}
      candidates.push({...candidate,relevance:assessment.score,matched:assessment.matched,missing:assessment.missing,reason:assessment.reason});
      const extracted=personEvidence(candidate,input,assessment);
      if(!extracted.person){diagnostics[extracted.diagnostic]++;continue;}
      const identity=indexPerson(extracted.person,peopleIndex);
      if(identity==='duplicate'){diagnostics.duplicatePeople++;continue;}
      if(identity==='ambiguous'){diagnostics.ambiguousIdentity++;continue;}
      people.push(extracted.person);
    }
    if(!rows.length||!freshRows||moreResults===false)active.exhausted=true;
    else active.page++;
    if(people.length>=input.limit)break;
    // A chosen source owns its own pagination. Broad searches can try a
    // distinct query after a short page; full pages retain their next page.
    const alternative=queries.find(query=>query!==active&&!query.exhausted&&query.page===1&&!attempted.has(query.query+'|1'));
    const otherSource=hasSource&&!active.fallback?queries.find(query=>query!==active&&!query.exhausted&&!query.fallback&&query.page<=active.page):null;
    active=otherSource||(!active.exhausted&&(hasSource||active.fallback||rows.length>=count)?active:alternative||nextQuery());
  }
  if(!successfulRequests&&restrictedError)throw restrictedError;
  candidates.sort((a,b)=>b.relevance-a.relevance||a.title.localeCompare(b.title));
  people.sort((a,b)=>b.relevance-a.relevance||a.name.localeCompare(b.name));
  const selected=people.slice(0,input.limit),remaining=Math.max(0,input.limit-selected.length),exhausted=queries.every(query=>query.exhausted),failedBeforeExhaustion=Boolean(diagnostics.failedRequests.length&&exhausted);
  const target={requested:input.limit,returned:selected.length,remaining,status:remaining?(selected.length?'partial':'empty'):'complete',reason:!remaining?'target_reached':providerFailure||failedBeforeExhaustion?'provider_unavailable':exhausted?'source_exhausted':'request_budget_reached',canContinue:Boolean(remaining&&(!exhausted||providerFailure||failedBeforeExhaustion))};
  const notice=selected.length?`${selected.length} named ${selected.length===1?'prospect matches':'prospects match'} the audience, industry, and location in public search evidence. They are not verified customers, contacts, or buyers; buying intent and private contact details are not assumed. Confirm current details on each original source before outreach.`:`Search checked ${diagnostics.providerResults} results but found no named private-sector prospects with evidence for all your filters. ${candidates.length?'Relevant source pages are available to inspect. ':''}Results are never filled with invented people.`;
  const shortfall=remaining?` Requested ${input.limit}; found ${selected.length}; ${remaining} still needed with the original filters. ${target.reason==='source_exhausted'?'The available source queries were exhausted.':target.reason==='request_budget_reached'?'The request budget was reached.':'The search provider became unavailable.'}`:'';
  return {configured:true,provider,requestsUsed,requested:input.limit,returned:selected.length,candidates:candidates.slice(0,input.limit),people:selected,diagnostics,target,notice:notice+shortfall+(diagnostics.partial?remaining?' One search request failed; the available results are shown. Retry to complete the search.':' One search request failed; the requested count was reached using the available results.':'')};
}
