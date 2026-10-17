import {qualify,draftFor} from './engine.js';
import {validateWorkspace} from './workspace.js';
const KINDS=['audience_review','draft_suggestions'];
export function applyAutomation(workflow,workspace,at=new Date()) {
  const requestedReviews=new Set(workspace.shortlist||[]),payload=validateWorkspace(workspace,{now:at});
  if (!KINDS.includes(workflow.kind)) throw new Error('Unknown automation operation.');
  const evaluated=payload.prospects.map(p=>qualify(p,payload.rules,at));
  const counts={prospects:evaluated.length,matches:0,needs_evidence:0,excluded:0,drafts_created:0,existing_drafts:0,not_eligible:0,destination:workflow.destination??'none'};
  for (const p of evaluated) counts[{fit:'matches',review:'needs_evidence',excluded:'excluded'}[p.status]]++;
  if (workflow.kind==='draft_suggestions') {
    const reviewed=new Set(payload.shortlist);
    for (const p of evaluated.filter(p=>requestedReviews.has(p.id))) {
      if (p.status!=='fit' || p.suppressed || !reviewed.has(p.id)) { counts.not_eligible++; continue; }
      if (Object.hasOwn(payload.drafts,p.id)) { counts.existing_drafts++; continue; }
      const channel={linkedin:'personal',x:'x',instagram:'instagram',facebook:'facebook'}[workflow.destination]||'email';
      payload.drafts[p.id]={body:draftFor(p,payload.offer,payload.identity),subject:'A question for '+(p.company||p.name||'your team'),channel,ready:false};
      counts.drafts_created++;
    }
  }
  payload.audit.unshift({action:'Automation completed',detail:workflow.name+': '+(workflow.kind==='audience_review'?`${counts.matches} matches, ${counts.needs_evidence} need evidence, ${counts.excluded} excluded. No prospects approved.`:`${counts.drafts_created} template drafts added; ${counts.existing_drafts} existing drafts kept. Nothing sent.`),at:at.toISOString(),mode:payload.mode});
  return {payload,counts};
}
