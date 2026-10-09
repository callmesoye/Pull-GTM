import {personFromSource} from './person-evidence.js';

const blockHost=/(^|\.)(gov|gouv|gc|go|edu|ac|mil)\.[a-z.]+$/i;
const blockWords=/\b(government|ministry|public university|state university|federal university|public school|public institution|state-owned|government-owned|civil service|regulator|commission|registry|parliament|municipal|council|national assembly)\b/i;
const privateEvidence=/\b(privately[- ]owned|private[- ]sector|private (business|company|companies|school|schools|clinic|hospital|practice|car dealership|dealership|agency)|independent (business|professional|consultant|trader)|self[- ]employed|sole proprietor)\b/i;
const strip=value=>String(value??'').trim().replace(/\s+/g,' ');
const stopWords=new Set(['a','an','and','are','at','by','for','from','in','is','near','of','on','or','the','to','with','who','want','need','buyers','people','business','businesses','private','company','companies']);
const singular=word=>word.length>4&&word.endsWith('ies')?word.slice(0,-3)+'y':word.length>4&&word.endsWith('s')&&!word.endsWith('ss')?word.slice(0,-1):word;
const words=value=>[...new Set((strip(value).toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(word=>!stopWords.has(word)).map(singular))];
const textWords=value=>new Set((strip(value).toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{3,}/gu)||[]).map(singular));
const matchingTerms=(text,query)=>{
  const groups=String(query).split(',').map(words).filter(group=>group.length);
  return groups.find(group=>group.every(word=>text.has(word)))||[];
};

export function assessSourceRelevance(page,input) {
  const text=textWords([page.title,page.description].join(' '));
  const dimensions=[['Audience',input.audience],['Industry or need',input.industry],['Location',input.location]];
  const matched=[],missing=[];
  for(const [label,query] of dimensions){
    const hits=matchingTerms(text,query);
    if(hits.length)matched.push({label,terms:hits});else missing.push(label);
  }
  const source=strip(input.source).toLowerCase();
  const sourceMatched=source&&[page.source,page.title,page.description].some(value=>String(value).toLowerCase().includes(source));
  if(source&&sourceMatched)matched.push({label:'Preferred source',terms:[source]});
  if(source&&!sourceMatched)missing.push('Preferred source');
  const topic=matched.some(item=>item.label==='Audience'||item.label==='Industry or need');
  const score=(matched.some(item=>item.label==='Audience')?3:0)+(matched.some(item=>item.label==='Industry or need')?3:0)+(matched.some(item=>item.label==='Location')?2:0)+(sourceMatched?2:0);
  return {eligible:topic,score,matched,missing,reason:matched.map(item=>`${item.label}: ${item.terms.join(', ')}`).join(' · ')||'No search terms confirmed in the source excerpt'};
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
  if(blockWords.test([input.audience,input.source].join(' '))||/(^|[/.])(gov|gouv|mil|edu)(\.|\/|$)/i.test(input.source))throw new Error('Choose a private business, independent professional, or private-sector opportunity.');
  const limit=Number(body.limit||30);
  if(!Number.isInteger(limit)||limit<1||limit>50)throw new Error('Choose between 1 and 50 candidates.');
  return {...input,limit};
}

export function privateSourcePage(row) {
  try {
    const url=new URL(row.url);
    if(url.protocol!=='https:'||url.username||url.password||blockHost.test(url.hostname)||/\.(gov|mil|edu)(\.|$)/i.test(url.hostname))return null;
    const title=strip(row.title).slice(0,180),description=strip(row.description).slice(0,420);
    if(!title||blockWords.test(title+' '+description+' '+url.hostname))return null;
    if(!privateEvidence.test(title+' '+description))return null;
    return {title,url:url.href,description,source:url.hostname};
  }catch{return null;}
}

export async function discoverPrivatePages(input,{key,provider='brave',maxQueries=2,transport=fetch}={}) {
  if(!key)return {configured:false,candidates:[],people:[],notice:'Live prospect discovery needs a search-provider key. Your imported list and local audience review still work.'};
  if(!['brave','serper'].includes(provider))throw new Error('Choose a supported search provider in the server settings.');
  if(!Number.isInteger(maxQueries)||maxQueries<1||maxQueries>3)throw new Error('Choose a request budget between 1 and 3.');
  const queries=[
    [input.audience,input.industry,input.location,input.source,'private business'].filter(Boolean).join(' '),
    [input.industry,input.audience,input.location,'private company'].filter(Boolean).join(' '),
    [input.industry,input.location,input.audience,'independent business'].filter(Boolean).join(' ')
  ];
  const seen=new Set(),candidates=[];
  let requestsUsed=0;
  for(const q of queries.slice(0,maxQueries)) {
    const endpoint=new URL(provider==='serper'?'https://google.serper.dev/search':'https://api.search.brave.com/res/v1/web/search');
    endpoint.searchParams.set('q',q.slice(0,500));
    endpoint.searchParams.set(provider==='serper'?'num':'count',String(Math.min(input.limit,20)));
    if(provider==='brave')endpoint.searchParams.set('safesearch','strict');
    const headers=provider==='serper'?{'X-API-KEY':key,'Content-Type':'application/json','Accept':'application/json'}:{'X-Subscription-Token':key,'Accept':'application/json'};
    requestsUsed++;
    const response=await transport(endpoint,{method:provider==='serper'?'POST':'GET',headers,signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)throw new Error(response.status===429?'Search limit reached. Try again later.':'Source search is temporarily unavailable.');
    const data=await response.json();
    const rawRows=provider==='serper'?data?.organic:data?.web?.results;
    if(rawRows!==undefined&&!Array.isArray(rawRows))throw new Error('The search provider returned an unexpected result.');
    const rows=provider==='serper'?(rawRows||[]).map(row=>({title:row?.title,url:row?.link,description:row?.snippet})):rawRows||[];
    for(const row of rows) {
      const candidate=privateSourcePage(row);
      if(candidate&&!seen.has(candidate.url)){
        seen.add(candidate.url);
        const assessment=assessSourceRelevance(candidate,input);
        if(assessment.eligible)candidates.push({...candidate,relevance:assessment.score,matched:assessment.matched,missing:assessment.missing,reason:assessment.reason});
      }
    }
  }
  candidates.sort((a,b)=>b.relevance-a.relevance||a.title.localeCompare(b.title));
  const people=candidates.map(candidate=>personFromSource(candidate,assessSourceRelevance(candidate,input))).filter(Boolean).sort((a,b)=>b.relevance-a.relevance||a.name.localeCompare(b.name)).slice(0,input.limit);
  return {configured:true,provider,requestsUsed,candidates:candidates.slice(0,input.limit),people,notice:'Named people are extracted only when a source explicitly states their name, role, and company. They are not verified customers, contacts, or buyers. Open each source and confirm current identity, location, and private-sector status before outreach. Unrelated or public-sector pages are excluded.'};
}
