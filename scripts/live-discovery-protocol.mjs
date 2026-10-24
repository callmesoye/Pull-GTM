import {scenarioCatalog} from '../server/scenario-planner.js';

// Public-web investigation tasks, not seller or buyer records. The full
// location remains explicit. We search a downstream buying use rather than
// assume a product listing identifies somebody who wants to purchase it.
export function liveDiscoveryTasks(){
  const ignored=new Set('private independent commercial licensed qualified registered authorized verified opted in adult purchasing procurement manager lead officer coordinator owner team who with a an the and for of actual confirmed current'.split(' '));
  return scenarioCatalog().map(c=>{
    const role=c.buyerRole.split(/\s+/).filter(w=>!ignored.has(w.toLowerCase())).join(' ').slice(0,100);
    return {caseId:c.id,product:c.product,location:c.location,buyerRole:c.buyerRole,conditionalTrigger:c.trigger,requiredChecks:c.bindingCheck,mechanismId:c.mechanismId,
      query:`${c.product} ${role} ${c.location}`.replace(/\s+/g,' ').trim(),
      researchQuestion:'Can public sources identify a plausible business use or buying route for this offer in this explicit place?',
      sourceRequirement:'Current buying need, full fit and authority require original-source review and buyer confirmation.',buyerConfirmed:false};
  });
}
