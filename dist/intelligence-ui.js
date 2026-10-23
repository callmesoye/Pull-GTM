import {safeUrl} from './engine.js';

export function renderResearchResults(results,messageIndex,e){
  if(!Array.isArray(results))return '';
  return results.map((r,index)=>{
    if(r?.type==='buyer_research'){
      const sources=Array.isArray(r.opportunities)?r.opportunities:[],coverage=r.coverage||{},labels={possible_request:'Possible buying request',buying_route:'Intermediary route',market_context:'Market context'};
      return `<section class="ai-research-result"><span class="section-kicker">PRODUCT RESEARCH</span><h3>${sources.length} sources to investigate</h3><p class="small-print">${e(r.notice||'Research sources, not confirmed buyers.')}</p><p class="small-print">${e(coverage.completedQueries??0)} of ${e(coverage.plannedQueries??0)} planned searches completed. ${e(coverage.status||'Coverage unknown')}.</p>${sources.length?`<details><summary>Review the findings</summary><ul>${sources.map(p=>{const url=safeUrl(p.source_url);return `<li><strong>${e(p.title)}</strong><span>${e(labels[p.kind]||'Research source')}</span><p>${e(p.source_excerpt)}</p><p>${e(p.next_step)}</p><span>Still to check: ${e((Array.isArray(p.missing)?p.missing:[]).join(', '))}</span>${url?`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">Check original source ↗</a>`:'Source unavailable'}</li>`;}).join('')}</ul></details>`:''}<p class="small-print">No buyers were confirmed or added. No messages were sent.</p></section>`;
    }
    const people=Array.isArray(r.people)?r.people:[],target=r.target||{};
    const sourceLink=p=>{const url=safeUrl(p.source_url);return url?`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">View source ↗</a>`:'Source unavailable';};
    return `<section class="ai-research-result"><span class="section-kicker">LIVE SOURCE RESEARCH</span><h3>${people.length} of ${e(target.requested??r.requested??people.length)} requested prospects</h3><p class="small-print">${e(r.notice||'Source-asserted matches. Review the evidence before outreach.')}</p>${people.length?`<details><summary>View the prospects and sources</summary><ul>${people.map((p,personIndex)=>`<li><button class="ai-opportunity-link" data-ai-opportunity="${messageIndex}:${index}:${personIndex}"><strong>${e(p.name)}</strong><span aria-hidden="true">↗</span></button><span>${e([p.title,p.company,p.location].filter(Boolean).join(' · '))}</span>${sourceLink(p)}</li>`).join('')}</ul></details><button class="button secondary small" data-ai-research="${messageIndex}:${index}">Add ${people.length} to Buyers for review</button>`:''}</section>`;
  }).join('');
}

export function renderIntelligenceActions(actions,e){
  const workflows=(Array.isArray(actions)?actions:[]).filter(a=>a?.type==='workflows').flatMap(a=>a.workflows||[]);
  return workflows.length?`<section class="ai-research-result"><h3>Your available workflows</h3><ul>${workflows.map(w=>`<li><strong>${e(w.name)}</strong><span>${e(w.kind==='draft_suggestions'?'Prepare editable drafts':'Review audience fit')}</span></li>`).join('')}</ul><button class="button secondary small" data-view="automations">Review in Automations</button><p class="small-print">No workflow has run. Your approval is required.</p></section>`:'';
}
