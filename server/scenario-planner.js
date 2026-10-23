import {readFileSync} from 'node:fs';
import {buyerResearchInput} from './buyer-research.js';

const root=new URL('../research/scenario-lab/',import.meta.url);
const mechanisms=JSON.parse(readFileSync(new URL('mechanisms.json',root),'utf8'));
const mechanismById=new Map(mechanisms.map(m=>[m.id,m]));
const familySources={agriculture:['R001','R009','R003'],food:['R001','R080'],logistics:['R032','R006'],apparel:['R091','R093','R096'],retail:['R041','R021'],automotive:['R004','R081','R083'],construction:['R007'],energy:['R037','R008'],digital:['R037','R065','R006'],industry:['R089','R112'],services:['R032','R065'],healthcare:['R025','R029'],education:['R038'],creative:['R021','R065'],tourism:['R039','R041'],trade:['R032','R020','R067']};
const tokens=v=>String(v||'').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
const filler=new Set('fresh used new commercial private local registered licensed professional custom small bulk service services systems supply equipment premium of for and the with'.split(' '));
const clean=v=>String(v??'').normalize('NFKC').replace(/\s+/g,' ').trim();
let sector;
const cases=readFileSync(new URL('seeds.txt',root),'utf8').trim().split('\n').filter(Boolean).flatMap(line=>{
  if(line.startsWith('# ')){const [id,name,family]=line.slice(2).split('~');sector={id,name,family};return [];}
  const fields=line.split('~');if(fields.length!==7||!sector)throw new Error('Invalid seller scenario seed.');
  const [product,location,problem,buyerRole,trigger,bindingCheck,mechanismId]=fields;
  if(!mechanismById.has(mechanismId)||!familySources[sector.family])throw new Error('Unknown scenario mechanism or family.');
  return [{sector:{...sector},product,location,problem,buyerRole,trigger,bindingCheck,mechanismId,sourceIds:familySources[sector.family],status:'researched_hypothetical',buyerFindingOutcome:null}];
}).map((c,i)=>({...c,id:'S'+String(i+1).padStart(3,'0')}));

export function scenarioCatalog(){return structuredClone(cases);}
export function purchaseMechanisms(){return structuredClone(mechanisms);}
export function scenarioResearchPlan(scenario,offer){
  const m=mechanismById.get(scenario.mechanismId);
  if(!m||!offer?.fields?.product||!offer.fields.location||!offer.exactTerms?.length)throw new Error('Use a saved offer and known purchase mechanism.');
  const location=clean(offer.fields.location),term=clean(offer.exactTerms[0]),role=clean(scenario.buyerRole);
  const bounded=q=>{if(q.length>300)throw new Error('The planned query is too long.');return q;};
  const hypotheses=[
    {buyerType:'Explicit product requests',reason:'Find an original current request; product words alone do not prove fit.',route:'expressed_demand',keywords:[term],queries:[bounded(`${term} buying request ${location}`),bounded(`${term} seeking supplier ${location}`)]},
    {buyerType:role.slice(0,160),reason:('Proposed use: '+scenario.trigger+'; check '+scenario.bindingCheck).slice(0,400),route:'market_context',keywords:tokens(role).filter(w=>w.length>2).slice(0,4),queries:[bounded(`${term} ${role.slice(0,95)} ${location}`)]},
    {buyerType:'Authorized purchasing route',reason:'Identify an authorized private procurement or intermediary route; a directory record is not a buying request.',route:'intermediary',keywords:[term,'supplier'],queries:[bounded(`${term} private supplier intake ${location}`)]}
  ];
  const input=buyerResearchInput({product:offer.fields.product,location,productTerms:offer.exactTerms,limit:10,hypotheses});
  return {scenarioId:scenario.id,mechanism:{id:m.id,name:m.name,job:m.job},input,steps:m.steps,requiredProof:[m.proof,scenario.bindingCheck],gaps:m.gaps,
    directoryHandoff:m.directoryUseful?{status:'planned_not_executed',query:`${role} ${location}`,url:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(`${role} ${location}`),evidenceTier:'business_route_only',notice:'A business location does not establish current demand or contact permission. Follow provider terms and attribution; no map content is scraped or stored.'}:null,
    sourceIds:scenario.sourceIds,sourceScope:'Offline sector background only. These sources do not establish this buyer or request.',successMetric:m.metric,buyerConfirmed:false};
}

// Guidance selects whole product phrases after removing generic modifiers.
// An unmatched offer keeps its own research path. We never invent a matching
// scenario, expand its market, or treat the library as a populated buyer pool.
export function offerScenarioGuidance(offer){
  if(!offer?.fields?.product||!offer.fields.location||!offer.exactTerms?.length)return null;
  const offered=new Set(tokens(offer.fields.product));
  const matching=cases.map(c=>({c,core:tokens(c.product).filter(w=>!filler.has(w))})).filter(({core})=>core.length&&core.every(w=>offered.has(w))).sort((a,b)=>b.core.length-a.core.length||a.c.id.localeCompare(b.c.id)).slice(0,2);
  if(!matching.length)return {version:1,status:'no_specific_case',notice:'No case phrase matched. Reason from the actual confirmed offer; do not substitute a case product or market.',buyerConfirmed:false};
  return {version:1,status:'hypothesis_guidance',offerReference:{id:offer.id,version:offer.version},cases:matching.map(({c})=>{
    const m=mechanismById.get(c.mechanismId);
    return {scenarioId:c.id,proposedBuyerRole:c.buyerRole,conditionalTrigger:c.trigger,requiredChecks:c.bindingCheck,mechanism:m.name,steps:m.steps,gaps:m.gaps};
  }),notice:'Original hypothetical scenario guidance. Roles and triggers require live investigation and buyer confirmation. The confirmed seller product, location and budget remain authoritative.',buyerConfirmed:false};
}
