import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {scenarioCatalog,purchaseMechanisms,scenarioResearchPlan} from '../server/scenario-planner.js';
import {assessPrecisionPilot,assessBuyerFindingPilot} from '../server/pilot-release-gates.js';

export async function compileScenarioLab(){
  const root=new URL('../research/scenario-lab/',import.meta.url);
  const sources=JSON.parse(await readFile(new URL('sources.json',root),'utf8'));
  const stress=JSON.parse(await readFile(new URL('stress.json',root),'utf8'));
  const actions=JSON.parse(await readFile(new URL('gap-actions.json',root),'utf8'));
  const cases=scenarioCatalog().map(c=>({...c,plan:scenarioResearchPlan(c,{id:'scenario-'+c.id,version:1,fields:{product:c.product,location:c.location},exactTerms:[c.product]})}));
  const gapCounts=new Map();for(const c of cases)for(const gap of c.plan.gaps)gapCounts.set(gap,(gapCounts.get(gap)||0)+1);
  return {version:1,researchCheckedAt:'2026-10-23',method:'520 original research-grounded hypothetical seller cases plus 10 adversarial stress cases; background sources are not proof of an individual buyer, local event or successful outcome.',
    scope:{sellerCases:cases.length,stressCases:stress.length,sectors:new Set(cases.map(c=>c.sector.id)).size,mechanisms:purchaseMechanisms().length,sources:sources.length,verifiedBuyers:0,liveBuyerFindingRate:null,livePrecision:null,targetPrecision:.98},
    cases,stress,mechanisms:purchaseMechanisms(),sources,gaps:[...gapCounts].map(([gap,affectedCases])=>({gap,affectedCases,...actions[gap]})).sort((a,b)=>b.affectedCases-a.affectedCases),precisionReview:assessPrecisionPilot([]),buyerFindingReview:assessBuyerFindingPilot([],{asOf:'2026-10-23'})};
}

const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const lab=await compileScenarioLab(),out=new URL('../artifacts/scenario-lab/',import.meta.url);await mkdir(out,{recursive:true});
  await writeFile(new URL('scenario-lab.json',out),JSON.stringify(lab,null,2)+'\n');
  const columns=['id','sector','product','location','problem','buyerRole','conditionalTrigger','bindingChecks','mechanism','researchQueries','businessDirectoryHandoff','requiredProof','metric','sourceIds','status'];
  const rows=lab.cases.map(c=>[c.id,c.sector.name,c.product,c.location,c.problem,c.buyerRole,c.trigger,c.bindingCheck,c.plan.mechanism.name,c.plan.input.hypotheses.flatMap(h=>h.queries).join(' | '),c.plan.directoryHandoff?.url||'',c.plan.requiredProof.join(' | '),c.plan.successMetric,c.sourceIds.join(', '),c.status]);
  await writeFile(new URL('seller-cases.csv',out),[columns,...rows].map(r=>r.map(csv).join(',')).join('\r\n')+'\r\n');
  console.log(JSON.stringify(lab.scope));
}
